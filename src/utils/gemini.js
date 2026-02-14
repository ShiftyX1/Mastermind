const { GoogleGenAI, Modality } = require("@google/genai");
const { BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const { saveDebugAudio } = require("../audioUtils");
const { getSystemPrompt } = require("./prompts");
const {
  getAvailableModel,
  incrementLimitCount,
  getApiKey,
  getGroqApiKey,
  getOpenAICompatibleConfig,
  incrementCharUsage,
  getModelForToday,
} = require("../storage");
const OpenAI = require("openai");

// Lazy-loaded to avoid circular dependency (localai.js imports from gemini.js)
let _localai = null;
function getLocalAi() {
  if (!_localai) _localai = require("./localai");
  return _localai;
}

// Provider mode: 'byok' or 'local'
let currentProviderMode = "byok";

// Response provider: 'gemini', 'groq', or 'openai-compatible'
let currentResponseProvider = "gemini";

// Groq conversation history for context
let groqConversationHistory = [];

// Conversation tracking variables
let currentSessionId = null;
let currentTranscription = "";
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let isInitializingSession = false;
let currentSystemPrompt = null;

function formatSpeakerResults(results) {
  let text = "";
  for (const result of results) {
    if (result.transcript && result.speakerId) {
      const speakerLabel = result.speakerId === 1 ? "Interviewer" : "Candidate";
      text += `[${speakerLabel}]: ${result.transcript}\n`;
    }
  }
  return text;
}

module.exports.formatSpeakerResults = formatSpeakerResults;

// Audio capture variables
let systemAudioProc = null;
let messageBuffer = "";

// Reconnection variables
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

function sendToRenderer(channel, data) {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    windows[0].webContents.send(channel, data);
  }
}

// Build context message for session restoration
function buildContextMessage() {
  const lastTurns = conversationHistory.slice(-20);
  const validTurns = lastTurns.filter(
    (turn) => turn.transcription?.trim() && turn.ai_response?.trim(),
  );

  if (validTurns.length === 0) return null;

  const contextLines = validTurns.map(
    (turn) =>
      `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`,
  );

  return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join("\n\n")}\n\nContinue from here.`;
}

// Conversation management functions
function initializeNewSession(profile = null, customPrompt = null) {
  currentSessionId = Date.now().toString();
  currentTranscription = "";
  conversationHistory = [];
  screenAnalysisHistory = [];
  groqConversationHistory = [];
  currentProfile = profile;
  currentCustomPrompt = customPrompt;
  console.log(
    "New conversation session started:",
    currentSessionId,
    "profile:",
    profile,
  );

  // Save initial session with profile context
  if (profile) {
    sendToRenderer("save-session-context", {
      sessionId: currentSessionId,
      profile: profile,
      customPrompt: customPrompt || "",
    });
  }
}

function saveConversationTurn(transcription, aiResponse) {
  if (!currentSessionId) {
    initializeNewSession();
  }

  const conversationTurn = {
    timestamp: Date.now(),
    transcription: transcription.trim(),
    ai_response: aiResponse.trim(),
  };

  conversationHistory.push(conversationTurn);
  console.log("Saved conversation turn:", conversationTurn);

  // Send to renderer to save in IndexedDB
  sendToRenderer("save-conversation-turn", {
    sessionId: currentSessionId,
    turn: conversationTurn,
    fullHistory: conversationHistory,
  });
}

function saveScreenAnalysis(prompt, response, model) {
  if (!currentSessionId) {
    initializeNewSession();
  }

  const analysisEntry = {
    timestamp: Date.now(),
    prompt: prompt,
    response: response.trim(),
    model: model,
  };

  screenAnalysisHistory.push(analysisEntry);
  console.log("Saved screen analysis:", analysisEntry);

  // Send to renderer to save
  sendToRenderer("save-screen-analysis", {
    sessionId: currentSessionId,
    analysis: analysisEntry,
    fullHistory: screenAnalysisHistory,
    profile: currentProfile,
    customPrompt: currentCustomPrompt,
  });
}

function getCurrentSessionData() {
  return {
    sessionId: currentSessionId,
    history: conversationHistory,
  };
}

async function getEnabledTools() {
  const tools = [];

  // Check if Google Search is enabled (default: true)
  const googleSearchEnabled = await getStoredSetting(
    "googleSearchEnabled",
    "true",
  );
  console.log("Google Search enabled:", googleSearchEnabled);

  if (googleSearchEnabled === "true") {
    tools.push({ googleSearch: {} });
    console.log("Added Google Search tool");
  } else {
    console.log("Google Search tool disabled");
  }

  return tools;
}

async function getStoredSetting(key, defaultValue) {
  try {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      // Wait a bit for the renderer to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to get setting from renderer process localStorage
      const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            console.log('localStorage not available yet for ${key}');
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        console.log('Retrieved setting ${key}:', stored);
                        return stored || '${defaultValue}';
                    } catch (e) {
                        console.error('Error accessing localStorage for ${key}:', e);
                        return '${defaultValue}';
                    }
                })()
            `);
      return value;
    }
  } catch (error) {
    console.error("Error getting stored setting for", key, ":", error.message);
  }
  console.log("Using default value for", key, ":", defaultValue);
  return defaultValue;
}

