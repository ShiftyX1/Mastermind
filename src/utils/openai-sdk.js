const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// OpenAI SDK will be loaded dynamically
let OpenAI = null;

// OpenAI SDK-based provider (for BotHub, Azure, and other OpenAI-compatible APIs)
// This uses the standard Chat Completions API with Whisper for transcription

let openaiClient = null;
let currentConfig = null;
let conversationMessages = [];
let isProcessing = false;
let audioInputMode = 'auto';
let isPushToTalkActive = false;

// macOS audio capture
let systemAudioProc = null;
let audioBuffer = Buffer.alloc(0);
let transcriptionTimer = null;
const TRANSCRIPTION_INTERVAL_MS = 3000; // Transcribe every 3 seconds
const MIN_AUDIO_DURATION_MS = 500; // Minimum audio duration to transcribe
const SAMPLE_RATE = 24000;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

async function initializeOpenAISDK(config) {
    const { apiKey, baseUrl, model } = config;

    if (!apiKey) {
        throw new Error('OpenAI API key is required');
    }

    // Dynamic import for ES module
    if (!OpenAI) {
        const openaiModule = await import('openai');
        OpenAI = openaiModule.default;
    }

    const clientConfig = {
        apiKey: apiKey,
    };

    // Use custom baseURL if provided
    if (baseUrl && baseUrl.trim() !== '') {
        clientConfig.baseURL = baseUrl;
    }

    openaiClient = new OpenAI(clientConfig);
    currentConfig = config;
    conversationMessages = [];

    console.log('OpenAI SDK initialized with baseURL:', clientConfig.baseURL || 'default');
    sendToRenderer('update-status', 'Ready (OpenAI SDK)');

    return true;
}

function setSystemPrompt(systemPrompt) {
    // Clear conversation and set system prompt
    conversationMessages = [];
    if (systemPrompt) {
        conversationMessages.push({
            role: 'system',
            content: systemPrompt,
        });
    }
}

// Create WAV file from raw PCM data
function createWavBuffer(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const headerSize = 44;
    const fileSize = headerSize + dataSize - 8;

    const wavBuffer = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(fileSize, 4);
    wavBuffer.write('WAVE', 8);

    // fmt chunk
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // fmt chunk size
    wavBuffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
    wavBuffer.writeUInt16LE(numChannels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(byteRate, 28);
    wavBuffer.writeUInt16LE(blockAlign, 32);
    wavBuffer.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(dataSize, 40);

    // Copy PCM data
    pcmBuffer.copy(wavBuffer, 44);

    return wavBuffer;
}

async function transcribeAudio(audioBuffer, mimeType = 'audio/wav') {
    if (!openaiClient) {
        throw new Error('OpenAI client not initialized');
    }

    try {
        // Save audio buffer to temp file (OpenAI SDK requires file path)
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `audio_${Date.now()}.wav`);

        // Convert base64 to buffer if needed
        let buffer = audioBuffer;
        if (typeof audioBuffer === 'string') {
            buffer = Buffer.from(audioBuffer, 'base64');
        }

        // Create proper WAV file with header
        const wavBuffer = createWavBuffer(buffer, SAMPLE_RATE, 1, 16);
        fs.writeFileSync(tempFile, wavBuffer);

        const transcription = await openaiClient.audio.transcriptions.create({
            file: fs.createReadStream(tempFile),
            model: currentConfig.whisperModel || 'whisper-1',
            response_format: 'text',
        });

        // Clean up temp file
        try {
            fs.unlinkSync(tempFile);
        } catch (e) {
            // Ignore cleanup errors
        }

        return transcription;
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}

async function sendTextMessage(text) {
    if (!openaiClient) {
        return { success: false, error: 'OpenAI client not initialized' };
    }

    if (isProcessing) {
        return { success: false, error: 'Already processing a request' };
    }

    isProcessing = true;

    try {
        // Add user message to conversation
        conversationMessages.push({
            role: 'user',
            content: text,
        });

        sendToRenderer('update-status', 'Thinking...');

        const stream = await openaiClient.chat.completions.create({
            model: currentConfig.model || 'gpt-4o',
            messages: conversationMessages,
            stream: true,
            max_tokens: 4096,
        });

        let fullResponse = '';
        let isFirst = true;

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                fullResponse += content;
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullResponse);
                isFirst = false;
            }
        }

        // Add assistant response to conversation
        conversationMessages.push({
            role: 'assistant',
            content: fullResponse,
        });

        sendToRenderer('update-status', 'Ready');
        isProcessing = false;

        return { success: true, text: fullResponse };
    } catch (error) {
        console.error('Chat completion error:', error);
        sendToRenderer('update-status', 'Error: ' + error.message);
        isProcessing = false;
        return { success: false, error: error.message };
    }
}

