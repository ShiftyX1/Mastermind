const { Ollama } = require("ollama");
const { getSystemPrompt } = require("./prompts");
const {
  sendToRenderer,
  initializeNewSession,
  saveConversationTurn,
} = require("./gemini");
const { fork } = require("child_process");
const path = require("path");
const { getSystemNode } = require("./nodeDetect");

// ── State ──

let ollamaClient = null;
let ollamaModel = null;
let whisperWorker = null;
let isWhisperLoading = false;
let whisperReady = false;
let localConversationHistory = [];
let currentSystemPrompt = null;
let isLocalActive = false;

// Set when we intentionally kill the worker to suppress crash handling
let whisperShuttingDown = false;

// Pending transcription callback (one at a time)
let pendingTranscribe = null;

// VAD state
let isSpeaking = false;
let speechBuffers = [];
let silenceFrameCount = 0;
let speechFrameCount = 0;

// VAD configuration
const VAD_MODES = {
  NORMAL: {
    energyThreshold: 0.01,
    speechFramesRequired: 3,
    silenceFramesRequired: 30,
  },
  LOW_BITRATE: {
    energyThreshold: 0.008,
    speechFramesRequired: 4,
    silenceFramesRequired: 35,
  },
  AGGRESSIVE: {
    energyThreshold: 0.015,
    speechFramesRequired: 2,
    silenceFramesRequired: 20,
  },
  VERY_AGGRESSIVE: {
    energyThreshold: 0.02,
    speechFramesRequired: 2,
    silenceFramesRequired: 15,
  },
};
let vadConfig = VAD_MODES.VERY_AGGRESSIVE;

// Maximum speech buffer size: ~30 seconds at 16kHz, 16-bit mono
const MAX_SPEECH_BUFFER_BYTES = 16000 * 2 * 30; // 960,000 bytes

// Audio resampling buffer
let resampleRemainder = Buffer.alloc(0);

// ── Audio Resampling (24kHz → 16kHz) ──

function resample24kTo16k(inputBuffer) {
  // Combine with any leftover samples from previous call
  const combined = Buffer.concat([resampleRemainder, inputBuffer]);
  const inputSamples = Math.floor(combined.length / 2); // 16-bit = 2 bytes per sample
  // Ratio: 16000/24000 = 2/3, so for every 3 input samples we produce 2 output samples
  const outputSamples = Math.floor((inputSamples * 2) / 3);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    // Map output sample index to input position
    const srcPos = (i * 3) / 2;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    const s0 = combined.readInt16LE(srcIndex * 2);
    const s1 =
      srcIndex + 1 < inputSamples
        ? combined.readInt16LE((srcIndex + 1) * 2)
        : s0;
    const interpolated = Math.round(s0 + frac * (s1 - s0));
    outputBuffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, interpolated)),
      i * 2,
    );
  }

  // Store remainder for next call
  const consumedInputSamples = Math.ceil((outputSamples * 3) / 2);
  const remainderStart = consumedInputSamples * 2;
  resampleRemainder =
    remainderStart < combined.length
      ? combined.slice(remainderStart)
      : Buffer.alloc(0);

  return outputBuffer;
}

// ── VAD (Voice Activity Detection) ──

function calculateRMS(pcm16Buffer) {
  const samples = pcm16Buffer.length / 2;
  if (samples === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples; i++) {
    const sample = pcm16Buffer.readInt16LE(i * 2) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples);
}

