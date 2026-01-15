const { BrowserWindow } = require('electron');
const WebSocket = require('ws');

// OpenAI Realtime API implementation
// Documentation: https://platform.openai.com/docs/api-reference/realtime

let ws = null;
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

// Message buffer for accumulating responses
let messageBuffer = '';
let currentTranscription = '';

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function buildContextMessage(conversationHistory) {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(turn => `User: ${turn.transcription.trim()}\nAssistant: ${turn.ai_response.trim()}`);

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

async function initializeOpenAISession(config, conversationHistory = []) {
    const { apiKey, baseUrl, systemPrompt, model, language, isReconnect } = config;

    if (!isReconnect) {
        sessionParams = config;
        reconnectAttempts = 0;
        sendToRenderer('session-initializing', true);
    }

    // Use custom baseURL or default OpenAI endpoint
    const wsUrl = baseUrl || 'wss://api.openai.com/v1/realtime';
    const fullUrl = `${wsUrl}?model=${model || 'gpt-4o-realtime-preview-2024-12-17'}`;

    return new Promise((resolve, reject) => {
        try {
            ws = new WebSocket(fullUrl, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'OpenAI-Beta': 'realtime=v1',
                },
            });

            ws.on('open', () => {
                console.log('OpenAI Realtime connection established');

                // Configure session
                const sessionConfig = {
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        instructions: systemPrompt,
                        voice: 'alloy',
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        input_audio_transcription: {
                            model: 'whisper-1',
                        },
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 500,
                        },
                        temperature: 0.8,
                        max_response_output_tokens: 4096,
                    },
                };

                ws.send(JSON.stringify(sessionConfig));

                // Restore context if reconnecting
                if (isReconnect && conversationHistory.length > 0) {
                    const contextMessage = buildContextMessage(conversationHistory);
                    if (contextMessage) {
                        ws.send(
                            JSON.stringify({
                                type: 'conversation.item.create',
                                item: {
                                    type: 'message',
                                    role: 'user',
                                    content: [{ type: 'input_text', text: contextMessage }],
                                },
                            })
                        );
                        ws.send(JSON.stringify({ type: 'response.create' }));
                    }
                }

                sendToRenderer('update-status', 'Connected to OpenAI');
                if (!isReconnect) {
                    sendToRenderer('session-initializing', false);
                }
                resolve(ws);
            });

            ws.on('message', data => {
                try {
                    const event = JSON.parse(data.toString());
                    handleOpenAIEvent(event);
                } catch (error) {
                    console.error('Error parsing OpenAI message:', error);
                }
            });

            ws.on('error', error => {
                console.error('OpenAI WebSocket error:', error);
                sendToRenderer('update-status', 'Error: ' + error.message);
                reject(error);
            });

            ws.on('close', (code, reason) => {
                console.log(`OpenAI WebSocket closed: ${code} - ${reason}`);

                if (isUserClosing) {
                    isUserClosing = false;
                    sendToRenderer('update-status', 'Session closed');
                    return;
                }

                // Attempt reconnection
                if (sessionParams && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    attemptReconnect(conversationHistory);
                } else {
                    sendToRenderer('update-status', 'Session closed');
                }
            });
        } catch (error) {
            console.error('Failed to initialize OpenAI session:', error);
            if (!isReconnect) {
                sendToRenderer('session-initializing', false);
            }
            reject(error);
        }
    });
}

