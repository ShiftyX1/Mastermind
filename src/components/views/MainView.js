import { html, css, LitElement } from "../../assets/lit-core-2.7.4.min.js";

export class MainView extends LitElement {
  static styles = css`
    * {
      font-family: var(--font);
      cursor: default;
      user-select: none;
      box-sizing: border-box;
    }

    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-xl) var(--space-lg);
    }

    .form-wrapper {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .page-title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      margin-bottom: var(--space-xs);
    }

    .page-title .mode-suffix {
      opacity: 0.5;
    }

    .page-subtitle {
      font-size: var(--font-size-sm);
      color: var(--text-muted);
      margin-bottom: var(--space-md);
    }

    /* ── Form controls ── */

    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }

    .form-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    input,
    select,
    textarea {
      background: var(--bg-elevated);
      color: var(--text-primary);
      border: 1px solid var(--border);
      padding: 10px 12px;
      width: 100%;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      font-family: var(--font);
      transition:
        border-color var(--transition),
        box-shadow var(--transition);
    }

    input:hover:not(:focus),
    select:hover:not(:focus),
    textarea:hover:not(:focus) {
      border-color: var(--text-muted);
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }

    input::placeholder,
    textarea::placeholder {
      color: var(--text-muted);
    }

    input.error {
      border-color: var(--danger, #ef4444);
    }

    select {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23999' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position: right 8px center;
      background-repeat: no-repeat;
      background-size: 14px;
      padding-right: 28px;
    }

    textarea {
      resize: vertical;
      min-height: 80px;
      line-height: var(--line-height);
    }

    .form-hint {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .form-hint a,
    .form-hint span.link {
      color: var(--accent);
      text-decoration: none;
      cursor: pointer;
    }

    .form-hint span.link:hover {
      text-decoration: underline;
    }

    .whisper-label-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .whisper-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: whisper-spin 0.8s linear infinite;
    }

    @keyframes whisper-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* ── Whisper download progress ── */

    .whisper-progress-container {
      margin-top: 8px;
      padding: 8px 10px;
      background: var(--bg-elevated, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-sm, 6px);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    }

    .whisper-progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 11px;
      color: var(--text-secondary, #999);
    }

    .whisper-progress-file {
      font-family: var(--font-mono, monospace);
      font-size: 10px;
      color: var(--text-secondary, #999);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }

    .whisper-progress-pct {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      color: var(--accent, #6cb4ee);
    }

    .whisper-progress-track {
      height: 4px;
      background: var(--border, rgba(255, 255, 255, 0.1));
      border-radius: 2px;
      overflow: hidden;
    }

    .whisper-progress-bar {
      height: 100%;
      background: var(--accent, #6cb4ee);
      border-radius: 2px;
      transition: width 0.3s ease;
      min-width: 0;
    }

    .whisper-progress-size {
      margin-top: 4px;
      font-size: 10px;
      color: var(--text-tertiary, #666);
      text-align: right;
    }

    /* ── Start button ── */

    .start-button {
      position: relative;
      overflow: hidden;
      background: #e8e8e8;
      color: #111111;
      border: none;
      padding: 12px var(--space-md);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
    }

    .start-button canvas.btn-aurora {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }

    .start-button canvas.btn-dither {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      opacity: 0.1;
      mix-blend-mode: overlay;
      pointer-events: none;
      image-rendering: pixelated;
    }

    .start-button .btn-label {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .start-button:hover {
      opacity: 0.9;
    }

    .start-button.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .start-button.disabled:hover {
      opacity: 0.5;
    }

    .shortcut-hint {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      opacity: 0.5;
      font-family: var(--font-mono);
    }

    /* ── Divider ── */

    .divider {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      margin: var(--space-sm) 0;
    }

    .divider-line {
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .divider-text {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      text-transform: lowercase;
    }

    /* ── Mode switch links ── */

    .mode-links {
      display: flex;
      justify-content: center;
      gap: var(--space-lg);
    }

    .mode-link {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      transition: color var(--transition);
    }

    .mode-link:hover {
      color: var(--text-primary);
    }

    /* ── Mode option cards ── */

    .mode-cards {
      display: flex;
      gap: var(--space-sm);
    }

    .mode-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      cursor: pointer;
      transition:
        border-color 0.2s,
        background 0.2s;
    }

    .mode-card:hover {
      border-color: var(--text-muted);
      background: var(--bg-hover);
    }

    .mode-card-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
    }

    .mode-card-desc {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      line-height: var(--line-height);
    }

    /* ── Title row with help ── */

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-xs);
    }

    .title-row .page-title {
      margin-bottom: 0;
    }

    .help-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm);
      transition: color 0.2s;
      display: flex;
      align-items: center;
    }

    .help-btn:hover {
      color: var(--text-secondary);
    }

    .help-btn * {
      pointer-events: none;
    }

    /* ── Help content ── */

    .help-content {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
      max-height: 500px;
      overflow-y: auto;
    }

    .help-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .help-section-title {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
    }

    .help-section-text {
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      line-height: var(--line-height);
    }

    .help-code {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--bg-hover);
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      display: block;
    }

    .help-link {
      color: var(--accent);
      cursor: pointer;
      text-decoration: none;
    }

    .help-link:hover {
      text-decoration: underline;
    }

    .help-models {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .help-model {
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
    }

    .help-model-name {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-primary);
    }

    .help-divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 0;
    }

    .help-warn {
      font-size: var(--font-size-xs);
      color: var(--warning);
      line-height: var(--line-height);
    }
  `;

