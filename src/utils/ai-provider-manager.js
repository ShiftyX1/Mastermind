const { BrowserWindow, ipcMain } = require('electron');
const { getSystemPrompt } = require('./prompts');
const { getAvailableModel, incrementLimitCount, getApiKey, getOpenAICredentials, getOpenAISDKCredentials, getPreferences } = require('../storage');

// Import provider implementations
const geminiProvider = require('./gemini');
const openaiRealtimeProvider = require('./openai-realtime');
const openaiSdkProvider = require('./openai-sdk');

// Conversation tracking (shared across providers)
let currentSessionId = null;
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let currentProvider = 'gemini'; // 'gemini', 'openai-realtime', or 'openai-sdk'
let providerConfig = {};

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    conversationHistory = [];
    screenAnalysisHistory = [];
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    console.log('New conversation session started:', currentSessionId, 'profile:', profile, 'provider:', currentProvider);

    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: profile,
            customPrompt: customPrompt || '',
            provider: currentProvider,
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
    console.log('Saved conversation turn:', conversationTurn);

    sendToRenderer('save-conversation-turn', {
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
        provider: currentProvider,
    };

    screenAnalysisHistory.push(analysisEntry);
    console.log('Saved screen analysis:', analysisEntry);

    sendToRenderer('save-screen-analysis', {
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
        provider: currentProvider,
    };
}

// Get provider configuration from storage
async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));

            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        return stored || '${defaultValue}';
                    } catch (e) {
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting for', key, ':', error.message);
    }
    return defaultValue;
}

// Initialize AI session based on selected provider
async function initializeAISession(customPrompt = '', profile = 'interview', language = 'en-US') {
    // Read provider from file-based storage (preferences.json)
    const prefs = getPreferences();
    const provider = prefs.aiProvider || 'gemini';
    currentProvider = provider;

    console.log('Initializing AI session with provider:', provider);

    // Check if Google Search is enabled for system prompt
    const googleSearchEnabled = prefs.googleSearchEnabled ?? true;
    const systemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled);

    if (provider === 'openai-realtime') {
        // Get OpenAI Realtime configuration
        const creds = getOpenAICredentials();

        if (!creds.apiKey) {
            sendToRenderer('update-status', 'OpenAI API key not configured');
            return false;
        }

        providerConfig = {
            apiKey: creds.apiKey,
            baseUrl: creds.baseUrl || null,
            model: creds.model,
            systemPrompt,
            language,
            isReconnect: false,
        };

        initializeNewSession(profile, customPrompt);

        try {
            await openaiRealtimeProvider.initializeOpenAISession(providerConfig, conversationHistory);
            return true;
        } catch (error) {
            console.error('Failed to initialize OpenAI Realtime session:', error);
            sendToRenderer('update-status', 'Failed to connect to OpenAI Realtime');
            return false;
        }
    } else if (provider === 'openai-sdk') {
        // Get OpenAI SDK configuration (for BotHub, etc.)
        const creds = getOpenAISDKCredentials();

        if (!creds.apiKey) {
            sendToRenderer('update-status', 'OpenAI SDK API key not configured');
            return false;
        }

        providerConfig = {
            apiKey: creds.apiKey,
            baseUrl: creds.baseUrl || null,
            model: creds.model,
            visionModel: creds.visionModel,
            whisperModel: creds.whisperModel,
        };

        initializeNewSession(profile, customPrompt);

        try {
            await openaiSdkProvider.initializeOpenAISDK(providerConfig);
            openaiSdkProvider.setSystemPrompt(systemPrompt);
            sendToRenderer('update-status', 'Ready (OpenAI SDK)');
            return true;
        } catch (error) {
            console.error('Failed to initialize OpenAI SDK:', error);
            sendToRenderer('update-status', 'Failed to initialize OpenAI SDK: ' + error.message);
            return false;
        }
    } else {
        // Use Gemini (default)
        const apiKey = getApiKey();
        if (!apiKey) {
            sendToRenderer('update-status', 'Gemini API key not configured');
            return false;
        }

        const session = await geminiProvider.initializeGeminiSession(apiKey, customPrompt, profile, language);
        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;
            return true;
        }
        return false;
    }
}

// Send audio to appropriate provider
async function sendAudioContent(data, mimeType, isSystemAudio = true) {
    if (currentProvider === 'openai-realtime') {
        return await openaiRealtimeProvider.sendAudioToOpenAI(data);
    } else if (currentProvider === 'openai-sdk') {
        // OpenAI SDK buffers audio and transcribes on flush
        return await openaiSdkProvider.processAudioChunk(data, mimeType);
    } else {
        // Gemini
        if (!global.geminiSessionRef?.current) {
            return { success: false, error: 'No active Gemini session' };
        }
        try {
            const marker = isSystemAudio ? '.' : ',';
            process.stdout.write(marker);
            await global.geminiSessionRef.current.sendRealtimeInput({
                audio: { data, mimeType },
            });
            return { success: true };
        } catch (error) {
            console.error('Error sending audio to Gemini:', error);
            return { success: false, error: error.message };
        }
    }
}