// helper to check if groq has been configured
function hasGroqKey() {
  const key = getGroqApiKey();
  return key && key.trim() != "";
}

// helper to check if OpenAI-compatible API has been configured
function hasOpenAICompatibleConfig() {
  const config = getOpenAICompatibleConfig();
  return (
    config.apiKey &&
    config.apiKey.trim() !== "" &&
    config.baseUrl &&
    config.baseUrl.trim() !== "" &&
    config.model &&
    config.model.trim() !== ""
  );
}

function trimConversationHistoryForGemma(history, maxChars = 42000) {
  if (!history || history.length === 0) return [];
  let totalChars = 0;
  const trimmed = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    const turnChars = (turn.content || "").length;

    if (totalChars + turnChars > maxChars) break;
    totalChars += turnChars;
    trimmed.unshift(turn);
  }
  return trimmed;
}

function stripThinkingTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function sendToGroq(transcription) {
  const groqApiKey = getGroqApiKey();
  if (!groqApiKey) {
    console.log("No Groq API key configured, skipping Groq response");
    return;
  }

  if (!transcription || transcription.trim() === "") {
    console.log("Empty transcription, skipping Groq");
    return;
  }

  const modelToUse = getModelForToday();
  if (!modelToUse) {
    console.log("All Groq daily limits exhausted");
    sendToRenderer("update-status", "Groq limits reached for today");
    return;
  }

  console.log(
    `Sending to Groq (${modelToUse}):`,
    transcription.substring(0, 100) + "...",
  );

  groqConversationHistory.push({
    role: "user",
    content: transcription.trim(),
  });

  if (groqConversationHistory.length > 20) {
    groqConversationHistory = groqConversationHistory.slice(-20);
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            {
              role: "system",
              content: currentSystemPrompt || "You are a helpful assistant.",
            },
            ...groqConversationHistory,
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 1024,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error:", response.status, errorText);
      sendToRenderer("update-status", `Groq error: ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let isFirst = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content || "";
            if (token) {
              fullText += token;
              const displayText = stripThinkingTags(fullText);
              if (displayText) {
                sendToRenderer(
                  isFirst ? "new-response" : "update-response",
                  displayText,
                );
                isFirst = false;
              }
            }
          } catch (parseError) {
            // Skip invalid JSON chunks
          }
        }
      }
    }

    const cleanedResponse = stripThinkingTags(fullText);
    const modelKey = modelToUse.split("/").pop();

    const systemPromptChars = (
      currentSystemPrompt || "You are a helpful assistant."
    ).length;
    const historyChars = groqConversationHistory.reduce(
      (sum, msg) => sum + (msg.content || "").length,
      0,
    );
    const inputChars = systemPromptChars + historyChars;
    const outputChars = cleanedResponse.length;

    incrementCharUsage("groq", modelKey, inputChars + outputChars);

    if (cleanedResponse) {
      groqConversationHistory.push({
        role: "assistant",
        content: cleanedResponse,
      });

      saveConversationTurn(transcription, cleanedResponse);
    }

    console.log(`Groq response completed (${modelToUse})`);
    sendToRenderer("update-status", "Listening...");
  } catch (error) {
    console.error("Error calling Groq API:", error);
    sendToRenderer("update-status", "Groq error: " + error.message);
  }
}

async function sendToOpenAICompatible(transcription) {
  const config = getOpenAICompatibleConfig();

  if (!config.apiKey || !config.baseUrl || !config.model) {
    console.log("OpenAI-compatible API not fully configured");
    return;
  }

  if (!transcription || transcription.trim() === "") {
    console.log("Empty transcription, skipping OpenAI-compatible API");
    return;
  }

  console.log(
    `Sending to OpenAI-compatible API (${config.model}):`,
    transcription.substring(0, 100) + "...",
  );

  groqConversationHistory.push({
    role: "user",
    content: transcription.trim(),
  });

  if (groqConversationHistory.length > 20) {
    groqConversationHistory = groqConversationHistory.slice(-20);
  }

  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl.trim().replace(/\/$/, ""),
      dangerouslyAllowBrowser: false,
    });

    console.log(`Using OpenAI-compatible base URL: ${config.baseUrl}`);

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: "system",
          content: currentSystemPrompt || "You are a helpful assistant.",
        },
        ...groqConversationHistory,
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    });

    let fullText = "";
    let isFirst = true;

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;

      if (content) {
        fullText += content;
        sendToRenderer(isFirst ? "new-response" : "update-response", fullText);
        isFirst = false;
      }
    }

    // Clean up <think> tags if present (for DeepSeek-style reasoning models)
    const cleanText = stripThinkingTags(fullText);
    if (cleanText !== fullText) {
      sendToRenderer("update-response", cleanText);
    }

    if (fullText.trim()) {
      groqConversationHistory.push({
        role: "assistant",
        content: fullText.trim(),
      });

      if (groqConversationHistory.length > 40) {
        groqConversationHistory = groqConversationHistory.slice(-40);
      }

      saveConversationTurn(transcription, fullText);
    }

    console.log(`OpenAI-compatible API response completed (${config.model})`);
    sendToRenderer("update-status", "Listening...");
  } catch (error) {
    console.error("Error calling OpenAI-compatible API:", error);
    sendToRenderer("update-status", "OpenAI API error: " + error.message);
  }
}

async function sendToGemma(transcription) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log("No Gemini API key configured");
    return;
  }

  if (!transcription || transcription.trim() === "") {
    console.log("Empty transcription, skipping Gemma");
    return;
  }

  console.log("Sending to Gemma:", transcription.substring(0, 100) + "...");

  groqConversationHistory.push({
    role: "user",
    content: transcription.trim(),
  });

  const trimmedHistory = trimConversationHistoryForGemma(
    groqConversationHistory,
    42000,
  );

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const messages = trimmedHistory.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const systemPrompt = currentSystemPrompt || "You are a helpful assistant.";
    const messagesWithSystem = [
      { role: "user", parts: [{ text: systemPrompt }] },
      {
        role: "model",
        parts: [{ text: "Understood. I will follow these instructions." }],
      },
      ...messages,
    ];

    const response = await ai.models.generateContentStream({
      model: "gemma-3-27b-it",
      contents: messagesWithSystem,
    });

    let fullText = "";
    let isFirst = true;

    for await (const chunk of response) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullText += chunkText;
        sendToRenderer(isFirst ? "new-response" : "update-response", fullText);
        isFirst = false;
      }
    }

    const systemPromptChars = (
      currentSystemPrompt || "You are a helpful assistant."
    ).length;
    const historyChars = trimmedHistory.reduce(
      (sum, msg) => sum + (msg.content || "").length,
      0,
    );
    const inputChars = systemPromptChars + historyChars;
    const outputChars = fullText.length;

    incrementCharUsage("gemini", "gemma-3-27b-it", inputChars + outputChars);

    if (fullText.trim()) {
      groqConversationHistory.push({
        role: "assistant",
        content: fullText.trim(),
      });

      if (groqConversationHistory.length > 40) {
        groqConversationHistory = groqConversationHistory.slice(-40);
      }

      saveConversationTurn(transcription, fullText);
    }

    console.log("Gemma response completed");
    sendToRenderer("update-status", "Listening...");
  } catch (error) {
    console.error("Error calling Gemma API:", error);
    sendToRenderer("update-status", "Gemma error: " + error.message);
  }
}

async function initializeGeminiSession(
  apiKey,
  customPrompt = "",
  profile = "interview",
  language = "en-US",
  isReconnect = false,
) {
  if (isInitializingSession) {
    console.log("Session initialization already in progress");
    return false;
  }

  isInitializingSession = true;
  if (!isReconnect) {
    sendToRenderer("session-initializing", true);
  }

  // Store params for reconnection
  if (!isReconnect) {
    sessionParams = { apiKey, customPrompt, profile, language };
    reconnectAttempts = 0;
  }

  // Load response provider preference
  if (!isReconnect) {
    const { getPreferences } = require("../storage");
    const prefs = getPreferences();
    currentResponseProvider = prefs.responseProvider || "gemini";
    console.log("🔧 Response provider set to:", currentResponseProvider);
  }

  const client = new GoogleGenAI({
    vertexai: false,
    apiKey: apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });

  // Get enabled tools first to determine Google Search status
  const enabledTools = await getEnabledTools();
  const googleSearchEnabled = enabledTools.some((tool) => tool.googleSearch);

  const systemPrompt = getSystemPrompt(
    profile,
    customPrompt,
    googleSearchEnabled,
  );
  currentSystemPrompt = systemPrompt; // Store for Groq

  // Initialize new conversation session only on first connect
  if (!isReconnect) {
    initializeNewSession(profile, customPrompt);
  }

  try {
    const session = await client.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      callbacks: {
        onopen: function () {
          sendToRenderer("update-status", "Live session connected");
        },
        onmessage: function (message) {
          console.log("----------------", message);

          // Handle input transcription (what was spoken)
          if (message.serverContent?.inputTranscription?.results) {
            const transcribed = formatSpeakerResults(
              message.serverContent.inputTranscription.results,
            );
            console.log("Got transcription (results):", transcribed);
            currentTranscription += transcribed;
          } else if (message.serverContent?.inputTranscription?.text) {
            const text = message.serverContent.inputTranscription.text;
            if (text.trim() !== "") {
              console.log("Got transcription (text):", text);
              currentTranscription += text;
            }
          }

          // DISABLED: Gemini's outputTranscription - using Groq for faster responses instead
          // if (message.serverContent?.outputTranscription?.text) { ... }

          if (message.serverContent?.generationComplete) {
            console.log(
              "Generation complete. Current transcription:",
              `"${currentTranscription}"`,
            );
            if (currentTranscription.trim() !== "") {
              // Use explicit user choice for response provider
              if (currentResponseProvider === "openai-compatible") {
                if (hasOpenAICompatibleConfig()) {
                  console.log(
                    "Sending to OpenAI-compatible API (user selected)",
                  );
                  sendToOpenAICompatible(currentTranscription);
                } else {
                  console.log(
                    "OpenAI-compatible selected but not configured, falling back to Gemini",
                  );
                  sendToGemma(currentTranscription);
                }
              } else if (currentResponseProvider === "groq") {
                if (hasGroqKey()) {
                  console.log("Sending to Groq (user selected)");
                  sendToGroq(currentTranscription);
                } else {
                  console.log(
                    "Groq selected but not configured, falling back to Gemini",
                  );
                  sendToGemma(currentTranscription);
                }
              } else {
                console.log("Sending to Gemini (user selected)");
                sendToGemma(currentTranscription);
              }
              currentTranscription = "";
            } else {
              console.log("Transcription is empty, not sending to LLM");
            }
            messageBuffer = "";
          }

          if (message.serverContent?.turnComplete) {
            console.log("Turn complete");
            sendToRenderer("update-status", "Listening...");
          }
        },
        onerror: function (e) {
          console.log("Session error:", e.message);
          sendToRenderer("update-status", "Error: " + e.message);
        },
        onclose: function (e) {
          console.log("Session closed:", e.reason);

          // Don't reconnect if user intentionally closed
          if (isUserClosing) {
            isUserClosing = false;
            sendToRenderer("update-status", "Session closed");
            return;
          }

          // Attempt reconnection
          if (sessionParams && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            attemptReconnect();
          } else {
            sendToRenderer("update-status", "Session closed");
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        proactivity: { proactiveAudio: false },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        tools: enabledTools,
        contextWindowCompression: { slidingWindow: {} },
        speechConfig: { languageCode: language },
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
      },
    });

    isInitializingSession = false;
    if (!isReconnect) {
      sendToRenderer("session-initializing", false);
    }
    return session;
  } catch (error) {
    console.error("Failed to initialize Gemini session:", error);
    isInitializingSession = false;
    if (!isReconnect) {
      sendToRenderer("session-initializing", false);
    }
    return null;
  }
}

async function attemptReconnect() {
  reconnectAttempts++;
  console.log(
    `Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`,
  );

  // Clear stale buffers
  messageBuffer = "";
  currentTranscription = "";
  // Don't reset groqConversationHistory to preserve context across reconnects

  sendToRenderer(
    "update-status",
    `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  // Wait before attempting
  await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));

  try {
    const session = await initializeGeminiSession(
      sessionParams.apiKey,
      sessionParams.customPrompt,
      sessionParams.profile,
      sessionParams.language,
      true, // isReconnect
    );

    if (session && global.geminiSessionRef) {
      global.geminiSessionRef.current = session;

      // Restore context from conversation history via text message
      const contextMessage = buildContextMessage();
      if (contextMessage) {
        try {
          console.log("Restoring conversation context...");
          await session.sendRealtimeInput({ text: contextMessage });
        } catch (contextError) {
          console.error("Failed to restore context:", contextError);
          // Continue without context - better than failing
        }
      }

      // Don't reset reconnectAttempts here - let it reset on next fresh session
      sendToRenderer("update-status", "Reconnected! Listening...");
      console.log("Session reconnected successfully");
      return true;
    }
  } catch (error) {
    console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
  }

  // If we still have attempts left, try again
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    return attemptReconnect();
  }

  // Max attempts reached - notify frontend
  console.log("Max reconnection attempts reached");
  sendToRenderer("reconnect-failed", {
    message:
      "Tried 3 times to reconnect. Must be upstream/network issues. Try restarting or download updated app from site.",
  });
  sessionParams = null;
  return false;
}

