import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class ScreenPickerDialog extends LitElement {
    static properties = {
        sources: { type: Array },
        visible: { type: Boolean },
    };

    static styles = css`
        :host {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            align-items: center;
            justify-content: center;
        }

        :host([visible]) {
            display: flex;
        }

        .dialog {
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 24px;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
        }

        h2 {
            margin: 0 0 16px 0;
            color: var(--text-color);
            font-size: 18px;
            font-weight: 500;
        }

        .sources-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        .source-item {
            background: var(--input-background);
            border: 2px solid transparent;
            border-radius: 6px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .source-item:hover {
            border-color: var(--border-default);
            background: var(--button-hover);
        }

        .source-item.selected {
            border-color: var(--accent-color);
            background: var(--button-hover);
        }

        .source-thumbnail {
            width: 100%;
            height: 120px;
            object-fit: contain;
            background: #1a1a1a;
            border-radius: 4px;
            margin-bottom: 8px;
        }

        .source-name {
            color: var(--text-color);
            font-size: 13px;
            text-align: center;
            word-break: break-word;
        }

        .buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        button {
            background: var(--button-background);
            color: var(--text-color);
            border: 1px solid var(--border-color);
            padding: 8px 16px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            transition: background-color 0.1s ease;
        }

        button:hover {
            background: var(--button-hover);
        }

        button.primary {
            background: var(--accent-color);
            color: white;
            border-color: var(--accent-color);
        }

        button.primary:hover {
            background: var(--accent-hover);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `;

    constructor() {
        super();
        this.sources = [];
        this.visible = false;
        this.selectedSource = null;
    }

    selectSource(source) {
        this.selectedSource = source;
        this.requestUpdate();
    }

    confirm() {
        if (this.selectedSource) {
            this.dispatchEvent(
                new CustomEvent('source-selected', {
                    detail: { source: this.selectedSource },
                })
            );
        }
    }

    cancel() {
        this.dispatchEvent(new CustomEvent('cancelled'));
    }

    render() {
        return html`
            <div class="dialog">
                <h2>Choose screen or window to share</h2>
                <div class="sources-grid">
                    ${this.sources.map(
                        source => html`
                            <div
                                class="source-item ${this.selectedSource?.id === source.id ? 'selected' : ''}"
                                @click=${() => this.selectSource(source)}
                            >
                                <img class="source-thumbnail" src="${source.thumbnail}" alt="${source.name}" />
                                <div class="source-name">${source.name}</div>
                            </div>
                        `
                    )}
                </div>
                <div class="buttons">
                    <button @click=${this.cancel}>Cancel</button>
                    <button class="primary" @click=${this.confirm} ?disabled=${!this.selectedSource}>Share</button>
                </div>
            </div>
        `;
    }
}

customElements.define('screen-picker-dialog', ScreenPickerDialog);