function processVAD(pcm16kBuffer) {
  const rms = calculateRMS(pcm16kBuffer);
  const isVoice = rms > vadConfig.energyThreshold;

  if (isVoice) {
    speechFrameCount++;
    silenceFrameCount = 0;

    if (!isSpeaking && speechFrameCount >= vadConfig.speechFramesRequired) {
      isSpeaking = true;
      speechBuffers = [];
      console.log("[LocalAI] Speech started (RMS:", rms.toFixed(4), ")");
      sendToRenderer("update-status", "Listening... (speech detected)");
    }
  } else {
    silenceFrameCount++;
    speechFrameCount = 0;

    if (isSpeaking && silenceFrameCount >= vadConfig.silenceFramesRequired) {
      isSpeaking = false;
      console.log(
        "[LocalAI] Speech ended, accumulated",
        speechBuffers.length,
        "chunks",
      );
      sendToRenderer("update-status", "Transcribing...");

      // Trigger transcription with accumulated audio
      const audioData = Buffer.concat(speechBuffers);
      speechBuffers = [];
      handleSpeechEnd(audioData).catch((err) => {
        console.error("[LocalAI] handleSpeechEnd crashed:", err);
        sendToRenderer(
          "update-status",
          "Transcription error: " + (err?.message || "unknown"),
        );
      });
      return;
    }
  }

  // Accumulate audio during speech
  if (isSpeaking) {
    speechBuffers.push(Buffer.from(pcm16kBuffer));

    // Cap buffer at ~30 seconds to prevent OOM and ONNX tensor overflow
    const totalBytes = speechBuffers.reduce((sum, b) => sum + b.length, 0);
    if (totalBytes >= MAX_SPEECH_BUFFER_BYTES) {
      isSpeaking = false;
      console.log(
        "[LocalAI] Speech buffer limit reached (" +
          totalBytes +
          " bytes), forcing transcription",
      );
      sendToRenderer("update-status", "Transcribing (max length reached)...");
      const audioData = Buffer.concat(speechBuffers);
      speechBuffers = [];
      silenceFrameCount = 0;
      speechFrameCount = 0;
      handleSpeechEnd(audioData).catch((err) => {
        console.error("[LocalAI] handleSpeechEnd crashed:", err);
        sendToRenderer(
          "update-status",
          "Transcription error: " + (err?.message || "unknown"),
        );
      });
    }
  }
}

// ── Whisper Worker (isolated child process) ──

function spawnWhisperWorker() {
  if (whisperWorker) return;

  const workerPath = path.join(__dirname, "whisperWorker.js");
  console.log("[LocalAI] Spawning Whisper worker:", workerPath);

  // Determine the best way to spawn the worker:
  //   1. System Node.js (preferred) — native addons were compiled against this
  //      ABI, so onnxruntime-node works without SIGTRAP / ABI mismatches.
  //   2. Electron utilityProcess (packaged builds) — proper Node.js child
  //      process API that doesn't require the RunAsNode fuse.
  //   3. ELECTRON_RUN_AS_NODE (last resort, dev only) — the old approach that
  //      only works when the RunAsNode fuse isn't flipped.

  const systemNode = getSystemNode();

  if (systemNode) {
    // Spawn with system Node.js — onnxruntime-node native binary matches ABI
    console.log("[LocalAI] Using system Node.js:", systemNode.nodePath);
    whisperWorker = fork(workerPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execPath: systemNode.nodePath,
      env: {
        ...process.env,
        // Unset ELECTRON_RUN_AS_NODE so the system node doesn't inherit it
        ELECTRON_RUN_AS_NODE: undefined,
      },
    });
  } else {
    // No system Node.js found — try utilityProcess (Electron >= 22)
    // utilityProcess.fork() creates a proper child Node.js process without
    // needing the RunAsNode fuse.  Falls back to ELECTRON_RUN_AS_NODE for
    // dev mode where fuses aren't applied.
    try {
      const { utilityProcess: UP } = require("electron");
      if (UP && typeof UP.fork === "function") {
        console.log("[LocalAI] Using Electron utilityProcess");
        const up = UP.fork(workerPath);
        // Wrap utilityProcess to look like a ChildProcess for the rest of localai.js
        whisperWorker = wrapUtilityProcess(up);
        return;
      }
    } catch (_) {
      // utilityProcess not available (older Electron or renderer context)
    }

    console.warn(
      "[LocalAI] No system Node.js — falling back to ELECTRON_RUN_AS_NODE (WASM backend will be used)",
    );
    whisperWorker = fork(workerPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
  }

  whisperWorker.stdout.on("data", (data) => {
    console.log("[WhisperWorker stdout]", data.toString().trim());
  });
  whisperWorker.stderr.on("data", (data) => {
    console.error("[WhisperWorker stderr]", data.toString().trim());
  });

  whisperWorker.on("message", (msg) => {
    switch (msg.type) {
      case "ready":
        console.log("[LocalAI] Whisper worker ready");
        break;
      case "load-result":
        handleWorkerLoadResult(msg);
        break;
      case "transcribe-result":
        handleWorkerTranscribeResult(msg);
        break;
      case "status":
        sendToRenderer("update-status", msg.message);
        break;
      case "progress":
        sendToRenderer("whisper-progress", {
          file: msg.file,
          progress: msg.progress,
          loaded: msg.loaded,
          total: msg.total,
          status: msg.status,
        });
        break;
    }
  });

  whisperWorker.on("exit", (code, signal) => {
    console.error(
      "[LocalAI] Whisper worker exited — code:",
      code,
      "signal:",
      signal,
    );
    whisperWorker = null;
    whisperReady = false;

    // If we intentionally shut down, don't treat as crash
    if (whisperShuttingDown) {
      whisperShuttingDown = false;
      return;
    }

    // Reject any pending transcription
    if (pendingTranscribe) {
      pendingTranscribe.reject(
        new Error(
          "Whisper worker crashed (code: " + code + ", signal: " + signal + ")",
        ),
      );
      pendingTranscribe = null;
    }

    // If session is still active, inform the user and respawn
    if (isLocalActive) {
      sendToRenderer(
        "update-status",
        "Whisper crashed (signal: " +
          (signal || code) +
          "). Respawning worker...",
      );
      setTimeout(() => {
        if (isLocalActive) {
          respawnWhisperWorker();
        }
      }, 2000);
    }
  });

  whisperWorker.on("error", (err) => {
    console.error("[LocalAI] Whisper worker error:", err);
    whisperWorker = null;
    whisperReady = false;
  });
}

