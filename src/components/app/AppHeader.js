import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class AppHeader extends LitElement {
    static styles = css`
        * {
            font-family:
                'Inter',
                -apple-system,
                BlinkMacSystemFont,
                sans-serif;
            cursor: default;
            user-select: none;
        }

        .header {
            -webkit-app-region: drag;
            display: flex;
            align-items: center;
            padding: var(--header-padding);
            background: var(--header-background);
            border-bottom: 1px solid var(--border-color);
        }

        .header-title {
            flex: 1;
            font-size: var(--header-font-size);
            font-weight: 500;
            color: var(--text-color);
            -webkit-app-region: drag;
        }

        .header-actions {
            display: flex;
            gap: var(--header-gap);
            align-items: center;
            -webkit-app-region: no-drag;
        }

        .header-actions span {
            font-size: var(--header-font-size-small);
            color: var(--text-secondary);
        }

        .button {
            background: transparent;
            color: var(--text-color);
            border: 1px solid var(--border-color);
            padding: var(--header-button-padding);
            border-radius: 3px;
            font-size: var(--header-font-size-small);
            font-weight: 500;
            transition: background 0.1s ease;
        }

        .button:hover {
            background: var(--hover-background);
        }

        .icon-button {
            background: transparent;
            color: var(--text-secondary);
            border: none;
            padding: var(--header-icon-padding);
            border-radius: 3px;
            font-size: var(--header-font-size-small);
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.1s ease;
        }

        .icon-button svg {
            width: var(--icon-size);
            height: var(--icon-size);
        }

        .icon-button:hover {
            background: var(--hover-background);
            color: var(--text-color);
        }

        :host([isclickthrough]) .button:hover,
        :host([isclickthrough]) .icon-button:hover {
            background: transparent;
        }

        .key {
            background: var(--key-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .click-through-indicator {
            font-size: 10px;
            color: var(--text-muted);
            background: var(--key-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .update-button {
            background: transparent;
            color: #f14c4c;
            border: 1px solid #f14c4c;
            padding: var(--header-button-padding);
            border-radius: 3px;
            font-size: var(--header-font-size-small);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.1s ease;
        }

        .update-button svg {
            width: 14px;
            height: 14px;
        }

        .update-button:hover {
            background: rgba(241, 76, 76, 0.1);
        }

        .status-wrapper {
            position: relative;
            display: inline-flex;
            align-items: center;
        }

        .status-text {
            font-size: var(--header-font-size-small);
            color: var(--text-secondary);
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .status-text.error {
            color: #f14c4c;
        }

        .status-tooltip {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
            background: var(--tooltip-bg, #1a1a1a);
            color: var(--tooltip-text, #ffffff);
            padding: 10px 14px;
            border-radius: 6px;
            font-size: 12px;
            max-width: 300px;
            word-wrap: break-word;
            white-space: normal;
            opacity: 0;
            visibility: hidden;
            transition:
                opacity 0.15s ease,
                visibility 0.15s ease;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            line-height: 1.4;
        }

        .status-tooltip::before {
            content: '';
            position: absolute;
            bottom: 100%;
            right: 16px;
            border: 6px solid transparent;
            border-bottom-color: var(--tooltip-bg, #1a1a1a);
        }

        .status-wrapper:hover .status-tooltip {
            opacity: 1;
            visibility: visible;
        }

        .status-tooltip .tooltip-label {
            font-size: 10px;
            text-transform: uppercase;
            opacity: 0.6;
            margin-bottom: 4px;
        }

        .status-tooltip .tooltip-content {
            color: #f14c4c;
        }

        .model-info {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .model-badge {
            font-size: 10px;
            color: var(--text-muted);
            background: var(--key-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, monospace;
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .model-badge-wrapper {
            position: relative;
            display: inline-flex;
        }

        .model-badge-wrapper .model-tooltip {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
            background: var(--tooltip-bg, #1a1a1a);
            color: var(--tooltip-text, #ffffff);
            padding: 10px 14px;
            border-radius: 6px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition:
                opacity 0.15s ease,
                visibility 0.15s ease;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
        }

        .model-badge-wrapper .model-tooltip::before {
            content: '';
            position: absolute;
            bottom: 100%;
            right: 16px;
            border: 6px solid transparent;
            border-bottom-color: var(--tooltip-bg, #1a1a1a);
        }

        .model-badge-wrapper:hover .model-tooltip {
            opacity: 1;
            visibility: visible;
        }

        .model-tooltip-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 4px;
        }

        .model-tooltip-row:last-child {
            margin-bottom: 0;
        }

        .model-tooltip-label {
            opacity: 0.7;
        }

        .model-tooltip-value {
            font-family: 'SF Mono', Monaco, monospace;
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        onCustomizeClick: { type: Function },
        onHelpClick: { type: Function },
        onHistoryClick: { type: Function },
        onCloseClick: { type: Function },
        onBackClick: { type: Function },
        onHideToggleClick: { type: Function },
        isClickThrough: { type: Boolean, reflect: true },
        updateAvailable: { type: Boolean },
        aiProvider: { type: String },
        modelInfo: { type: Object },
    };

    constructor() {
        super();
        this.currentView = 'main';
        this.statusText = '';
        this.startTime = null;
        this.onCustomizeClick = () => {};
        this.onHelpClick = () => {};
        this.onHistoryClick = () => {};
        this.onCloseClick = () => {};
        this.onBackClick = () => {};
        this.onHideToggleClick = () => {};
        this.isClickThrough = false;
        this.updateAvailable = false;
        this._timerInterval = null;
        this.aiProvider = 'gemini';
        this.modelInfo = { model: '', visionModel: '', whisperModel: '' };
    }

    connectedCallback() {
        super.connectedCallback();
        this._startTimer();
        this._checkForUpdates();
    }

    async _checkForUpdates() {
        try {
            const currentVersion = await cheatingDaddy.getVersion();
            const response = await fetch('https://raw.githubusercontent.com/sohzm/cheating-daddy/refs/heads/master/package.json');
            if (!response.ok) return;

            const remotePackage = await response.json();
            const remoteVersion = remotePackage.version;

            if (this._isNewerVersion(remoteVersion, currentVersion)) {
                this.updateAvailable = true;
            }
        } catch (err) {
            console.log('Update check failed:', err.message);
        }
    }

    _isNewerVersion(remote, current) {
        const remoteParts = remote.split('.').map(Number);
        const currentParts = current.split('.').map(Number);

        for (let i = 0; i < Math.max(remoteParts.length, currentParts.length); i++) {
            const r = remoteParts[i] || 0;
            const c = currentParts[i] || 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    }

    async _openUpdatePage() {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('open-external', 'https://cheatingdaddy.com');
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // Start/stop timer based on view change
        if (changedProperties.has('currentView')) {
            if (this.currentView === 'assistant' && this.startTime) {
                this._startTimer();
            } else {
                this._stopTimer();
            }
        }

        // Start timer when startTime is set
        if (changedProperties.has('startTime')) {
            if (this.startTime && this.currentView === 'assistant') {
                this._startTimer();
            } else if (!this.startTime) {
                this._stopTimer();
            }
        }
    }

    _startTimer() {
        // Clear any existing timer
        this._stopTimer();

        // Only start timer if we're in assistant view and have a start time
        if (this.currentView === 'assistant' && this.startTime) {
            this._timerInterval = setInterval(() => {
                // Trigger a re-render by requesting an update
                this.requestUpdate();
            }, 1000); // Update every second
        }
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    getViewTitle() {
        const titles = {
            onboarding: 'Welcome to Cheating Daddy',
            main: 'Cheating Daddy',
            customize: 'Customize',
            help: 'Help & Shortcuts',
            history: 'Conversation History',
            advanced: 'Advanced Tools',
            assistant: 'Cheating Daddy',
        };
        return titles[this.currentView] || 'Cheating Daddy';
    }

    getElapsedTime() {
        if (this.currentView === 'assistant' && this.startTime) {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            if (elapsed >= 60) {
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                return `${minutes}m ${seconds}s`;
            }
            return `${elapsed}s`;
        }
        return '';
    }

    isNavigationView() {
        const navigationViews = ['customize', 'help', 'history', 'advanced'];
        return navigationViews.includes(this.currentView);
    }

    getProviderDisplayName() {
        const names = {
            'gemini': 'Gemini',
            'openai-realtime': 'OpenAI Realtime',
            'openai-sdk': 'OpenAI SDK',
        };
        return names[this.aiProvider] || this.aiProvider;
    }

    renderModelInfo() {
        // Only show model info for OpenAI SDK provider
        if (this.aiProvider !== 'openai-sdk' || !this.modelInfo) {
            return '';
        }

        const { model, visionModel, whisperModel } = this.modelInfo;

        // Show a compact badge with tooltip for model details
        return html`
            <div class="model-badge-wrapper">
                <span class="model-badge" title="Models">${model || 'gpt-4o'}</span>
                <div class="model-tooltip">
                    <div class="model-tooltip-row">
                        <span class="model-tooltip-label">Text</span>
                        <span class="model-tooltip-value">${model || 'gpt-4o'}</span>
                    </div>
                    <div class="model-tooltip-row">
                        <span class="model-tooltip-label">Vision</span>
                        <span class="model-tooltip-value">${visionModel || 'gpt-4o'}</span>
                    </div>
                    <div class="model-tooltip-row">
                        <span class="model-tooltip-label">Speech</span>
                        <span class="model-tooltip-value">${whisperModel || 'whisper-1'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        const elapsedTime = this.getElapsedTime();
        const isError = this.statusText && (this.statusText.toLowerCase().includes('error') || this.statusText.toLowerCase().includes('failed'));
        const shortStatus = isError ? 'Error' : this.statusText;

        return html`
            <div class="header">
                <div class="header-title">${this.getViewTitle()}</div>
                <div class="header-actions">
                    ${this.currentView === 'assistant'
                        ? html`
                              ${this.renderModelInfo()}
                              <span>${elapsedTime}</span>
                              <div class="status-wrapper">
                                  <span class="status-text ${isError ? 'error' : ''}">${shortStatus}</span>
                                  ${isError
                                      ? html`
                                            <div class="status-tooltip">
                                                <div class="tooltip-label">Error Details</div>
                                                <div class="tooltip-content">${this.statusText}</div>
                                            </div>
                                        `
                                      : ''}
                              </div>
                              ${this.isClickThrough ? html`<span class="click-through-indicator">click-through</span>` : ''}
                          `
                        : ''}
                    ${this.currentView === 'main'
                        ? html`
                              ${this.updateAvailable
                                  ? html`
                                        <button class="update-button" @click=${this._openUpdatePage}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z"
                                                    clip-rule="evenodd"
                                                />
                                            </svg>
                                            Update available
                                        </button>
                                    `
                                  : ''}
                              <button class="icon-button" @click=${this.onHistoryClick}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          fill-rule="evenodd"
                                          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                                          clip-rule="evenodd"
                                      />
                                  </svg>
                              </button>
                              <button class="icon-button" @click=${this.onCustomizeClick}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          fill-rule="evenodd"
                                          d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                                          clip-rule="evenodd"
                                      />
                                  </svg>
                              </button>
                              <button class="icon-button" @click=${this.onHelpClick}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          fill-rule="evenodd"
                                          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                                          clip-rule="evenodd"
                                      />
                                  </svg>
                              </button>
                          `
                        : ''}
                    ${this.currentView === 'assistant'
                        ? html`
                              <button @click=${this.onHideToggleClick} class="button">
                                  Hide&nbsp;&nbsp;<span class="key" style="pointer-events: none;">${cheatingDaddy.isMacOS ? 'Cmd' : 'Ctrl'}</span
                                  >&nbsp;&nbsp;<span class="key">&bsol;</span>
                              </button>
                              <button @click=${this.onCloseClick} class="icon-button window-close">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
                                      />
                                  </svg>
                              </button>
                          `
                        : html`
                              <button @click=${this.isNavigationView() ? this.onBackClick : this.onCloseClick} class="icon-button window-close">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                          d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
                                      />
                                  </svg>
                              </button>
                          `}
                </div>
            </div>
        `;
    }
}

customElements.define('app-header', AppHeader);