  static properties = {
    onStart: { type: Function },
    onExternalLink: { type: Function },
    selectedProfile: { type: String },
    onProfileChange: { type: Function },
    isInitializing: { type: Boolean },
    whisperDownloading: { type: Boolean },
    whisperProgress: { type: Object },
    // Internal state
    _mode: { state: true },
    _token: { state: true },
    _geminiKey: { state: true },
    _groqKey: { state: true },
    _openaiKey: { state: true },
    _openaiCompatibleApiKey: { state: true },
    _openaiCompatibleBaseUrl: { state: true },
    _openaiCompatibleModel: { state: true },
    _availableModels: { state: true },
    _loadingModels: { state: true },
    _manualModelInput: { state: true },
    _responseProvider: { state: true },
    _tokenError: { state: true },
    _keyError: { state: true },
    // Local AI state
    _ollamaHost: { state: true },
    _ollamaModel: { state: true },
    _whisperModel: { state: true },
    _customWhisperModel: { state: true },
    _showLocalHelp: { state: true },
  };

  constructor() {
    super();
    this.onStart = () => {};
    this.onExternalLink = () => {};
    this.selectedProfile = "interview";
    this.onProfileChange = () => {};
    this.isInitializing = false;
    this.whisperDownloading = false;
    this.whisperProgress = null;

    this._mode = "byok";
    this._token = "";
    this._geminiKey = "";
    this._groqKey = "";
    this._openaiKey = "";
    this._openaiCompatibleApiKey = "";
    this._openaiCompatibleBaseUrl = "";
    this._openaiCompatibleModel = "";
    this._availableModels = [];
    this._loadingModels = false;
    this._manualModelInput = false;
    this._responseProvider = "gemini";
    this._tokenError = false;
    this._keyError = false;
    this._showLocalHelp = false;
    this._ollamaHost = "http://127.0.0.1:11434";
    this._ollamaModel = "llama3.1";
    this._whisperModel = "Xenova/whisper-small";
    this._customWhisperModel = "";

    this._animId = null;
    this._time = 0;
    this._mouseX = -1;
    this._mouseY = -1;

    this.boundKeydownHandler = this._handleKeydown.bind(this);
    this._loadFromStorage();
  }