/**
 * Wrap Electron's utilityProcess to behave like a ChildProcess (duck-typing)
 * so the rest of localai.js can use the same API.
 */
function wrapUtilityProcess(up) {
  const EventEmitter = require("events");
  const wrapper = new EventEmitter();

  // Forward messages
  up.on("message", (msg) => wrapper.emit("message", msg));

  // Map utilityProcess exit to ChildProcess-like exit event
  up.on("exit", (code) => wrapper.emit("exit", code, null));

  // Provide stdout/stderr stubs (utilityProcess pipes to parent console)
  const { Readable } = require("stream");
  wrapper.stdout = new Readable({ read() {} });
  wrapper.stderr = new Readable({ read() {} });

  wrapper.send = (data) => up.postMessage(data);
  wrapper.kill = (signal) => up.kill();
  wrapper.removeAllListeners = () => {
    up.removeAllListeners();
    EventEmitter.prototype.removeAllListeners.call(wrapper);
  };

  // Setup stdout/stderr forwarding
  wrapper.stdout.on("data", (data) => {
    console.log("[WhisperWorker stdout]", data.toString().trim());
  });
  wrapper.stderr.on("data", (data) => {
    console.error("[WhisperWorker stderr]", data.toString().trim());
  });

  return wrapper;
}

let pendingLoad = null;

function handleWorkerLoadResult(msg) {
  if (msg.success) {
    console.log(
      "[LocalAI] Whisper model loaded successfully (in worker, device:",
      msg.device || "unknown",
      ")",
    );
    whisperReady = true;
    sendToRenderer("whisper-downloading", false);
    isWhisperLoading = false;
    if (pendingLoad) {
      pendingLoad.resolve(true);
      pendingLoad = null;
    }
  } else {
    console.error("[LocalAI] Whisper worker failed to load model:", msg.error);
    sendToRenderer("whisper-downloading", false);
    sendToRenderer(
      "update-status",
      "Failed to load Whisper model: " + msg.error,
    );
    isWhisperLoading = false;
    if (pendingLoad) {
      pendingLoad.resolve(false);
      pendingLoad = null;
    }
  }
}