function handleOpenAIEvent(event) {
    console.log('OpenAI event:', event.type);

    switch (event.type) {
        case 'session.created':
            console.log('Session created:', event.session.id);
            break;

        case 'session.updated':
            console.log('Session updated');
            sendToRenderer('update-status', 'Listening...');
            break;

        case 'input_audio_buffer.speech_started':
            console.log('Speech started');
            break;

        case 'input_audio_buffer.speech_stopped':
            console.log('Speech stopped');
            break;

        case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) {
                currentTranscription += event.transcript;
                console.log('Transcription:', event.transcript);
            }
            break;

        case 'response.audio_transcript.delta':
            if (event.delta) {
                const isNewResponse = messageBuffer === '';
                messageBuffer += event.delta;
                sendToRenderer(isNewResponse ? 'new-response' : 'update-response', messageBuffer);
            }
            break;

        case 'response.audio_transcript.done':
            console.log('Audio transcript complete');
            break;

        case 'response.text.delta':
            if (event.delta) {
                const isNewResponse = messageBuffer === '';
                messageBuffer += event.delta;
                sendToRenderer(isNewResponse ? 'new-response' : 'update-response', messageBuffer);
            }
            break;

        case 'response.done':
            if (messageBuffer.trim() !== '') {
                sendToRenderer('update-response', messageBuffer);

                // Send conversation turn to be saved
                if (currentTranscription) {
                    sendToRenderer('save-conversation-turn-data', {
                        transcription: currentTranscription,
                        response: messageBuffer,
                    });
                    currentTranscription = '';
                }
            }
            messageBuffer = '';
            sendToRenderer('update-status', 'Listening...');
            break;

        case 'error':
            console.error('OpenAI error:', event.error);
            sendToRenderer('update-status', 'Error: ' + event.error.message);
            break;

        default:
            // console.log('Unhandled event type:', event.type);
            break;
    }
}

async function attemptReconnect(conversationHistory) {
    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    messageBuffer = '';
    currentTranscription = '';

    sendToRenderer('update-status', `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const newConfig = { ...sessionParams, isReconnect: true };
        ws = await initializeOpenAISession(newConfig, conversationHistory);
        sendToRenderer('update-status', 'Reconnected! Listening...');
        console.log('OpenAI session reconnected successfully');
        return true;
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            return attemptReconnect(conversationHistory);
        }

        console.log('Max reconnection attempts reached');
        sendToRenderer('reconnect-failed', {
            message: 'Tried 3 times to reconnect to OpenAI. Check your connection and API key.',
        });
        sessionParams = null;
        return false;
    }
}

async function sendAudioToOpenAI(base64Data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not connected');
        return { success: false, error: 'No active connection' };
    }

    try {
        ws.send(
            JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Data,
            })
        );
        return { success: true };
    } catch (error) {
        console.error('Error sending audio to OpenAI:', error);
        return { success: false, error: error.message };
    }
}

async function sendTextToOpenAI(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not connected');
        return { success: false, error: 'No active connection' };
    }

    try {
        // Create a conversation item with user text
        ws.send(
            JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: text }],
                },
            })
        );

        // Trigger response generation
        ws.send(JSON.stringify({ type: 'response.create' }));

        return { success: true };
    } catch (error) {
        console.error('Error sending text to OpenAI:', error);
        return { success: false, error: error.message };
    }
}

async function sendImageToOpenAI(base64Data, prompt, config) {
    const { apiKey, baseUrl, model } = config;

    // OpenAI doesn't support images in Realtime API yet, use standard Chat Completions
    const apiEndpoint = baseUrl
        ? `${baseUrl.replace('wss://', 'https://').replace('/v1/realtime', '')}/v1/chat/completions`
        : 'https://api.openai.com/v1/chat/completions';

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: model || 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Data}`,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 4096,
                stream: true,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

            for (const line of lines) {
                const data = line.replace('data: ', '');
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    const content = json.choices[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                        isFirst = false;
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }

        return { success: true, text: fullText, model: model || 'gpt-4o' };
    } catch (error) {
        console.error('Error sending image to OpenAI:', error);
        return { success: false, error: error.message };
    }
}

function closeOpenAISession() {
    isUserClosing = true;
    sessionParams = null;

    if (ws) {
        ws.close();
        ws = null;
    }
}

module.exports = {
    initializeOpenAISession,
    sendAudioToOpenAI,
    sendTextToOpenAI,
    sendImageToOpenAI,
    closeOpenAISession,
};