function killExistingSystemAudioDump() {
  return new Promise((resolve) => {
    console.log("Checking for existing SystemAudioDump processes...");

    // Kill any existing SystemAudioDump processes
    const killProc = spawn("pkill", ["-f", "SystemAudioDump"], {
      stdio: "ignore",
    });

    killProc.on("close", (code) => {
      if (code === 0) {
        console.log("Killed existing SystemAudioDump processes");
      } else {
        console.log("No existing SystemAudioDump processes found");
      }
      resolve();
    });

    killProc.on("error", (err) => {
      console.log(
        "Error checking for existing processes (this is normal):",
        err.message,
      );
      resolve();
    });

    // Timeout after 2 seconds
    setTimeout(() => {
      killProc.kill();
      resolve();
    }, 2000);
  });
}

async function startMacOSAudioCapture(geminiSessionRef) {
  if (process.platform !== "darwin") return false;

  // Kill any existing SystemAudioDump processes first
  await killExistingSystemAudioDump();

  console.log("Starting macOS audio capture with SystemAudioDump...");

  const { app } = require("electron");
  const path = require("path");

  let systemAudioPath;
  if (app.isPackaged) {
    systemAudioPath = path.join(process.resourcesPath, "SystemAudioDump");
  } else {
    systemAudioPath = path.join(__dirname, "../assets", "SystemAudioDump");
  }

  console.log("SystemAudioDump path:", systemAudioPath);

  const spawnOptions = {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  };

  systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

  if (!systemAudioProc.pid) {
    console.error("Failed to start SystemAudioDump");
    return false;
  }

  console.log("SystemAudioDump started with PID:", systemAudioProc.pid);

  const CHUNK_DURATION = 0.1;
  const SAMPLE_RATE = 24000;
  const BYTES_PER_SAMPLE = 2;
  const CHANNELS = 2;
  const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

  let audioBuffer = Buffer.alloc(0);

  systemAudioProc.stdout.on("data", (data) => {
    audioBuffer = Buffer.concat([audioBuffer, data]);

    while (audioBuffer.length >= CHUNK_SIZE) {
      const chunk = audioBuffer.slice(0, CHUNK_SIZE);
      audioBuffer = audioBuffer.slice(CHUNK_SIZE);

      const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;

      if (currentProviderMode === "local") {
        getLocalAi().processLocalAudio(monoChunk);
      } else {
        const base64Data = monoChunk.toString("base64");
        sendAudioToGemini(base64Data, geminiSessionRef);
      }

      if (process.env.DEBUG_AUDIO) {
        console.log(`Processed audio chunk: ${chunk.length} bytes`);
        saveDebugAudio(monoChunk, "system_audio");
      }
    }

    const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
    if (audioBuffer.length > maxBufferSize) {
      audioBuffer = audioBuffer.slice(-maxBufferSize);
    }
  });

  systemAudioProc.stderr.on("data", (data) => {
    console.error("SystemAudioDump stderr:", data.toString());
  });

  systemAudioProc.on("close", (code) => {
    console.log("SystemAudioDump process closed with code:", code);
    systemAudioProc = null;
  });

  systemAudioProc.on("error", (err) => {
    console.error("SystemAudioDump process error:", err);
    systemAudioProc = null;
  });

  return true;
}