function handleWorkerTranscribeResult(msg) {
  if (!pendingTranscribe) return;
  if (msg.success) {
    console.log("[LocalAI] Transcription:", msg.text);
    pendingTranscribe.resolve(msg.text || null);
  } else {
    console.error("[LocalAI] Worker transcription error:", msg.error);
    pendingTranscribe.resolve(null);
  }
  pendingTranscribe = null;
}

function respawnWhisperWorker() {
  killWhisperWorker();
  spawnWhisperWorker();
  const { app } = require("electron");
  const cacheDir = path.join(app.getPath("userData"), "whisper-models");
  const modelName =
    require("../storage").getPreferences().whisperModel ||
    "Xenova/whisper-small";
  sendToRenderer("whisper-downloading", true);
  isWhisperLoading = true;
  const device = resolveWhisperDevice();
  whisperWorker.send({ type: "load", modelName, cacheDir, device });
}

/**
 * Determine which ONNX backend to use for Whisper inference.
 * - "cpu"  → onnxruntime-node (fast, native — requires matching ABI)
 * - "wasm" → onnxruntime-web  (slower but universally compatible)
 *
 * When spawned with system Node.js, native CPU backend is safe.
 * Otherwise default to WASM to prevent native crashes.
 */
function resolveWhisperDevice() {
  const prefs = require("../storage").getPreferences();
  if (prefs.whisperDevice) return prefs.whisperDevice;
  // Auto-detect: if we're running with system Node.js, native is safe
  const systemNode = getSystemNode();
  return systemNode ? "cpu" : "wasm";
}

/**
 * Map the app's BCP-47 language tag (e.g. "en-US", "ru-RU") to the
 * ISO 639-1 code that Whisper expects (e.g. "en", "ru").
 * Returns "auto" when the user selected auto-detect, which tells the
 * worker to let Whisper detect the language itself.
 */
function resolveWhisperLanguage() {
  const prefs = require("../storage").getPreferences();
  const lang = prefs.selectedLanguage || "en-US";
  if (lang === "auto") return "auto";
  // BCP-47: primary subtag is the ISO 639 code
  // Handle special case: "cmn-CN" → "zh" (Mandarin Chinese → Whisper uses "zh")
  const primary = lang.split("-")[0].toLowerCase();
  const WHISPER_LANG_MAP = {
    cmn: "zh",
    yue: "zh",
  };
  return WHISPER_LANG_MAP[primary] || primary;
}

function killWhisperWorker() {
  if (whisperWorker) {
    whisperShuttingDown = true;
    try {
      whisperWorker.removeAllListeners();
      whisperWorker.kill();
    } catch (_) {
      // Already dead
    }
    whisperWorker = null;
    whisperReady = false;
  }
}

async function loadWhisperPipeline(modelName) {
  if (whisperReady) return true;
  if (isWhisperLoading) return null;

  isWhisperLoading = true;
  console.log("[LocalAI] Loading Whisper model via worker:", modelName);
  sendToRenderer("whisper-downloading", true);
  sendToRenderer(
    "update-status",
    "Loading Whisper model (first time may take a while)...",
  );

  spawnWhisperWorker();

  const { app } = require("electron");
  const cacheDir = path.join(app.getPath("userData"), "whisper-models");

  const device = resolveWhisperDevice();
  console.log("[LocalAI] Whisper device:", device);

  return new Promise((resolve) => {
    pendingLoad = { resolve };
    whisperWorker.send({ type: "load", modelName, cacheDir, device });
  });
}

