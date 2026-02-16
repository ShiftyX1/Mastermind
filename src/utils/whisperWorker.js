/**
 * Whisper Worker — runs ONNX Runtime in an isolated child process.
 *
 * The main Electron process forks this file and communicates via IPC messages.
 * If ONNX Runtime crashes (SIGSEGV/SIGABRT inside the native Metal or CPU
 * execution provider), only this worker dies — the main process survives and
 * can respawn the worker automatically.
 *
 * Protocol (parent ↔ worker):
 *   parent → worker:
 *     { type: 'load',       modelName, cacheDir, device? }
 *     { type: 'transcribe', audioBase64, language? }  // PCM 16-bit 16kHz as base64
 *     { type: 'shutdown' }
 *
 *   worker → parent:
 *     { type: 'load-result',       success, error?, device? }
 *     { type: 'transcribe-result', success, text?, error? }
 *     { type: 'status',            message }
 *     { type: 'ready' }
 */

// ── Crash handlers — report fatal errors before the process dies ──

process.on("uncaughtException", (err) => {
  try {
    send({
      type: "status",
      message: `[Worker] Uncaught exception: ${err.message || err}`,
    });
    console.error("[WhisperWorker] Uncaught exception:", err);
  } catch (_) {
    // Cannot communicate with parent anymore
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  try {
    send({
      type: "status",
      message: `[Worker] Unhandled rejection: ${reason?.message || reason}`,
    });
    console.error("[WhisperWorker] Unhandled rejection:", reason);
  } catch (_) {
    // Cannot communicate with parent anymore
  }
  // Don't exit — let it be caught by the pipeline's own handlers
});

let whisperPipeline = null;
/** Which ONNX backend is actually active: "cpu" | "wasm" */
let activeDevice = null;

function pcm16ToFloat32(pcm16Buffer) {
  if (!pcm16Buffer || pcm16Buffer.length === 0) {
    return new Float32Array(0);
  }
  const alignedLength =
    pcm16Buffer.length % 2 === 0 ? pcm16Buffer.length : pcm16Buffer.length - 1;
  const samples = alignedLength / 2;
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float32[i] = pcm16Buffer.readInt16LE(i * 2) / 32768;
  }
  return float32;
}

/**
 * Load the Whisper model.
 *
 * @param {string} modelName   HuggingFace model id, e.g. "Xenova/whisper-small"
 * @param {string} cacheDir    Directory for cached model files
 * @param {string} [device]    "cpu" (onnxruntime-node) or "wasm" (onnxruntime-web).
 *                              When "cpu" is requested we try native first and fall
 *                              back to "wasm" on failure (ABI mismatch, etc.).
 */
