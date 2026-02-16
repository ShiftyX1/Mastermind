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
 *     { type: 'load',       modelName, cacheDir }
 *     { type: 'transcribe', audioBase64 }          // PCM 16-bit 16kHz as base64
 *     { type: 'shutdown' }
 *
 *   worker → parent:
 *     { type: 'load-result',       success, error? }
 *     { type: 'transcribe-result', success, text?, error? }
 *     { type: 'status',            message }
 *     { type: 'ready' }
 */

let whisperPipeline = null;

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

async function loadModel(modelName, cacheDir) {
  if (whisperPipeline) {
    send({ type: "load-result", success: true });
    return;
  }

  try {
    send({
      type: "status",
      message: "Loading Whisper model (first time may take a while)...",
    });
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = cacheDir;
    whisperPipeline = await pipeline(
      "automatic-speech-recognition",
      modelName,
      {
        dtype: "q8",
        device: "cpu",
      },
    );
    send({ type: "load-result", success: true });
  } catch (error) {
    send({ type: "load-result", success: false, error: error.message });
  }
}

async function transcribe(audioBase64) {
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

    const result = await whisperPipeline(float32Audio, {
      sampling_rate: 16000,
      language: "en",
      task: "transcribe",
    });

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
      loadModel(msg.modelName, msg.cacheDir).catch((err) => {
        send({ type: "load-result", success: false, error: err.message });
      });
      break;
    case "transcribe":
      transcribe(msg.audioBase64).catch((err) => {
        send({ type: "transcribe-result", success: false, error: err.message });
      });
      break;
    case "shutdown":
      process.exit(0);
      break;
  }
});

// Signal readiness to parent
send({ type: "ready" });