function convertStereoToMono(stereoBuffer) {
  const samples = stereoBuffer.length / 4;
  const monoBuffer = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i++) {
    const leftSample = stereoBuffer.readInt16LE(i * 4);
    monoBuffer.writeInt16LE(leftSample, i * 2);
  }

  return monoBuffer;
}

function stopMacOSAudioCapture() {
  if (systemAudioProc) {
    console.log("Stopping SystemAudioDump...");
    systemAudioProc.kill("SIGTERM");
    systemAudioProc = null;
  }
}

async function sendAudioToGemini(base64Data, geminiSessionRef) {
  if (!geminiSessionRef.current) return;

  try {
    process.stdout.write(".");
    await geminiSessionRef.current.sendRealtimeInput({
      audio: {
        data: base64Data,
        mimeType: "audio/pcm;rate=24000",
      },
    });
  } catch (error) {
    console.error("Error sending audio to Gemini:", error);
  }
}

async function sendImageToGeminiHttp(base64Data, prompt) {
  // Get available model based on rate limits
  const model = getAvailableModel();

  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: "No API key configured" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const contents = [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      },
      { text: prompt },
    ];

    console.log(`Sending image to ${model} (streaming)...`);
    const response = await ai.models.generateContentStream({
      model: model,
      contents: contents,
      config: {
        systemInstruction: currentSystemPrompt || undefined,
      },
    });

    // Increment count after successful call
    incrementLimitCount(model);

    // Stream the response
    let fullText = "";
    let isFirst = true;
    for await (const chunk of response) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullText += chunkText;
        // Send to renderer - new response for first chunk, update for subsequent
        sendToRenderer(isFirst ? "new-response" : "update-response", fullText);
        isFirst = false;
      }
    }

    console.log(`Image response completed from ${model}`);

    // Save screen analysis to history
    saveScreenAnalysis(prompt, fullText, model);

    return { success: true, text: fullText, model: model };
  } catch (error) {
    console.error("Error sending image to Gemini HTTP:", error);
    return { success: false, error: error.message };
  }
}

