<!-- <img width="1299" height="424" alt="cd (1)" src="https://github.com/user-attachments/assets/b25fff4d-043d-4f38-9985-f832ae0d0f6e" /> -->
# Mastermind

---

> [!NOTE]  
> Use latest MacOS and Windows version, older versions have limited support

> [!NOTE]  
> During testing it wont answer if you ask something, you need to simulate interviewer asking question, which it will answer

A real-time AI assistant that provides contextual help during video calls, interviews, presentations, and meetings using screen capture and audio analysis. It is fork of [Cheating Daddy](https://github.com/sohzm/cheating-daddy) project.

## Features

- **Live AI Assistance**: Real-time help powered by Gemini API / OpenAI SDK / OpenAI Realtime API, so you can choose which one you want to use
- **Screen & Audio Capture**: Analyzes what you see and hear for contextual responses
- **Multiple Profiles**: Interview, Sales Call, Business Meeting, Presentation, Negotiation
- **Transparent Overlay**: Always-on-top window that can be positioned anywhere, if something goes wrong you can hide it without stoping session and losing context!
- **Click-through Mode**: Make window transparent to clicks when needed
- **Cross-platform**: Works on macOS, Windows, and Linux (kinda, dont use, just for testing rn)

## Setup

1. **Get a API Key**: Visit [Google AI Studio](https://aistudio.google.com/apikey) or [OpenAI](https://platform.openai.com/docs/api-reference) or any other OpenAI-compatible API!
2. **Install Dependencies**: `pnpm install`
3. **Run the App**: `pnpm start`

## Usage

1. Enter your API key in the main window, select provider and model you want to use in preferences
2. Choose your profile and language in settings
3. Click "Start Session" to begin, if you want to use push-to-talk mode, you can enable it in preferences
4. Position the window using keyboard shortcuts, or use your mouse to move it
5. The AI will provide real-time assistance based on your screen and system audio/microphone input, you can also send text messages to AI by pressing Enter

## Keyboard Shortcuts

> [!NOTE]  
> All keyboard shortcuts are customizable in settings. You can check some default shortcuts below.

- **Window Movement**: `Ctrl/Cmd + Arrow Keys` - Move window
- **Click-through**: `Ctrl/Cmd + M` - Toggle mouse events
- **Close/Back**: `Ctrl/Cmd + \` - Close window or go back
- **Send Message**: `Enter` - Send text to AI

## Audio Capture

- **macOS**: [SystemAudioDump](https://github.com/Mohammed-Yasin-Mulla/Sound) for system audio capture, you can use microphone input as well
- **Windows**: Loopback audio capture, you can use microphone input as well
- **Linux**: Microphone input

## Requirements

- Electron-compatible OS (macOS, Windows, Linux)
- AI Provider API key
- Screen recording permissions
- Microphone/audio permissions