async function transcribeAudio(pcm16kBuffer) {
  if (!whisperReady || !whisperWorker) {
    console.error("[LocalAI] Whisper worker not ready");
    return null;
  }

  if (!pcm16kBuffer || pcm16kBuffer.length < 2) {
    console.error("[LocalAI] Invalid audio buffer:", pcm16kBuffer?.length);
    return null;
  }

  console.log(
    "[LocalAI] Starting transcription, audio length:",
    pcm16kBuffer.length,
    "bytes",
  );

  // Send audio to worker as base64 (IPC serialization)
  const audioBase64 = pcm16kBuffer.toString("base64");

  return new Promise((resolve, reject) => {
    // Timeout: if worker takes > 60s, assume it's stuck
    const timeout = setTimeout(() => {
      console.error("[LocalAI] Transcription timed out after 60s");
      if (pendingTranscribe) {
        pendingTranscribe = null;
        resolve(null);
      }
    }, 60000);

    pendingTranscribe = {
      resolve: (val) => {
        clearTimeout(timeout);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    };

    try {
      whisperWorker.send({
        type: "transcribe",
        audioBase64,
        language: resolveWhisperLanguage(),
      });
    } catch (err) {
      clearTimeout(timeout);
      pendingTranscribe = null;
      console.error("[LocalAI] Failed to send to worker:", err);
      resolve(null);
    }
  });
}

// ── Speech End Handler ──

async function handleSpeechEnd(audioData) {
  if (!isLocalActive) return;

  // Minimum audio length check (~0.5 seconds at 16kHz, 16-bit)
  if (audioData.length < 16000) {
    console.log("[LocalAI] Audio too short, skipping");
    sendToRenderer("update-status", "Listening...");
    return;
  }

  console.log("[LocalAI] Processing audio:", audioData.length, "bytes");

  try {
    const transcription = await transcribeAudio(audioData);

    if (
      !transcription ||
      transcription.trim() === "" ||
      transcription.trim().length < 2
    ) {
      console.log("[LocalAI] Empty transcription, skipping");
      sendToRenderer("update-status", "Listening...");
      return;
    }

    sendToRenderer("update-status", "Generating response...");
    await sendToOllama(transcription);
  } catch (error) {
    console.error("[LocalAI] handleSpeechEnd error:", error);
    sendToRenderer(
      "update-status",
      "Error: " + (error?.message || "transcription failed"),
    );
  }
}

// ── Ollama Chat ──

async function sendToOllama(transcription) {
  if (!ollamaClient || !ollamaModel) {
    console.error("[LocalAI] Ollama not configured");
    return;
  }

  console.log(
    "[LocalAI] Sending to Ollama:",
    transcription.substring(0, 100) + "...",
  );

  localConversationHistory.push({
    role: "user",
    content: transcription.trim(),
  });

  // Keep history manageable
  if (localConversationHistory.length > 20) {
    localConversationHistory = localConversationHistory.slice(-20);
  }

  try {
    const messages = [
      {
        role: "system",
        content: currentSystemPrompt || "You are a helpful assistant.",
      },
      ...localConversationHistory,
    ];

    const response = await ollamaClient.chat({
      model: ollamaModel,
      messages,
      stream: true,
    });

    let fullText = "";
    let isFirst = true;

    for await (const part of response) {
      const token = part.message?.content || "";
      if (token) {
        fullText += token;
        sendToRenderer(isFirst ? "new-response" : "update-response", fullText);
        isFirst = false;
      }
    }

    if (fullText.trim()) {
      localConversationHistory.push({
        role: "assistant",
        content: fullText.trim(),
      });

      saveConversationTurn(transcription, fullText);
    }

    console.log("[LocalAI] Ollama response completed");
    sendToRenderer("update-status", "Listening...");
  } catch (error) {
    console.error("[LocalAI] Ollama error:", error);
    sendToRenderer("update-status", "Ollama error: " + error.message);
  }
}

// ── Public API ──

async function initializeLocalSession(
  ollamaHost,
  model,
  whisperModel,
  profile,
  customPrompt,
) {
  console.log("[LocalAI] Initializing local session:", {
    ollamaHost,
    model,
    whisperModel,
    profile,
  });

  sendToRenderer("session-initializing", true);

  try {
    // Setup system prompt
    currentSystemPrompt = getSystemPrompt(profile, customPrompt, false);

    // Initialize Ollama client
    ollamaClient = new Ollama({ host: ollamaHost });
    ollamaModel = model;

    // Test Ollama connection
    try {
      await ollamaClient.list();
      console.log("[LocalAI] Ollama connection verified");
    } catch (error) {
      console.error(
        "[LocalAI] Cannot connect to Ollama at",
        ollamaHost,
        ":",
        error.message,
      );
      sendToRenderer("session-initializing", false);
      sendToRenderer(
        "update-status",
        "Cannot connect to Ollama at " + ollamaHost,
      );
      return false;
    }

    // Load Whisper model
    const pipeline = await loadWhisperPipeline(whisperModel);
    if (!pipeline) {
      sendToRenderer("session-initializing", false);
      return false;
    }

    // Reset VAD state
    isSpeaking = false;
    speechBuffers = [];
    silenceFrameCount = 0;
    speechFrameCount = 0;
    resampleRemainder = Buffer.alloc(0);
    localConversationHistory = [];

    // Initialize conversation session
    initializeNewSession(profile, customPrompt);

    isLocalActive = true;
    sendToRenderer("session-initializing", false);
    sendToRenderer("update-status", "Local AI ready - Listening...");

    console.log("[LocalAI] Session initialized successfully");
    return true;
  } catch (error) {
    console.error("[LocalAI] Initialization error:", error);
    sendToRenderer("session-initializing", false);
    sendToRenderer("update-status", "Local AI error: " + error.message);
    return false;
  }
}

function processLocalAudio(monoChunk24k) {
  if (!isLocalActive) return;

  // Resample from 24kHz to 16kHz
  const pcm16k = resample24kTo16k(monoChunk24k);
  if (pcm16k.length > 0) {
    processVAD(pcm16k);
  }
}

function closeLocalSession() {
  console.log("[LocalAI] Closing local session");
  isLocalActive = false;
  isSpeaking = false;
  speechBuffers = [];
  silenceFrameCount = 0;
  speechFrameCount = 0;
  resampleRemainder = Buffer.alloc(0);
  localConversationHistory = [];
  ollamaClient = null;
  ollamaModel = null;
  currentSystemPrompt = null;
  // Note: whisperWorker is kept alive to avoid reloading model on next session
  // To fully clean up, call killWhisperWorker()
}

function isLocalSessionActive() {
  return isLocalActive;
}

// ── Send text directly to Ollama (for manual text input) ──

async function sendLocalText(text) {
  if (!isLocalActive || !ollamaClient) {
    return { success: false, error: "No active local session" };
  }

  try {
    await sendToOllama(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function sendLocalImage(base64Data, prompt) {
  if (!isLocalActive || !ollamaClient) {
    return { success: false, error: "No active local session" };
  }

  try {
    console.log("[LocalAI] Sending image to Ollama");
    sendToRenderer("update-status", "Analyzing image...");

    const userMessage = {
      role: "user",
      content: prompt,
      images: [base64Data],
    };

    // Store text-only version in history
    localConversationHistory.push({ role: "user", content: prompt });

    if (localConversationHistory.length > 20) {
      localConversationHistory = localConversationHistory.slice(-20);
    }

    const messages = [
      {
        role: "system",
        content: currentSystemPrompt || "You are a helpful assistant.",
      },
      ...localConversationHistory.slice(0, -1),
      userMessage,
    ];

    const response = await ollamaClient.chat({
      model: ollamaModel,
      messages,
      stream: true,
    });

    let fullText = "";
    let isFirst = true;

    for await (const part of response) {
      const token = part.message?.content || "";
      if (token) {
        fullText += token;
        sendToRenderer(isFirst ? "new-response" : "update-response", fullText);
        isFirst = false;
      }
    }

    if (fullText.trim()) {
      localConversationHistory.push({
        role: "assistant",
        content: fullText.trim(),
      });
      saveConversationTurn(prompt, fullText);
    }

    console.log("[LocalAI] Image response completed");
    sendToRenderer("update-status", "Listening...");
    return { success: true, text: fullText, model: ollamaModel };
  } catch (error) {
    console.error("[LocalAI] Image error:", error);
    sendToRenderer("update-status", "Ollama error: " + error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initializeLocalSession,
  processLocalAudio,
  closeLocalSession,
  isLocalSessionActive,
  sendLocalText,
  sendLocalImage,
};
