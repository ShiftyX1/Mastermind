<div align="center">
  <img src="assets/images/logo.png" alt="Mastermind Logo" width="200"/>
  
  # Mastermind
  
  ### Your AI Assistant for High-Stakes Conversations
  
  *Real-time contextual suggestions when you need them most*
  
  [![Release](https://img.shields.io/github/actions/workflow/status/ShiftyX1/Mastermind/release.yml?label=release)](https://github.com/ShiftyX1/Mastermind/actions/workflows/release.yml)
  [![License](https://img.shields.io/badge/license-GPL3.0-blue.svg)](LICENSE)
  [![Latest Version](https://img.shields.io/github/v/release/ShiftyX1/Mastermind?include_prereleases&label=latest)](https://github.com/ShiftyX1/Mastermind/releases)
  [![Stable Version](https://img.shields.io/github/v/release/ShiftyX1/Mastermind?label=stable)](https://github.com/ShiftyX1/Mastermind/releases)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](#requirements)
  
</div>

---

## What is Mastermind?

Mastermind is an **AI assistant** for high-stakes conversations. Whether you're in a job interview, closing a deal, or navigating a complex negotiation, Mastermind analyzes what you see and hear in real-time, providing contextual suggestions and talking points to support your responses.

Think of it as having an experienced coach reviewing the conversation and offering suggestions, helping you recall relevant information and structure your thoughts more effectively. The AI provides support material—you still need to understand, adapt, and deliver the responses in your own words.

> [!WARNING]
> **AI models can and do make mistakes.** Suggestions may contain errors, outdated information, or inappropriate content. This tool is designed to assist people who already have relevant knowledge and need help organizing their thoughts—not to fake expertise you don't possess. Always verify critical information and use your own judgment.

### The Hidden Assistant Advantage

Mastermind operates discreetly with a transparent overlay that blends into your screen. The system analyzes both visual content and audio in real-time, generating contextual suggestions within seconds. It adapts its suggestions based on your selected scenario—interview, sales, meeting, or presentation. Ghost mode allows you to interact with content behind the overlay without closing it.

**Remember:** This is an assistive tool, not a magic solution. It works best when you have genuine knowledge and need support organizing your thoughts under pressure.

## Key Features

### Real-Time Multi-Modal Analysis
Mastermind captures your screen and audio simultaneously, processing both visual content and audio streams to understand conversation context. It analyzes what's being discussed and generates relevant suggestions based on that context. The system supports dual-stream audio capture to distinguish between system audio and your microphone input, though transcription accuracy depends on audio quality, accents, and background noise.

### Local-First Privacy Option
Choose between cloud AI providers for maximum performance or run everything locally with Ollama integration and offline Whisper.js transcription. When using local processing, no audio or screen data ever leaves your machine. The local transcription engine uses ONNX Runtime with GPU acceleration support for fast, private speech-to-text conversion.

### Conversation History & Context
Mastermind saves conversation turns during the session, building context as the conversation progresses. You can view session history and export conversations for later review. The AI uses this accumulated context to provide more relevant suggestions as it learns about the discussion topic—though the quality of contextual understanding is limited by the AI model's capabilities and the clarity of the captured audio/screen content.

### Specialized Profiles

Mastermind comes with six pre-configured personas designed for different scenarios:

**Job Interview** — Suggested responses to technical and behavioral questions, STAR method frameworks, and structured talking points based on your background.

**Sales Call** — Objection handling suggestions, closing technique ideas, pricing strategy considerations, and rapport building approaches.

**Business Meeting** — Data-driven talking points, strategic recommendations, and action-oriented communication suggestions.

**Presentation** — Fact-checking support, audience engagement ideas, and recovery suggestions for unexpected situations.

**Negotiation** — Tactical considerations, counter-offer frameworks, and strategic talking points to support your position.

**Exam Assistant** — Information lookup and answer suggestions for exam questions, optimized for quick reference.

### Invisible Design
The transparent overlay stays on top without blocking your view, with keyboard-driven positioning for quick adjustments. You can hide the window instantly with one click if needed, and customize opacity to match your environment perfectly.

### Flexible AI Backend

Mastermind supports multiple AI providers and can work with both cloud and local models:

**Google Gemini** — Fast, cost-effective multimodal processing with excellent vision capabilities. Supports Gemini 2.0 Flash with real-time API for ultra-low latency responses.

**OpenAI** — Industry-leading language understanding with GPT-4 and GPT-4o models.

**Groq** — High-speed inference with competitive pricing and excellent performance.

**Ollama** — Run completely local AI models on your machine for full privacy. No data ever leaves your device.

**Any OpenAI-Compatible API** — Connect to LocalAI, LM Studio, or any custom endpoint that follows the OpenAI API format.

---

## Advanced Features

**Response Modes** — Toggle between Brief mode (1-3 sentences, optimal for quick glances) and Detailed mode (comprehensive explanations with full context) based on your needs during the session.

**Google Search Integration** — Optional real-time web search capability allows the AI to fetch current information. Note that search results may include outdated or incorrect information—always verify critical facts from authoritative sources.

**Custom System Prompts** — Tailor the AI's behavior with custom instructions specific to your industry, role, or situation. Add your resume, company information, or specialized knowledge to improve context relevance.

**Multi-Language Support** — Works in 30+ languages including English, Spanish, German, French, Japanese, Korean, Chinese, Hindi, Arabic, and many more. Auto-detection available for multilingual conversations, though accuracy varies by language and accent.

**Customizable Keyboard Shortcuts** — Every shortcut can be remapped to your preference. Create your own workflow that feels natural to you.

---

## Getting Started

### Installation

#### For Users (Recommended)

Download the latest release for your platform from the [GitHub Releases](https://github.com/ShiftyX1/Mastermind/releases) page:

**macOS:**
1. Download `Mastermind-[version].dmg`
2. Open the DMG file and drag Mastermind to your Applications folder
3. Launch Mastermind from Applications (you may need to allow the app in System Preferences → Security & Privacy on first launch)

**Windows:**
1. Download `Mastermind-[version]-Setup.exe`
2. Run the installer and follow the setup wizard
3. Launch Mastermind from the Start menu or desktop shortcut

#### For Developers

If you want to build from source or contribute to development:

```bash
# Clone the repository
git clone https://github.com/ShiftyX1/Mastermind.git
cd Mastermind

# Install dependencies
pnpm install

# Launch in development mode
pnpm start

# Build distributable packages (DMG for macOS, Setup.exe for Windows)
pnpm run make

# Package without creating installers
pnpm run package
```

### First-Time Setup

**Get Your AI Key:** Start by obtaining an API key from [Google AI Studio](https://aistudio.google.com/apikey) (recommended for beginners), [OpenAI Platform](https://platform.openai.com/api-keys), [Groq Console](https://console.groq.com), or configure a local Ollama instance for complete privacy.

**Configure Your Assistant:** Enter your API key in the main window and select your preferred AI provider and model. Choose your primary use case profile from the six available scenarios. Select your language or use Auto for multilingual support.

**Start Your Session:** Click "Start Session" to activate your hidden assistant. Grant screen recording and audio capture permissions when prompted by your system. Position the overlay window where it's most useful and adjust opacity to blend naturally with your environment.

### Daily Usage

**Starting a Session:** Select the appropriate profile for your scenario—Interview, Sales, Meeting, Presentation, Negotiation, or Exam. Adjust opacity and position to blend naturally with your environment. Choose your audio mode: Speaker Only (system audio), Microphone Only, or Both for dual-stream capture.

**During Your Conversation:** The AI analyzes your screen and audio context in real-time, with suggestions appearing in the overlay. You can type questions directly for clarification and use keyboard shortcuts to reposition or hide the window. Toggle between brief and detailed response modes depending on your needs.

**Important:** Treat AI suggestions as reference material, not verified facts. Quickly scan suggestions, extract useful points, and deliver responses in your own words with your own understanding. Don't read AI responses verbatim—this often sounds unnatural and may include errors.

**Pro Tips:** Position the window in your natural eye-line to avoid obvious glances. Use click-through mode when you need to interact with content behind the overlay. Keep sessions focused on one topic for better context. Enable local transcription when working with sensitive information.

---

## Keyboard Shortcuts

Master these shortcuts for seamless, discreet operation:

| Action | Shortcut | Purpose |
|--------|----------|---------|
| **Move Window** | `Ctrl/Cmd + Arrow Keys` | Reposition without using mouse |
| **Toggle Click-Through** | `Ctrl/Cmd + M` | Make window transparent to clicks |
| **Quick Hide** | `Ctrl/Cmd + \` | Instantly hide/show or go back |
| **Send Message** | `Enter` | Send text query to AI |
| **Quick Position** | Custom | Set your favorite window positions |

> **Pro Tip**: All shortcuts are fully customizable in settings. Create your own stealth workflow!

---

## Audio Capture Technology

Mastermind uses advanced audio capture to understand conversations in real-time, with support for both cloud and local transcription.

**macOS** — Leverages [SystemAudioDump](https://github.com/sohzm/systemAudioDump) for crystal-clear system audio capture. Supports three modes: Speaker Only (system audio), Microphone Only (your voice), or Both (simultaneous dual-stream capture).

**Windows** — Professional loopback audio capture for system sounds, with full microphone support and dual-stream capabilities for capturing both sides of the conversation.

**Linux** — Microphone input support. System audio capture is currently in development.

**Local Transcription** — Built-in offline speech-to-text using Whisper.js powered by ONNX Runtime. Your audio is processed locally on your machine without sending data to external services. Supports GPU acceleration on compatible hardware.

---

## Use Cases

### Job Interviews
Get suggested responses and frameworks for technical questions, helping you structure your thoughts using proven methods like STAR. Mastermind can help you recall relevant examples from your background and organize talking points, but you need to adapt and deliver them authentically in your own voice.

### Sales & Client Calls
Access reference material for objection handling and competitive positioning. The system can suggest talking points and strategies by analyzing the conversation context, but closing deals requires genuine understanding of your product and the client's needs—AI suggestions are starting points, not scripts to read verbatim.

### Business Negotiations
Receive strategic considerations and framework suggestions based on the conversation flow. Mastermind can help you structure counter-offers and identify discussion points, but successful negotiation requires reading the room, building rapport, and making judgment calls that AI cannot make for you.

### Presentations & Demos
Get quick fact-checking and audience engagement ideas during your presentation. If questions arise, Mastermind can suggest relevant information, but you should verify accuracy and ensure you genuinely understand what you're presenting—especially important for technical content where deep knowledge is expected.

---

## System Requirements

| Component | Requirement |
|-----------|-------------|
| **Operating System** | macOS 10.15+, Windows 10/11 (latest versions recommended) |
| **Permissions** | Screen recording, audio capture (system audio and/or microphone) |
| **Internet** | Required for cloud AI providers (Gemini, OpenAI, Groq). Optional for local Ollama models |
| **AI Provider** | API key from Gemini, OpenAI, Groq, or local Ollama installation |
| **For Local Transcription** | 4GB+ RAM recommended, GPU acceleration optional but recommended |

**Current Version:** 0.7.3

> [!NOTE]  
> **Platform Support**: macOS and Windows are fully supported and tested. Linux support is experimental.

> [!TIP]  
> **Testing Mode**: When testing, simulate someone asking you questions. The AI responds to detected questions rather than your own queries.

---

## Known Limitations

**AI Response Quality** — AI models can make mistakes, provide outdated information, or misinterpret context. Always verify critical information and use suggestions as supporting material, not absolute truth. The quality of responses depends heavily on the AI model you choose and the context you provide.

**Not a Replacement for Knowledge** — Mastermind is a tool to help you recall and structure information, not to replace your actual expertise. The most effective use is when you already understand the subject matter and need help articulating or remembering specific details.

**Linux Support** — System audio capture is not yet implemented on Linux. Only microphone input is currently supported.

**Local Transcription Performance** — First-time usage requires downloading the Whisper model files (approximately 150MB). Transcription speed depends on your hardware; GPU acceleration is recommended for optimal performance.

**macOS Permissions** — Screen recording and audio capture require explicit system permissions. You may need to restart the app after granting permissions on first launch.

**Session Context** — The AI maintains context only within the current session. Starting a new session clears previous conversation history (though history can be saved and viewed later).

---

## Privacy & Ethics

**Your Data, Your Control:** All audio and screen capture happens locally on your device. API communications are direct and clear between you and your chosen provider. For complete privacy, you can use local AI models through Ollama without any data leaving your machine.

**Critical Disclaimers:**
- AI models can generate incorrect, biased, or inappropriate content. Always verify important information from authoritative sources.
- This tool provides suggestions, not verified facts. You are responsible for the accuracy of what you say.
- Relying entirely on AI suggestions without understanding the content can backfire—especially in technical or expert conversations where follow-up questions will reveal lack of genuine knowledge.

**Responsible Use:** 
Mastermind is designed as a preparation and cognitive support tool—like having notes or a reference guide. It works best when you already have foundational knowledge and need help organizing thoughts or recalling details under pressure.

**Ethical Boundaries:** Always comply with the rules and policies of your specific context. Many situations explicitly prohibit external assistance:
- Academic exams and certification tests typically ban any form of external help
- Some professional interviews and assessments prohibit such tools
- Certain regulated industries have strict rules about information access during calls
- Using AI assistance where prohibited can result in serious consequences, including job loss or legal issues

**Use this tool to support your genuine expertise, not to fake knowledge you don't have.** The best outcomes happen when AI assists someone who understands the subject, not when it replaces actual competence.

---

## Contributing

Based on the excellent work from [Cheating Daddy](https://github.com/sohzm/cheating-daddy).

Contributions are welcome! Please see [AGENTS.md](AGENTS.md) for development guidelines.

---

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  
### A tool to support your expertise, not replace it

*Use responsibly. Verify information. Understand what you're saying.*

</div>