// Send image to appropriate provider
async function sendImageContent(data, prompt) {
    if (currentProvider === 'openai-realtime') {
        const creds = getOpenAICredentials();
        const result = await openaiRealtimeProvider.sendImageToOpenAI(data, prompt, {
            apiKey: creds.apiKey,
            baseUrl: creds.baseUrl,
            model: creds.model,
        });

        if (result.success) {
            saveScreenAnalysis(prompt, result.text, result.model);
        }

        return result;
    } else if (currentProvider === 'openai-sdk') {
        const result = await openaiSdkProvider.sendImageMessage(data, prompt);

        if (result.success) {
            saveScreenAnalysis(prompt, result.text, result.model);
        }

        return result;
    } else {
        // Use Gemini HTTP API
        const result = await geminiProvider.sendImageToGeminiHttp(data, prompt);

        // Screen analysis is saved inside sendImageToGeminiHttp for Gemini
        return result;
    }
}

// Send text message to appropriate provider
async function sendTextMessage(text) {
    if (currentProvider === 'openai-realtime') {
        return await openaiRealtimeProvider.sendTextToOpenAI(text);
    } else if (currentProvider === 'openai-sdk') {
        const result = await openaiSdkProvider.sendTextMessage(text);
        if (result.success && result.text) {
            saveConversationTurn(text, result.text);
        }
        return result;
    } else {
        // Gemini
        if (!global.geminiSessionRef?.current) {
            return { success: false, error: 'No active Gemini session' };
        }
        try {
            console.log('Sending text message to Gemini:', text);
            await global.geminiSessionRef.current.sendRealtimeInput({ text: text.trim() });
            return { success: true };
        } catch (error) {
            console.error('Error sending text to Gemini:', error);
            return { success: false, error: error.message };
        }
    }
}

// Close session for appropriate provider
async function closeSession() {
    try {
        if (currentProvider === 'openai-realtime') {
            openaiRealtimeProvider.closeOpenAISession();
        } else if (currentProvider === 'openai-sdk') {
            openaiSdkProvider.closeOpenAISDK();
        } else {
            geminiProvider.stopMacOSAudioCapture();
            if (global.geminiSessionRef?.current) {
                await global.geminiSessionRef.current.close();
                global.geminiSessionRef.current = null;
            }
        }
        return { success: true };
    } catch (error) {
        console.error('Error closing session:', error);
        return { success: false, error: error.message };
    }
}

// Setup IPC handlers
function setupAIProviderIpcHandlers(geminiSessionRef) {
    // Store reference for Gemini
    global.geminiSessionRef = geminiSessionRef;

    // Listen for conversation turn save requests from providers
    ipcMain.on('save-conversation-turn-data', (event, { transcription, response }) => {
        saveConversationTurn(transcription, response);
    });

    ipcMain.handle('initialize-ai-session', async (event, customPrompt, profile, language) => {
        return await initializeAISession(customPrompt, profile, language);
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        return await sendAudioContent(data, mimeType, true);
    });

    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        return await sendAudioContent(data, mimeType, false);
    });

    ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
        return await sendImageContent(data, prompt);
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        return await sendTextMessage(text);
    });

    ipcMain.handle('close-session', async event => {
        return await closeSession();
    });

    // macOS system audio
    ipcMain.handle('start-macos-audio', async event => {
        if (process.platform !== 'darwin') {
            return {
                success: false,
                error: 'macOS audio capture only available on macOS',
            };
        }

        try {
            if (currentProvider === 'gemini') {
                const success = await geminiProvider.startMacOSAudioCapture(global.geminiSessionRef);
                return { success };
            } else if (currentProvider === 'openai-sdk') {
                const success = await openaiSdkProvider.startMacOSAudioCapture();
                return { success };
            } else if (currentProvider === 'openai-realtime') {
                // OpenAI Realtime uses WebSocket, handle differently if needed
                return {
                    success: false,
                    error: 'OpenAI Realtime uses WebSocket for audio',
                };
            }

            return {
                success: false,
                error: 'Unknown provider: ' + currentProvider,
            };
        } catch (error) {
            console.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async event => {
        try {
            if (currentProvider === 'gemini') {
                geminiProvider.stopMacOSAudioCapture();
            } else if (currentProvider === 'openai-sdk') {
                openaiSdkProvider.stopMacOSAudioCapture();
            }
            return { success: true };
        } catch (error) {
            console.error('Error stopping macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    // Session management
    ipcMain.handle('get-current-session', async event => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            console.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async event => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            console.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            console.log('Google Search setting updated to:', enabled);
            return { success: true };
        } catch (error) {
            console.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });

    // Provider switching
    ipcMain.handle('switch-ai-provider', async (event, provider) => {
        try {
            console.log('Switching AI provider to:', provider);
            currentProvider = provider;
            return { success: true };
        } catch (error) {
            console.error('Error switching provider:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    setupAIProviderIpcHandlers,
    initializeAISession,
    sendAudioContent,
    sendImageContent,
    sendTextMessage,
    closeSession,
    getCurrentSessionData,
    initializeNewSession,
    saveConversationTurn,
};