async function sendImageMessage(base64Image, prompt) {
    if (!openaiClient) {
        return { success: false, error: 'OpenAI client not initialized' };
    }

    if (isProcessing) {
        return { success: false, error: 'Already processing a request' };
    }

    isProcessing = true;

    try {
        sendToRenderer('update-status', 'Analyzing image...');

        const messages = [
            ...conversationMessages,
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${base64Image}`,
                        },
                    },
                ],
            },
        ];

        const stream = await openaiClient.chat.completions.create({
            model: currentConfig.visionModel || currentConfig.model || 'gpt-4o',
            messages: messages,
            stream: true,
            max_tokens: 4096,
        });

        let fullResponse = '';
        let isFirst = true;

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                fullResponse += content;
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullResponse);
                isFirst = false;
            }
        }

        // Add to conversation history (text only for follow-ups)
        conversationMessages.push({
            role: 'user',
            content: prompt,
        });
        conversationMessages.push({
            role: 'assistant',
            content: fullResponse,
        });

        sendToRenderer('update-status', 'Ready');
        isProcessing = false;

        return { success: true, text: fullResponse, model: currentConfig.visionModel || currentConfig.model };
    } catch (error) {
        console.error('Vision error:', error);
        sendToRenderer('update-status', 'Error: ' + error.message);
        isProcessing = false;
        return { success: false, error: error.message };
    }
}

// Process audio chunk and get response
// This accumulates audio and transcribes when silence is detected or timer expires
let audioChunks = [];
let lastAudioTime = 0;
let firstChunkTime = 0;
const SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence
const MAX_BUFFER_DURATION_MS = 5000; // 5 seconds max buffering before forced transcription
let silenceCheckTimer = null;
let windowsTranscriptionTimer = null;

async function processAudioChunk(base64Audio, mimeType) {
    if (!openaiClient) {
        return { success: false, error: 'OpenAI client not initialized' };
    }

    const now = Date.now();
    const buffer = Buffer.from(base64Audio, 'base64');

    if (audioInputMode === 'push-to-talk') {
        if (!isPushToTalkActive) {
            return { success: true, ignored: true };
        }

        // In push-to-talk mode we only buffer while active
        audioChunks.push(buffer);
        lastAudioTime = now;

        return { success: true, buffering: true };
    }

    // Track first chunk time for duration-based flushing
    if (audioChunks.length === 0) {
        firstChunkTime = now;

        // Start periodic transcription timer (Windows needs this)
        if (!windowsTranscriptionTimer && process.platform === 'win32') {
            console.log('Starting Windows periodic transcription timer...');
            windowsTranscriptionTimer = setInterval(async () => {
                if (audioChunks.length > 0) {
                    const bufferDuration = Date.now() - firstChunkTime;
                    if (bufferDuration >= MAX_BUFFER_DURATION_MS) {
                        console.log(`Periodic flush: ${bufferDuration}ms of audio buffered`);
                        await flushAudioAndTranscribe();
                    }
                }
            }, 2000); // Check every 2 seconds
        }
    }

    // Add to audio buffer
    audioChunks.push(buffer);
    lastAudioTime = now;

    // Clear existing timer
    if (silenceCheckTimer) {
        clearTimeout(silenceCheckTimer);
    }

    // Set timer to check for silence
    silenceCheckTimer = setTimeout(async () => {
        const silenceDuration = Date.now() - lastAudioTime;
        if (silenceDuration >= SILENCE_THRESHOLD_MS && audioChunks.length > 0) {
            console.log('Silence detected, flushing audio for transcription...');
            await flushAudioAndTranscribe();
        }
    }, SILENCE_THRESHOLD_MS);

    return { success: true, buffering: true };
}

async function flushAudioAndTranscribe() {
    if (audioChunks.length === 0) {
        return { success: true, text: '' };
    }

    // Clear Windows transcription timer
    if (windowsTranscriptionTimer) {
        clearInterval(windowsTranscriptionTimer);
        windowsTranscriptionTimer = null;
    }

    try {
        // Combine all audio chunks
        const combinedBuffer = Buffer.concat(audioChunks);
        const chunkCount = audioChunks.length;
        audioChunks = [];
        firstChunkTime = 0;

        // Calculate audio duration
        const bytesPerSample = 2;
        const audioDurationMs = (combinedBuffer.length / bytesPerSample / SAMPLE_RATE) * 1000;

        console.log(`Transcribing ${chunkCount} chunks (${audioDurationMs.toFixed(0)}ms of audio)...`);

        // Transcribe
        const transcription = await transcribeAudio(combinedBuffer);

        if (transcription && transcription.trim()) {
            console.log('Transcription result:', transcription);
            // Send to chat
            const response = await sendTextMessage(transcription);

            return {
                success: true,
                transcription: transcription,
                response: response.text,
            };
        }

        return { success: true, text: '' };
    } catch (error) {
        console.error('Flush audio error:', error);
        return { success: false, error: error.message };
    }
}

function notifyPushToTalkState() {
    sendToRenderer('push-to-talk-state', {
        active: isPushToTalkActive,
        inputMode: audioInputMode,
    });
}

function resetRealtimeAudioBuffer() {
    audioChunks = [];
    firstChunkTime = 0;
    lastAudioTime = 0;

    if (silenceCheckTimer) {
        clearTimeout(silenceCheckTimer);
        silenceCheckTimer = null;
    }
    if (windowsTranscriptionTimer) {
        clearInterval(windowsTranscriptionTimer);
        windowsTranscriptionTimer = null;
    }
}

function updateTranscriptionTimerForPushToTalk() {
    if (audioInputMode === 'push-to-talk') {
        stopTranscriptionTimer();
        return;
    }

    if (systemAudioProc && !transcriptionTimer) {
        startTranscriptionTimer();
    }
}

async function setPushToTalkActive(active) {
    const wasActive = isPushToTalkActive;
    isPushToTalkActive = active;

    if (active) {
        // Starting recording - clear any old buffers
        resetRealtimeAudioBuffer();
        audioBuffer = Buffer.alloc(0);
        console.log('Push-to-Talk: Recording started');
        sendToRenderer('update-status', 'Recording...');
    }

    notifyPushToTalkState();

    // When user stops recording in PTT mode, send audio for transcription
    if (!active && wasActive && audioInputMode === 'push-to-talk') {
        console.log('Push-to-Talk: Recording stopped, transcribing...');
        sendToRenderer('update-status', 'Transcribing...');

        // For browser-based audio (Windows)
        if (audioChunks.length > 0) {
            await flushAudioAndTranscribe();
        }
        // For macOS SystemAudioDump
        if (audioBuffer.length > 0) {
            await transcribeBufferedAudio(true); // Force transcription
        }

        sendToRenderer('update-status', 'Listening...');
    }
}

async function togglePushToTalk() {
    if (isPushToTalkActive) {
        await setPushToTalkActive(false);
    } else {
        await setPushToTalkActive(true);
    }
}

function updatePushToTalkSettings(inputMode) {
    if (inputMode) {
        audioInputMode = inputMode;
    }

    if (audioInputMode !== 'push-to-talk' && isPushToTalkActive) {
        isPushToTalkActive = false;
    }

    if (audioInputMode !== 'push-to-talk') {
        resetRealtimeAudioBuffer();
        audioBuffer = Buffer.alloc(0);
    }

    notifyPushToTalkState();
    updateTranscriptionTimerForPushToTalk();
}

function clearConversation() {
    const systemMessage = conversationMessages.find(m => m.role === 'system');
    conversationMessages = systemMessage ? [systemMessage] : [];
    audioChunks = [];

    // Clear timers
    if (silenceCheckTimer) {
        clearTimeout(silenceCheckTimer);
        silenceCheckTimer = null;
    }
    if (windowsTranscriptionTimer) {
        clearInterval(windowsTranscriptionTimer);
        windowsTranscriptionTimer = null;
    }
}

function closeOpenAISDK() {
    stopMacOSAudioCapture();
    openaiClient = null;
    currentConfig = null;
    conversationMessages = [];
    audioChunks = [];
    isProcessing = false;
    isPushToTalkActive = false;

    // Clear timers
    if (silenceCheckTimer) {
        clearTimeout(silenceCheckTimer);
        silenceCheckTimer = null;
    }
    if (windowsTranscriptionTimer) {
        clearInterval(windowsTranscriptionTimer);
        windowsTranscriptionTimer = null;
    }

    notifyPushToTalkState();
    sendToRenderer('update-status', 'Disconnected');
}

// ============ macOS Audio Capture ============

async function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        const { exec } = require('child_process');
        exec('pkill -f SystemAudioDump', error => {
            // Ignore errors (process might not exist)
            setTimeout(resolve, 100);
        });
    });
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

// Calculate RMS (Root Mean Square) volume level of audio buffer
function calculateRMS(buffer) {
    const samples = buffer.length / 2;
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const sample = buffer.readInt16LE(i * 2);
        sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples);
}

// Check if audio contains speech (simple VAD based on volume threshold)
function hasSpeech(buffer, threshold = 500) {
    const rms = calculateRMS(buffer);
    return rms > threshold;
}

async function transcribeBufferedAudio(forcePTT = false) {
    if (audioBuffer.length === 0 || isProcessing) {
        return;
    }

    // In push-to-talk mode, only transcribe when explicitly requested (forcePTT=true)
    if (audioInputMode === 'push-to-talk' && !forcePTT) {
        return;
    }

    // Calculate audio duration
    const bytesPerSample = 2;
    const audioDurationMs = (audioBuffer.length / bytesPerSample / SAMPLE_RATE) * 1000;

    if (audioDurationMs < MIN_AUDIO_DURATION_MS) {
        return; // Not enough audio
    }

    // Check if there's actual speech in the audio (Voice Activity Detection)
    // Skip VAD check in PTT mode - user explicitly wants to transcribe
    if (!forcePTT && !hasSpeech(audioBuffer)) {
        // Clear buffer if it's just silence/noise
        audioBuffer = Buffer.alloc(0);
        return;
    }

    // Take current buffer and reset
    const currentBuffer = audioBuffer;
    audioBuffer = Buffer.alloc(0);

    try {
        console.log(`Transcribing ${audioDurationMs.toFixed(0)}ms of audio...`);
        if (!forcePTT) {
            sendToRenderer('update-status', 'Transcribing...');
        }

        const transcription = await transcribeAudio(currentBuffer, 'audio/wav');

        if (transcription && transcription.trim() && transcription.trim().length > 2) {
            console.log('Transcription:', transcription);
            sendToRenderer('update-status', 'Processing...');

            // Send to chat
            await sendTextMessage(transcription);
        } else if (forcePTT) {
            console.log('Push-to-Talk: No speech detected in recording');
        }

        if (!forcePTT) {
            sendToRenderer('update-status', 'Listening...');
        }
    } catch (error) {
        console.error('Transcription error:', error);
        if (!forcePTT) {
            sendToRenderer('update-status', 'Listening...');
        }
    }
}

async function startMacOSAudioCapture() {
    if (process.platform !== 'darwin') return false;

    // Kill any existing SystemAudioDump processes first
    await killExistingSystemAudioDump();

    console.log('=== Starting macOS audio capture (OpenAI SDK) ===');
    sendToRenderer('update-status', 'Starting audio capture...');

    const { app } = require('electron');
    const fs = require('fs');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    console.log('SystemAudioDump config:', {
        path: systemAudioPath,
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        exists: fs.existsSync(systemAudioPath),
    });

    // Check if file exists
    if (!fs.existsSync(systemAudioPath)) {
        console.error('FATAL: SystemAudioDump not found at:', systemAudioPath);
        sendToRenderer('update-status', 'Error: Audio binary not found');
        return false;
    }

    // Check and fix executable permissions
    try {
        fs.accessSync(systemAudioPath, fs.constants.X_OK);
        console.log('SystemAudioDump is executable');
    } catch (err) {
        console.warn('SystemAudioDump not executable, fixing permissions...');
        try {
            fs.chmodSync(systemAudioPath, 0o755);
            console.log('Fixed executable permissions');
        } catch (chmodErr) {
            console.error('Failed to fix permissions:', chmodErr);
            sendToRenderer('update-status', 'Error: Cannot execute audio binary');
            return false;
        }
    }

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
        },
    };

    console.log('Spawning SystemAudioDump...');
    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        console.error('FATAL: Failed to start SystemAudioDump - no PID');
        sendToRenderer('update-status', 'Error: Audio capture failed to start');
        return false;
    }

    console.log('SystemAudioDump started with PID:', systemAudioProc.pid);

    const CHUNK_DURATION = 0.1;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let tempBuffer = Buffer.alloc(0);
    let chunkCount = 0;
    let firstDataReceived = false;

    systemAudioProc.stdout.on('data', data => {
        if (!firstDataReceived) {
            firstDataReceived = true;
            console.log('First audio data received! Size:', data.length);
            sendToRenderer('update-status', 'Listening...');
        }

        tempBuffer = Buffer.concat([tempBuffer, data]);

        while (tempBuffer.length >= CHUNK_SIZE) {
            const chunk = tempBuffer.slice(0, CHUNK_SIZE);
            tempBuffer = tempBuffer.slice(CHUNK_SIZE);

            // Convert stereo to mono
            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;

            if (audioInputMode === 'push-to-talk' && !isPushToTalkActive) {
                continue;
            }

            // Add to audio buffer for transcription
            audioBuffer = Buffer.concat([audioBuffer, monoChunk]);

            chunkCount++;
            if (chunkCount % 100 === 0) {
                console.log(`Audio: ${chunkCount} chunks processed, buffer size: ${audioBuffer.length}`);
            }
        }

        // Limit buffer size (max 30 seconds of audio)
        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 30;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        const msg = data.toString();
        console.error('SystemAudioDump stderr:', msg);
        if (msg.toLowerCase().includes('error')) {
            sendToRenderer('update-status', 'Audio error: ' + msg.substring(0, 50));
        }
    });

    systemAudioProc.on('close', (code, signal) => {
        console.log('SystemAudioDump closed:', { code, signal, chunksProcessed: chunkCount, tempBufferSize: tempBuffer.length });
        if (code !== 0 && code !== null) {
            sendToRenderer('update-status', `Audio stopped (exit: ${code}, signal: ${signal})`);
        }
        systemAudioProc = null;
        stopTranscriptionTimer();
    });

    systemAudioProc.on('error', err => {
        console.error('SystemAudioDump spawn error:', err.message, err.stack);
        sendToRenderer('update-status', 'Audio error: ' + err.message);
        systemAudioProc = null;
        stopTranscriptionTimer();
    });

    systemAudioProc.on('exit', (code, signal) => {
        console.log('SystemAudioDump exit event:', { code, signal });
    });

    // Start periodic transcription
    updateTranscriptionTimerForPushToTalk();

    sendToRenderer('update-status', 'Listening...');

    return true;
}

function startTranscriptionTimer() {
    // Don't start auto-transcription timer in push-to-talk mode
    if (audioInputMode === 'push-to-talk') {
        return;
    }
    stopTranscriptionTimer();
    transcriptionTimer = setInterval(transcribeBufferedAudio, TRANSCRIPTION_INTERVAL_MS);
}

function stopTranscriptionTimer() {
    if (transcriptionTimer) {
        clearInterval(transcriptionTimer);
        transcriptionTimer = null;
    }
}

function stopMacOSAudioCapture() {
    stopTranscriptionTimer();

    if (systemAudioProc) {
        console.log('Stopping SystemAudioDump for OpenAI SDK...');
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }

    audioBuffer = Buffer.alloc(0);
}

module.exports = {
    initializeOpenAISDK,
    setSystemPrompt,
    transcribeAudio,
    sendTextMessage,
    sendImageMessage,
    processAudioChunk,
    flushAudioAndTranscribe,
    togglePushToTalk,
    updatePushToTalkSettings,
    clearConversation,
    closeOpenAISDK,
    startMacOSAudioCapture,
    stopMacOSAudioCapture,
};