function setupGeminiIpcHandlers(geminiSessionRef) {
  // Store the geminiSessionRef globally for reconnection access
  global.geminiSessionRef = geminiSessionRef;

  ipcMain.handle(
    "initialize-gemini",
    async (
      event,
      apiKey,
      customPrompt,
      profile = "interview",
      language = "en-US",
    ) => {
      currentProviderMode = "byok";
      const session = await initializeGeminiSession(
        apiKey,
        customPrompt,
        profile,
        language,
      );
      if (session) {
        geminiSessionRef.current = session;
        return true;
      }
      return false;
    },
  );

  ipcMain.handle(
    "initialize-local",
    async (
      event,
      ollamaHost,
      ollamaModel,
      whisperModel,
      profile,
      customPrompt,
    ) => {
      currentProviderMode = "local";
      const success = await getLocalAi().initializeLocalSession(
        ollamaHost,
        ollamaModel,
        whisperModel,
        profile,
        customPrompt,
      );
      if (!success) {
        currentProviderMode = "byok";
      }
      return success;
    },
  );

  ipcMain.handle("send-audio-content", async (event, { data, mimeType }) => {
    if (currentProviderMode === "local") {
      try {
        const pcmBuffer = Buffer.from(data, "base64");
        getLocalAi().processLocalAudio(pcmBuffer);
        return { success: true };
      } catch (error) {
        console.error("Error sending local audio:", error);
        return { success: false, error: error.message };
      }
    }
    if (!geminiSessionRef.current)
      return { success: false, error: "No active Gemini session" };
    try {
      process.stdout.write(".");
      await geminiSessionRef.current.sendRealtimeInput({
        audio: { data: data, mimeType: mimeType },
      });
      return { success: true };
    } catch (error) {
      console.error("Error sending system audio:", error);
      return { success: false, error: error.message };
    }
  });

  // Handle microphone audio on a separate channel
  ipcMain.handle(
    "send-mic-audio-content",
    async (event, { data, mimeType }) => {
      if (currentProviderMode === "local") {
        try {
          const pcmBuffer = Buffer.from(data, "base64");
          getLocalAi().processLocalAudio(pcmBuffer);
          return { success: true };
        } catch (error) {
          console.error("Error sending local mic audio:", error);
          return { success: false, error: error.message };
        }
      }
      if (!geminiSessionRef.current)
        return { success: false, error: "No active Gemini session" };
      try {
        process.stdout.write(",");
        await geminiSessionRef.current.sendRealtimeInput({
          audio: { data: data, mimeType: mimeType },
        });
        return { success: true };
      } catch (error) {
        console.error("Error sending mic audio:", error);
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle("send-image-content", async (event, { data, prompt }) => {
    try {
      if (!data || typeof data !== "string") {
        console.error("Invalid image data received");
        return { success: false, error: "Invalid image data" };
      }

      const buffer = Buffer.from(data, "base64");

      if (buffer.length < 1000) {
        console.error(`Image buffer too small: ${buffer.length} bytes`);
        return { success: false, error: "Image buffer too small" };
      }

      process.stdout.write("!");

      if (currentProviderMode === "local") {
        const result = await getLocalAi().sendLocalImage(data, prompt);
        return result;
      }

      // Use HTTP API instead of realtime session
      const result = await sendImageToGeminiHttp(data, prompt);
      return result;
    } catch (error) {
      console.error("Error sending image:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("send-text-message", async (event, text) => {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return { success: false, error: "Invalid text message" };
    }

    if (currentProviderMode === "local") {
      try {
        console.log("Sending text to local Ollama:", text);
        return await getLocalAi().sendLocalText(text.trim());
      } catch (error) {
        console.error("Error sending local text:", error);
        return { success: false, error: error.message };
      }
    }

    if (!geminiSessionRef.current)
      return { success: false, error: "No active Gemini session" };

    try {
      console.log("Sending text message:", text);

      // Use explicit user choice for response provider
      if (currentResponseProvider === "openai-compatible") {
        if (hasOpenAICompatibleConfig()) {
          sendToOpenAICompatible(text.trim());
        } else {
          sendToGemma(text.trim());
        }
      } else if (currentResponseProvider === "groq") {
        if (hasGroqKey()) {
          sendToGroq(text.trim());
        } else {
          sendToGemma(text.trim());
        }
      } else {
        sendToGemma(text.trim());
      }

      await geminiSessionRef.current.sendRealtimeInput({ text: text.trim() });
      return { success: true };
    } catch (error) {
      console.error("Error sending text:", error);
      return { success: false, error: error.message };
    }
  });

  // Expand last response — continues the conversation, not a re-generation
  ipcMain.handle(
    "expand-last-response",
    async (event, { previousResponse, originalContext }) => {
      if (!previousResponse || typeof previousResponse !== "string") {
        return { success: false, error: "No previous response to expand" };
      }

      const expansionPrompt = `You previously gave this brief answer:\n\n---\n${previousResponse.trim()}\n---\n\nNow expand on your previous answer. Continue your thought and provide a thorough, comprehensive, detailed explanation. Do NOT repeat the brief version — build on it and go deeper. If there is code involved, provide the complete working solution with detailed comments and explain time/space complexity. If there are edge cases, discuss them. Be as detailed as needed.`;

      try {
        console.log("Expanding last response...");

        if (currentProviderMode === "local") {
          return await getLocalAi().sendLocalText(expansionPrompt);
        }

        // Ensure the previous assistant response is in conversation history
        // so the LLM sees full context when sendToGroq/sendToGemma add the user message
        const lastEntry =
          groqConversationHistory[groqConversationHistory.length - 1];
        if (!lastEntry || lastEntry.role !== "assistant") {
          groqConversationHistory.push({
            role: "assistant",
            content: previousResponse.trim(),
          });
        }

        // Route to the same provider as normal messages
        // (each send function pushes the user message to groqConversationHistory itself)
        if (currentResponseProvider === "openai-compatible") {
          if (hasOpenAICompatibleConfig()) {
            sendToOpenAICompatible(expansionPrompt);
          } else {
            sendToGemma(expansionPrompt);
          }
        } else if (currentResponseProvider === "groq") {
          if (hasGroqKey()) {
            sendToGroq(expansionPrompt);
          } else {
            sendToGemma(expansionPrompt);
          }
        } else {
          sendToGemma(expansionPrompt);
        }

        return { success: true };
      } catch (error) {
        console.error("Error expanding response:", error);
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle("start-macos-audio", async (event) => {
    if (process.platform !== "darwin") {
      return {
        success: false,
        error: "macOS audio capture only available on macOS",
      };
    }

    try {
      const success = await startMacOSAudioCapture(geminiSessionRef);
      return { success };
    } catch (error) {
      console.error("Error starting macOS audio capture:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("stop-macos-audio", async (event) => {
    try {
      stopMacOSAudioCapture();
      return { success: true };
    } catch (error) {
      console.error("Error stopping macOS audio capture:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("close-session", async (event) => {
    try {
      stopMacOSAudioCapture();

      if (currentProviderMode === "local") {
        getLocalAi().closeLocalSession();
        currentProviderMode = "byok";
        return { success: true };
      }

      // Set flag to prevent reconnection attempts
      isUserClosing = true;
      sessionParams = null;

      // Cleanup session
      if (geminiSessionRef.current) {
        await geminiSessionRef.current.close();
        geminiSessionRef.current = null;
      }

      return { success: true };
    } catch (error) {
      console.error("Error closing session:", error);
      return { success: false, error: error.message };
    }
  });

  // Conversation history IPC handlers
  ipcMain.handle("get-current-session", async (event) => {
    try {
      return { success: true, data: getCurrentSessionData() };
    } catch (error) {
      console.error("Error getting current session:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("start-new-session", async (event) => {
    try {
      initializeNewSession();
      return { success: true, sessionId: currentSessionId };
    } catch (error) {
      console.error("Error starting new session:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("update-google-search-setting", async (event, enabled) => {
    try {
      console.log("Google Search setting updated to:", enabled);
      // The setting is already saved in localStorage by the renderer
      // This is just for logging/confirmation
      return { success: true };
    } catch (error) {
      console.error("Error updating Google Search setting:", error);
      return { success: false, error: error.message };
    }
  });

  // OpenAI-compatible API configuration handlers
  ipcMain.handle(
    "set-openai-compatible-config",
    async (event, apiKey, baseUrl, model) => {
      try {
        const { setOpenAICompatibleConfig } = require("../storage");
        setOpenAICompatibleConfig(apiKey, baseUrl, model);
        console.log("OpenAI-compatible config saved:", {
          baseUrl,
          model: model.substring(0, 30),
        });
        return { success: true };
      } catch (error) {
        console.error("Error setting OpenAI-compatible config:", error);
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle("get-openai-compatible-config", async (event) => {
    try {
      const config = getOpenAICompatibleConfig();
      return { success: true, config };
    } catch (error) {
      console.error("Error getting OpenAI-compatible config:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  initializeGeminiSession,
  getEnabledTools,
  getStoredSetting,
  sendToRenderer,
  initializeNewSession,
  saveConversationTurn,
  getCurrentSessionData,
  killExistingSystemAudioDump,
  startMacOSAudioCapture,
  convertStereoToMono,
  stopMacOSAudioCapture,
  sendAudioToGemini,
  sendImageToGeminiHttp,
  setupGeminiIpcHandlers,
  formatSpeakerResults,
  hasOpenAICompatibleConfig,
  sendToOpenAICompatible,
};