  async _loadFromStorage() {
    try {
      const [prefs, creds] = await Promise.all([
        cheatingDaddy.storage.getPreferences(),
        cheatingDaddy.storage.getCredentials().catch(() => ({})),
      ]);

      this._mode = prefs.providerMode || "byok";

      // Load keys
      this._token = "";
      this._geminiKey =
        (await cheatingDaddy.storage.getApiKey().catch(() => "")) || "";
      this._groqKey =
        (await cheatingDaddy.storage.getGroqApiKey().catch(() => "")) || "";
      this._openaiKey = creds.openaiKey || "";

      // Load OpenAI-compatible config
      const openaiConfig = await cheatingDaddy.storage
        .getOpenAICompatibleConfig()
        .catch(() => ({}));
      this._openaiCompatibleApiKey = openaiConfig.apiKey || "";
      this._openaiCompatibleBaseUrl = openaiConfig.baseUrl || "";
      this._openaiCompatibleModel = openaiConfig.model || "";

      // Load response provider preference
      this._responseProvider = prefs.responseProvider || "gemini";

      // Load local AI settings
      this._ollamaHost = prefs.ollamaHost || "http://127.0.0.1:11434";
      this._ollamaModel = prefs.ollamaModel || "llama3.1";
      this._whisperModel = prefs.whisperModel || "Xenova/whisper-small";
      // If the saved model isn't one of the presets, it's a custom HF model
      const presets = [
        "Xenova/whisper-tiny",
        "Xenova/whisper-base",
        "Xenova/whisper-small",
        "Xenova/whisper-medium",
      ];
      if (!presets.includes(this._whisperModel)) {
        this._customWhisperModel = this._whisperModel;
        this._whisperModel = "__custom__";
      }

      this.requestUpdate();

      // Auto-load models if OpenAI-compatible is selected and URL is set
      if (
        this._responseProvider === "openai-compatible" &&
        this._openaiCompatibleBaseUrl
      ) {
        this._loadModels();
      }
    } catch (e) {
      console.error("Error loading MainView storage:", e);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.boundKeydownHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.boundKeydownHandler);
    if (this._animId) cancelAnimationFrame(this._animId);
    if (this._loadModelsTimeout) clearTimeout(this._loadModelsTimeout);
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("_mode")) {
      // Stop old animation when switching modes
      if (this._animId) {
        cancelAnimationFrame(this._animId);
        this._animId = null;
      }
    }
  }

  _initButtonAurora() {
    const btn = this.shadowRoot.querySelector(".start-button");
    const aurora = this.shadowRoot.querySelector("canvas.btn-aurora");
    const dither = this.shadowRoot.querySelector("canvas.btn-dither");
    if (!aurora || !dither || !btn) return;

    // Mouse tracking
    this._mouseX = -1;
    this._mouseY = -1;
    btn.addEventListener("mousemove", (e) => {
      const rect = btn.getBoundingClientRect();
      this._mouseX = (e.clientX - rect.left) / rect.width;
      this._mouseY = (e.clientY - rect.top) / rect.height;
    });
    btn.addEventListener("mouseleave", () => {
      this._mouseX = -1;
      this._mouseY = -1;
    });

    // Dither
    const blockSize = 8;
    const cols = Math.ceil(aurora.offsetWidth / blockSize);
    const rows = Math.ceil(aurora.offsetHeight / blockSize);
    dither.width = cols;
    dither.height = rows;
    const dCtx = dither.getContext("2d");
    const img = dCtx.createImageData(cols, rows);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    dCtx.putImageData(img, 0, 0);

    // Aurora
    const ctx = aurora.getContext("2d");
    const scale = 0.4;
    aurora.width = Math.floor(aurora.offsetWidth * scale);
    aurora.height = Math.floor(aurora.offsetHeight * scale);

    const blobs = [
      { color: [120, 160, 230], x: 0.1, y: 0.3, vx: 0.25, vy: 0.2, phase: 0 },
      {
        color: [150, 120, 220],
        x: 0.8,
        y: 0.5,
        vx: -0.2,
        vy: 0.25,
        phase: 1.5,
      },
      {
        color: [200, 140, 210],
        x: 0.5,
        y: 0.6,
        vx: 0.18,
        vy: -0.22,
        phase: 3.0,
      },
      { color: [100, 190, 190], x: 0.3, y: 0.7, vx: 0.3, vy: 0.15, phase: 4.5 },
      {
        color: [220, 170, 130],
        x: 0.7,
        y: 0.4,
        vx: -0.22,
        vy: -0.25,
        phase: 6.0,
      },
    ];

    const draw = () => {
      this._time += 0.008;
      const w = aurora.width;
      const h = aurora.height;
      const maxDim = Math.max(w, h);

      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, w, h);

      const hovering = this._mouseX >= 0;

      for (const blob of blobs) {
        const t = this._time;
        const cx = (blob.x + Math.sin(t * blob.vx + blob.phase) * 0.4) * w;
        const cy =
          (blob.y + Math.cos(t * blob.vy + blob.phase * 0.7) * 0.4) * h;
        const r = maxDim * 0.45;

        let boost = 1;
        if (hovering) {
          const dx = cx / w - this._mouseX;
          const dy = cy / h - this._mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          boost = 1 + 2.5 * Math.max(0, 1 - dist / 0.6);
        }

        const a0 = Math.min(1, 0.18 * boost);
        const a1 = Math.min(1, 0.08 * boost);
        const a2 = Math.min(1, 0.02 * boost);

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(
          0,
          `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a0})`,
        );
        grad.addColorStop(
          0.3,
          `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a1})`,
        );
        grad.addColorStop(
          0.6,
          `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${a2})`,
        );
        grad.addColorStop(
          1,
          `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0)`,
        );
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      this._animId = requestAnimationFrame(draw);
    };

    draw();
  }

  _handleKeydown(e) {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      this._handleStart();
    }
  }

  // ── Persistence ──

  async _saveMode(mode) {
    this._mode = mode;
    this._keyError = false;
    await cheatingDaddy.storage.updatePreference("providerMode", mode);
    this.requestUpdate();
  }

  async _saveGeminiKey(val) {
    this._geminiKey = val;
    this._keyError = false;
    await cheatingDaddy.storage.setApiKey(val);
    this.requestUpdate();
  }

  async _saveGroqKey(val) {
    this._groqKey = val;
    await cheatingDaddy.storage.setGroqApiKey(val);
    this.requestUpdate();
  }

  async _saveOpenaiKey(val) {
    this._openaiKey = val;
    try {
      const creds = await cheatingDaddy.storage
        .getCredentials()
        .catch(() => ({}));
      await cheatingDaddy.storage.setCredentials({ ...creds, openaiKey: val });
    } catch (e) {}
    this.requestUpdate();
  }

  async _saveOpenAICompatibleApiKey(val) {
    this._openaiCompatibleApiKey = val;
    await cheatingDaddy.storage.setOpenAICompatibleConfig(
      val,
      this._openaiCompatibleBaseUrl,
      this._openaiCompatibleModel,
    );
    this.requestUpdate();
    // Auto-load models when both key and URL are set
    this._debouncedLoadModels();
  }

  async _saveOpenAICompatibleBaseUrl(val) {
    this._openaiCompatibleBaseUrl = val;
    await cheatingDaddy.storage.setOpenAICompatibleConfig(
      this._openaiCompatibleApiKey,
      val,
      this._openaiCompatibleModel,
    );
    this.requestUpdate();
    // Auto-load models when both key and URL are set
    this._debouncedLoadModels();
  }

  async _saveOpenAICompatibleModel(val) {
    this._openaiCompatibleModel = val;
    await cheatingDaddy.storage.setOpenAICompatibleConfig(
      this._openaiCompatibleApiKey,
      this._openaiCompatibleBaseUrl,
      val,
    );
    this.requestUpdate();
  }

  async _saveResponseProvider(val) {
    this._responseProvider = val;
    await cheatingDaddy.storage.updatePreference("responseProvider", val);
    this.requestUpdate();

    // Auto-load models when switching to openai-compatible
    if (val === "openai-compatible" && this._openaiCompatibleBaseUrl) {
      this._loadModels();
    }
  }

  async _loadModels() {
    if (
      this._responseProvider !== "openai-compatible" ||
      !this._openaiCompatibleBaseUrl
    ) {
      return;
    }

    this._loadingModels = true;
    this._availableModels = [];
    this.requestUpdate();

    try {
      let modelsUrl = this._openaiCompatibleBaseUrl.trim();
      modelsUrl = modelsUrl.replace(/\/$/, "");
      if (!modelsUrl.includes("/models")) {
        modelsUrl = modelsUrl.includes("/v1")
          ? modelsUrl + "/models"
          : modelsUrl + "/v1/models";
      }

      console.log("Loading models from:", modelsUrl);

      const headers = {
        "Content-Type": "application/json",
      };

      if (this._openaiCompatibleApiKey) {
        headers["Authorization"] = `Bearer ${this._openaiCompatibleApiKey}`;
      }

      const response = await fetch(modelsUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        this._availableModels = data.data
          .map((m) => m.id || m.model || m.name)
          .filter(Boolean);
      } else if (Array.isArray(data)) {
        this._availableModels = data
          .map((m) => m.id || m.model || m.name || m)
          .filter(Boolean);
      }

      console.log("Loaded models:", this._availableModels.length);

      if (
        this._availableModels.length > 0 &&
        !this._availableModels.includes(this._openaiCompatibleModel)
      ) {
        await this._saveOpenAICompatibleModel(this._availableModels[0]);
      }
    } catch (error) {
      console.log("Could not load models:", error.message);
      this._availableModels = [];
    } finally {
      this._loadingModels = false;
      this.requestUpdate();
    }
  }

  _debouncedLoadModels() {
    if (this._loadModelsTimeout) {
      clearTimeout(this._loadModelsTimeout);
    }
    this._loadModelsTimeout = setTimeout(() => {
      this._loadModels();
    }, 500);
  }

  _toggleManualInput() {
    this._manualModelInput = !this._manualModelInput;
    this.requestUpdate();
  }

  async _saveOllamaHost(val) {
    this._ollamaHost = val;
    await cheatingDaddy.storage.updatePreference("ollamaHost", val);
    this.requestUpdate();
  }

  async _saveOllamaModel(val) {
    this._ollamaModel = val;
    await cheatingDaddy.storage.updatePreference("ollamaModel", val);
    this.requestUpdate();
  }

  async _saveWhisperModel(val) {
    this._whisperModel = val;
    if (val === "__custom__") {
      // Don't save yet — wait for the custom input
      this.requestUpdate();
      return;
    }
    this._customWhisperModel = "";
    await cheatingDaddy.storage.updatePreference("whisperModel", val);
    this.requestUpdate();
  }

  async _saveCustomWhisperModel(val) {
    this._customWhisperModel = val.trim();
    if (this._customWhisperModel) {
      await cheatingDaddy.storage.updatePreference(
        "whisperModel",
        this._customWhisperModel,
      );
    }
    this.requestUpdate();
  }

  _formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + " " + units[i];
  }

  _renderWhisperProgress() {
    const p = this.whisperProgress;
    if (!p) return "";

    const pct = Math.round(p.progress || 0);
    const fileName = p.file ? p.file.split("/").pop() : "";

    return html`
      <div class="whisper-progress-container">
        <div class="whisper-progress-header">
          <span class="whisper-progress-file" title=${p.file || ""}
            >${fileName || "Preparing..."}</span
          >
          <span class="whisper-progress-pct">${pct}%</span>
        </div>
        <div class="whisper-progress-track">
          <div class="whisper-progress-bar" style="width: ${pct}%"></div>
        </div>
        ${p.total
          ? html`<div class="whisper-progress-size">
              ${this._formatBytes(p.loaded)} / ${this._formatBytes(p.total)}
            </div>`
          : ""}
      </div>
    `;
  }

  _handleProfileChange(e) {
    this.onProfileChange(e.target.value);
  }

  // ── Start ──

  _handleStart() {
    if (this.isInitializing) return;

    if (this._mode === "byok") {
      if (!this._geminiKey.trim()) {
        this._keyError = true;
        this.requestUpdate();
        return;
      }
    } else if (this._mode === "local") {
      // Local mode doesn't need API keys, just Ollama host
      if (!this._ollamaHost.trim()) {
        return;
      }
    }

    this.onStart();
  }

  triggerApiKeyError() {
    this._keyError = true;
    this.requestUpdate();
    setTimeout(() => {
      this._keyError = false;
      this.requestUpdate();
    }, 2000);
  }

  // ── Render helpers ──

  _renderStartButton() {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

    const cmdIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"
      />
    </svg>`;
    const ctrlIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 15l6-6 6 6" />
    </svg>`;
    const enterIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9 10l-5 5 5 5" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>`;

    return html`
      <button
        class="start-button ${this.isInitializing ? "disabled" : ""}"
        @click=${() => this._handleStart()}
      >
        <canvas class="btn-aurora"></canvas>
        <canvas class="btn-dither"></canvas>
        <span class="btn-label">
          Start Session
          <span class="shortcut-hint"
            >${isMac ? cmdIcon : ctrlIcon}${enterIcon}</span
          >
        </span>
      </button>
    `;
  }

  // ── BYOK mode ──

  _renderByokMode() {
    return html`
      <div class="form-group">
        <label class="form-label">Gemini API Key</label>
        <input
          type="password"
          placeholder="Required for transcription"
          .value=${this._geminiKey}
          @input=${(e) => this._saveGeminiKey(e.target.value)}
          class=${this._keyError ? "error" : ""}
        />
        <div class="form-hint">
          <span
            class="link"
            @click=${() =>
              this.onExternalLink("https://aistudio.google.com/apikey")}
            >Get Gemini key</span
          >
          - Always used for audio transcription
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Response Provider</label>
        <select
          .value=${this._responseProvider}
          @change=${(e) => this._saveResponseProvider(e.target.value)}
        >
          <option
            value="gemini"
            ?selected=${this._responseProvider === "gemini"}
          >
            Gemini (default)
          </option>
          <option value="groq" ?selected=${this._responseProvider === "groq"}>
            Groq (fast responses)
          </option>
          <option
            value="openai-compatible"
            ?selected=${this._responseProvider === "openai-compatible"}
          >
            OpenAI-Compatible API
          </option>
        </select>
        <div class="form-hint">
          Choose which API to use for generating responses
        </div>
      </div>

      ${this._responseProvider === "groq"
        ? html`
            <div class="form-group">
              <label class="form-label">Groq API Key</label>
              <input
                type="password"
                placeholder="Required for Groq"
                .value=${this._groqKey}
                @input=${(e) => this._saveGroqKey(e.target.value)}
              />
              <div class="form-hint">
                <span
                  class="link"
                  @click=${() =>
                    this.onExternalLink("https://console.groq.com/keys")}
                  >Get Groq key</span
                >
              </div>
            </div>
          `
        : ""}
      ${this._responseProvider === "openai-compatible"
        ? html`
            <div class="form-group">
              <label class="form-label">OpenAI-Compatible API</label>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <input
                  type="password"
                  placeholder="API Key"
                  .value=${this._openaiCompatibleApiKey}
                  @input=${(e) =>
                    this._saveOpenAICompatibleApiKey(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Base URL (e.g., https://openrouter.ai/api)"
                  .value=${this._openaiCompatibleBaseUrl}
                  @input=${(e) =>
                    this._saveOpenAICompatibleBaseUrl(e.target.value)}
                />
                ${this._loadingModels
                  ? html`
                      <input
                        type="text"
                        placeholder="Loading models..."
                        disabled
                        style="opacity: 0.6;"
                      />
                    `
                  : this._availableModels.length > 0 && !this._manualModelInput
                    ? html`
                        <div style="display: flex; gap: 4px;">
                          <select
                            style="flex: 1;"
                            .value=${this._openaiCompatibleModel}
                            @change=${(e) =>
                              this._saveOpenAICompatibleModel(e.target.value)}
                          >
                            ${this._availableModels.map(
                              (model) => html`
                                <option
                                  value="${model}"
                                  ?selected=${this._openaiCompatibleModel ===
                                  model}
                                >
                                  ${model}
                                </option>
                              `,
                            )}
                          </select>
                          <button
                            type="button"
                            @click=${() => this._toggleManualInput()}
                            style="padding: 8px 12px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; color: var(--text-muted); font-size: var(--font-size-xs);"
                            title="Enter model manually"
                          >
                            ✏️
                          </button>
                        </div>
                      `
                    : html`
                        <div style="display: flex; gap: 4px;">
                          <input
                            type="text"
                            placeholder="Model name (e.g., anthropic/claude-3.5-sonnet)"
                            style="flex: 1;"
                            .value=${this._openaiCompatibleModel}
                            @input=${(e) =>
                              this._saveOpenAICompatibleModel(e.target.value)}
                          />
                          ${this._availableModels.length > 0
                            ? html`
                                <button
                                  type="button"
                                  @click=${() => this._toggleManualInput()}
                                  style="padding: 8px 12px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; color: var(--text-muted); font-size: var(--font-size-xs);"
                                  title="Select from list"
                                >
                                  📋
                                </button>
                              `
                            : ""}
                        </div>
                      `}
              </div>
              <div class="form-hint">
                ${this._loadingModels
                  ? "Loading available models..."
                  : this._availableModels.length > 0
                    ? `${this._availableModels.length} models available`
                    : "Use OpenRouter, DeepSeek, Together AI, or any OpenAI-compatible API"}
              </div>
            </div>
          `
        : ""}
      ${this._renderStartButton()}
    `;
  }

  // ── Local AI mode ──

  _renderLocalMode() {
    return html`
      <div class="form-group">
        <label class="form-label">Ollama Host</label>
        <input
          type="text"
          placeholder="http://127.0.0.1:11434"
          .value=${this._ollamaHost}
          @input=${(e) => this._saveOllamaHost(e.target.value)}
        />
        <div class="form-hint">Ollama must be running locally</div>
      </div>

      <div class="form-group">
        <label class="form-label">Ollama Model</label>
        <input
          type="text"
          placeholder="llama3.1"
          .value=${this._ollamaModel}
          @input=${(e) => this._saveOllamaModel(e.target.value)}
        />
        <div class="form-hint">
          Run
          <code
            style="font-family: var(--font-mono); font-size: 11px; background: var(--bg-elevated); padding: 1px 4px; border-radius: 3px;"
            >ollama pull ${this._ollamaModel}</code
          >
          first
        </div>
      </div>

      <div class="form-group">
        <div class="whisper-label-row">
          <label class="form-label">Whisper Model</label>
          ${this.whisperDownloading
            ? html`<div class="whisper-spinner"></div>`
            : ""}
        </div>
        <select
          .value=${this._whisperModel}
          @change=${(e) => this._saveWhisperModel(e.target.value)}
        >
          <option
            value="Xenova/whisper-tiny"
            ?selected=${this._whisperModel === "Xenova/whisper-tiny"}
          >
            Tiny (fastest, least accurate)
          </option>
          <option
            value="Xenova/whisper-base"
            ?selected=${this._whisperModel === "Xenova/whisper-base"}
          >
            Base
          </option>
          <option
            value="Xenova/whisper-small"
            ?selected=${this._whisperModel === "Xenova/whisper-small"}
          >
            Small (recommended)
          </option>
          <option
            value="Xenova/whisper-medium"
            ?selected=${this._whisperModel === "Xenova/whisper-medium"}
          >
            Medium (most accurate, slowest)
          </option>
          <option
            value="__custom__"
            ?selected=${this._whisperModel === "__custom__"}
          >
            Custom HuggingFace model...
          </option>
        </select>
        ${this._whisperModel === "__custom__"
          ? html`
              <input
                type="text"
                placeholder="e.g. onnx-community/whisper-large-v3-turbo"
                .value=${this._customWhisperModel}
                @change=${(e) => this._saveCustomWhisperModel(e.target.value)}
                @input=${(e) => {
                  this._customWhisperModel = e.target.value;
                }}
                style="margin-top: 6px;"
              />
              <div class="form-hint">
                Enter a HuggingFace model ID compatible with
                @huggingface/transformers speech-to-text pipeline
              </div>
            `
          : html`
              <div class="form-hint">
                ${this.whisperDownloading
                  ? "Downloading model..."
                  : "Downloaded automatically on first use"}
              </div>
            `}
        ${this.whisperDownloading && this.whisperProgress
          ? this._renderWhisperProgress()
          : ""}
      </div>

      ${this._renderStartButton()}
    `;
  }

  // ── Main render ──

  render() {
    const helpIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
    >
      <g
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      >
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0m9 5v.01" />
        <path d="M12 13.5a1.5 1.5 0 0 1 1-1.5a2.6 2.6 0 1 0-3-4" />
      </g>
    </svg>`;
    const closeIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M18 6L6 18M6 6l12 12"
      />
    </svg>`;

    return html`
      <div class="form-wrapper">
        ${this._mode === "local"
          ? html`
              <div class="title-row">
                <div class="page-title">
                  Mastermind <span class="mode-suffix">Local AI</span>
                </div>
                <button
                  class="help-btn"
                  @click=${() => {
                    this._showLocalHelp = !this._showLocalHelp;
                  }}
                >
                  ${this._showLocalHelp ? closeIcon : helpIcon}
                </button>
              </div>
            `
          : html`
              <div class="page-title">
                Mastermind <span class="mode-suffix">BYOK</span>
              </div>
            `}
        <div class="page-subtitle">
          ${this._mode === "byok"
            ? "Bring your own API keys"
            : "Run models locally on your machine"}
        </div>

        ${this._mode === "byok" ? this._renderByokMode() : ""}
        ${this._mode === "local"
          ? this._showLocalHelp
            ? this._renderLocalHelp()
            : this._renderLocalMode()
          : ""}

        <div class="divider">
          <div class="divider-line"></div>
          <div class="divider-text">or switch to</div>
          <div class="divider-line"></div>
        </div>

        <div class="mode-links">
          <button
            class="mode-link"
            @click=${() =>
              this._saveMode(this._mode === "byok" ? "local" : "byok")}
          >
            ${this._mode === "byok" ? "Local AI Mode" : "BYOK Mode (API Keys)"}
          </button>
        </div>
      </div>
    `;
  }

  _renderLocalHelp() {
    return html`
      <div class="help-content">
        <div class="help-section">
          <div class="help-section-title">What is Ollama?</div>
          <div class="help-section-text">
            Ollama lets you run large language models locally on your machine.
            Everything stays on your computer — no data leaves your device.
          </div>
        </div>

        <div class="help-section">
          <div class="help-section-title">Install Ollama</div>
          <div class="help-section-text">
            Download from
            <span
              class="help-link"
              @click=${() => this.onExternalLink("https://ollama.com/download")}
              >ollama.com/download</span
            >
            and install it.
          </div>
        </div>

        <div class="help-section">
          <div class="help-section-title">Ollama must be running</div>
          <div class="help-section-text">
            Ollama needs to be running before you start a session. If it's not
            running, open your terminal and type:
          </div>
          <code class="help-code">ollama serve</code>
        </div>

        <div class="help-section">
          <div class="help-section-title">Pull a model</div>
          <div class="help-section-text">
            Download a model before first use:
          </div>
          <code class="help-code">ollama pull gemma3:4b</code>
        </div>

        <div class="help-section">
          <div class="help-section-title">Recommended models</div>
          <div class="help-models">
            <div class="help-model">
              <span class="help-model-name">gemma3:4b</span
              ><span>4B — fast, multimodal (images + text)</span>
            </div>
            <div class="help-model">
              <span class="help-model-name">mistral-small</span
              ><span>8B — solid all-rounder, text only</span>
            </div>
          </div>
          <div class="help-section-text">
            gemma3:4b and above supports images — screenshots will work with
            these models.
          </div>
        </div>

        <div class="help-section">
          <div class="help-warn">
            Avoid "thinking" models (e.g. deepseek-r1, qwq). Local inference is
            already slower — a thinking model adds extra delay before
            responding.
          </div>
        </div>

        <div class="help-section">
          <div class="help-section-title">Whisper</div>
          <div class="help-section-text">
            The Whisper speech-to-text model is downloaded automatically the
            first time you start a session. This is a one-time download.
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("main-view", MainView);