async function loadModel(modelName, cacheDir, device = "cpu") {
  if (whisperPipeline) {
    send({ type: "load-result", success: true, device: activeDevice });
    return;
  }

  try {
    send({
      type: "status",
      message: "Loading Whisper model (first time may take a while)...",
    });

    // Validate / create cache directory
    const fs = require("fs");
    const path = require("path");
    if (cacheDir) {
      try {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
          console.log("[WhisperWorker] Created cache directory:", cacheDir);
        }
      } catch (mkdirErr) {
        console.warn(
          "[WhisperWorker] Cannot create cache dir:",
          mkdirErr.message,
        );
      }

      // Check for corrupted partial downloads — if an onnx file exists but
      // is suspiciously small (< 1 KB), delete it so the library re-downloads.
      try {
        const modelDir = path.join(cacheDir, modelName.replace("/", path.sep));
        if (fs.existsSync(modelDir)) {
          const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                walk(full);
              } else if (
                entry.name.endsWith(".onnx") &&
                fs.statSync(full).size < 1024
              ) {
                console.warn(
                  "[WhisperWorker] Removing likely-corrupt file:",
                  full,
                );
                fs.unlinkSync(full);
              }
            }
          };
          walk(modelDir);
        }
      } catch (cleanErr) {
        console.warn("[WhisperWorker] Cache cleanup error:", cleanErr.message);
      }
    }

    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = cacheDir;

    // Attempt to load with the requested device
    const devicesToTry = device === "wasm" ? ["wasm"] : ["cpu", "wasm"];

    let lastError = null;

    for (const dev of devicesToTry) {
      try {
        send({
          type: "status",
          message: `Loading Whisper (${dev} backend)...`,
        });
        console.log(
          `[WhisperWorker] Trying device: ${dev}, model: ${modelName}`,
        );

        whisperPipeline = await pipeline(
          "automatic-speech-recognition",
          modelName,
          {
            dtype: "q8",
            device: dev,
            progress_callback: (progress) => {
              // progress: { status, name?, file?, progress?, loaded?, total? }
              if (
                progress.status === "download" ||
                progress.status === "progress"
              ) {
                send({
                  type: "progress",
                  file: progress.file || progress.name || "",
                  progress: progress.progress ?? 0,
                  loaded: progress.loaded ?? 0,
                  total: progress.total ?? 0,
                  status: progress.status,
                });
              } else if (progress.status === "done") {
                send({
                  type: "progress",
                  file: progress.file || progress.name || "",
                  progress: 100,
                  loaded: progress.total ?? 0,
                  total: progress.total ?? 0,
                  status: "done",
                });
              } else if (progress.status === "initiate") {
                send({
                  type: "progress",
                  file: progress.file || progress.name || "",
                  progress: 0,
                  loaded: 0,
                  total: 0,
                  status: "initiate",
                });
              }
            },
          },
        );

        activeDevice = dev;
        console.log(
          `[WhisperWorker] Model loaded successfully (device: ${dev})`,
        );
        send({ type: "load-result", success: true, device: dev });
        return;
      } catch (err) {
        lastError = err;
        console.error(
          `[WhisperWorker] Failed to load with device "${dev}":`,
          err.message || err,
        );

        if (dev === "cpu" && devicesToTry.includes("wasm")) {
          send({
            type: "status",
            message: `Native CPU backend failed (${err.message}). Trying WASM fallback...`,
          });
        }

        // Reset pipeline state before retry
        whisperPipeline = null;
      }
    }

    // All devices failed
    throw lastError || new Error("All ONNX backends failed");
  } catch (error) {
    send({ type: "load-result", success: false, error: error.message });
  }
}

async function transcribe(audioBase64, language) {
  if (!whisperPipeline) {
    send({
      type: "transcribe-result",
      success: false,
      error: "Whisper pipeline not loaded",
    });
    return;
  }

  try {
    const pcm16Buffer = Buffer.from(audioBase64, "base64");

    if (pcm16Buffer.length < 2) {
      send({
        type: "transcribe-result",
        success: false,
        error: "Audio buffer too small",
      });
      return;
    }

    // Cap at ~30 seconds (16kHz, 16-bit mono)
    const maxBytes = 16000 * 2 * 30;
    const audioData =
      pcm16Buffer.length > maxBytes
        ? pcm16Buffer.slice(0, maxBytes)
        : pcm16Buffer;

    const float32Audio = pcm16ToFloat32(audioData);
    if (float32Audio.length === 0) {
      send({
        type: "transcribe-result",
        success: false,
        error: "Empty audio after conversion",
      });
      return;
    }

    // Build pipeline options with the requested language
    const pipelineOpts = {
      sampling_rate: 16000,
      task: "transcribe",
    };
    if (language && language !== "auto") {
      pipelineOpts.language = language;
    }

    const result = await whisperPipeline(float32Audio, pipelineOpts);

    const text = result.text?.trim() || "";
    send({ type: "transcribe-result", success: true, text });
  } catch (error) {
    send({
      type: "transcribe-result",
      success: false,
      error: error.message || String(error),
    });
  }
}

function send(msg) {
  try {
    if (process.send) {
      process.send(msg);
    }
  } catch (_) {
    // Parent may have disconnected
  }
}

process.on("message", (msg) => {
  switch (msg.type) {
    case "load":
      loadModel(msg.modelName, msg.cacheDir, msg.device).catch((err) => {
        send({ type: "load-result", success: false, error: err.message });
      });
      break;
    case "transcribe":
      transcribe(msg.audioBase64, msg.language).catch((err) => {
        send({ type: "transcribe-result", success: false, error: err.message });
      });
      break;
    case "shutdown":
      // Dispose the ONNX session gracefully before exiting to avoid
      // native cleanup race conditions (SIGABRT on mutex destroy).
      (async () => {
        if (whisperPipeline) {
          try {
            if (typeof whisperPipeline.dispose === "function") {
              await whisperPipeline.dispose();
            }
          } catch (_) {
            // Best-effort cleanup
          }
          whisperPipeline = null;
        }
        // Small delay to let native threads wind down
        setTimeout(() => process.exit(0), 200);
      })();
      break;
  }
});

// Signal readiness to parent
send({ type: "ready" });
