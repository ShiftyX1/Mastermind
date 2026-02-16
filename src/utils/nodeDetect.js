/**
 * nodeDetect.js — Locate the system Node.js binary.
 *
 * When spawning child processes that rely on native addons compiled against the
 * system Node.js ABI (e.g. onnxruntime-node), we must NOT run them inside
 * Electron's embedded Node.js runtime — the ABI mismatch causes SIGTRAP /
 * SIGSEGV crashes.  This module finds the real system `node` binary so we can
 * pass it as `execPath` to `child_process.fork()`.
 *
 * Falls back to `null` when no system Node.js is found, letting the caller
 * decide on an alternative strategy (e.g. WASM backend).
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/** Well-known Node.js install locations per platform. */
const KNOWN_PATHS = {
  darwin: [
    "/usr/local/bin/node",
    "/opt/homebrew/bin/node", // Apple Silicon Homebrew
    path.join(os.homedir(), ".nvm/versions/node"), // nvm — needs glob
    path.join(os.homedir(), ".volta/bin/node"), // Volta
    path.join(os.homedir(), ".fnm/aliases/default/bin/node"), // fnm
    path.join(os.homedir(), ".mise/shims/node"), // mise (rtx)
    path.join(os.homedir(), ".asdf/shims/node"), // asdf
  ],
  linux: [
    "/usr/bin/node",
    "/usr/local/bin/node",
    path.join(os.homedir(), ".nvm/versions/node"),
    path.join(os.homedir(), ".volta/bin/node"),
    path.join(os.homedir(), ".fnm/aliases/default/bin/node"),
    path.join(os.homedir(), ".mise/shims/node"),
    path.join(os.homedir(), ".asdf/shims/node"),
  ],
  win32: [
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Program Files (x86)\\nodejs\\node.exe",
    path.join(os.homedir(), "AppData", "Roaming", "nvm", "current", "node.exe"),
    path.join(os.homedir(), ".volta", "bin", "node.exe"),
  ],
};

/**
 * Find the latest nvm-installed Node.js binary on macOS / Linux.
 * Returns the path to the `node` binary or null.
 */
function findNvmNode() {
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    if (!fs.existsSync(nvmDir)) return null;
    const versions = fs.readdirSync(nvmDir).filter((d) => d.startsWith("v"));
    if (versions.length === 0) return null;
    // Sort semver descending (rough but sufficient)
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const nodeBin = path.join(nvmDir, versions[0], "bin", "node");
    if (fs.existsSync(nodeBin)) return nodeBin;
  } catch (_) {
    // Ignore
  }
  return null;
}

/**
 * Attempt to resolve `node` via the system PATH using `which` (Unix) or
 * `where` (Windows).  Returns the path string or null.
 */
function whichNode() {
  try {
    const cmd = process.platform === "win32" ? "where node" : "which node";
    const result = execSync(cmd, {
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        // Ensure common manager shim dirs are on PATH
        PATH: [
          process.env.PATH || "",
          "/usr/local/bin",
          "/opt/homebrew/bin",
          path.join(os.homedir(), ".volta", "bin"),
          path.join(os.homedir(), ".fnm", "aliases", "default", "bin"),
          path.join(os.homedir(), ".mise", "shims"),
          path.join(os.homedir(), ".asdf", "shims"),
        ].join(process.platform === "win32" ? ";" : ":"),
      },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // `where` on Windows may return multiple lines — take the first
    const first = result.split(/\r?\n/)[0].trim();
    if (first && fs.existsSync(first)) return first;
  } catch (_) {
    // Command failed
  }
  return null;
}

/**
 * Check whether a given path is a real Node.js binary (not the Electron binary
 * pretending to be Node via ELECTRON_RUN_AS_NODE).
 */
function isRealNode(nodePath) {
  if (!nodePath) return false;
  try {
    const out = execSync(
      `"${nodePath}" -e "process.stdout.write(String(!process.versions.electron))"`,
      {
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return out === "true";
  } catch (_) {
    return false;
  }
}

/**
 * Find the system Node.js binary.
 *
 * @returns {{ nodePath: string } | null}  The absolute path to system `node`,
 *   or null if none found.  The caller should fall back to WASM when null.
 */
function findSystemNode() {
  // 1. Try `which node` / `where node` first (respects user's PATH / shims)
  const fromPath = whichNode();
  if (fromPath && isRealNode(fromPath)) {
    return { nodePath: fromPath };
  }

  // 2. Try nvm (has multiple version dirs)
  const fromNvm = findNvmNode();
  if (fromNvm && isRealNode(fromNvm)) {
    return { nodePath: fromNvm };
  }

  // 3. Walk the well-known paths for the current platform
  const platform = process.platform;
  const candidates = KNOWN_PATHS[platform] || KNOWN_PATHS.linux;
  for (const candidate of candidates) {
    // Skip the nvm root — already handled above
    if (candidate.includes(".nvm/versions/node")) continue;
    if (fs.existsSync(candidate) && isRealNode(candidate)) {
      return { nodePath: candidate };
    }
  }

  return null;
}

/** Cache so we only search once per process lifetime. */
let _cached = undefined;

/**
 * Cached version of `findSystemNode()`.
 * @returns {{ nodePath: string } | null}
 */
function getSystemNode() {
  if (_cached === undefined) {
    _cached = findSystemNode();
    if (_cached) {
      console.log("[nodeDetect] Found system Node.js:", _cached.nodePath);
    } else {
      console.warn(
        "[nodeDetect] No system Node.js found — will fall back to WASM backend",
      );
    }
  }
  return _cached;
}

module.exports = { findSystemNode, getSystemNode, isRealNode };
