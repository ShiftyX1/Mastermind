const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logFile = null;
let logPath = null;

function getLogPath() {
    if (logPath) return logPath;
    
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create log file with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    logPath = path.join(logsDir, `app-${timestamp}.log`);
    
    return logPath;
}

function initLogger() {
    try {
        const filePath = getLogPath();
        logFile = fs.createWriteStream(filePath, { flags: 'a' });
        
        const startMsg = `\n${'='.repeat(60)}\nApp started at ${new Date().toISOString()}\nPlatform: ${process.platform}, Arch: ${process.arch}\nElectron: ${process.versions.electron}, Node: ${process.versions.node}\nPackaged: ${app.isPackaged}\n${'='.repeat(60)}\n`;
        logFile.write(startMsg);
        
        // Override console methods to also write to file
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            writeLog('INFO', args);
        };
        
        console.error = (...args) => {
            originalError.apply(console, args);
            writeLog('ERROR', args);
        };
        
        console.warn = (...args) => {
            originalWarn.apply(console, args);
            writeLog('WARN', args);
        };
        
        console.log('Logger initialized, writing to:', filePath);
        
        return filePath;
    } catch (err) {
        console.error('Failed to initialize logger:', err);
        return null;
    }
}

function writeLog(level, args) {
    if (!logFile) return;
    
    try {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        logFile.write(`[${timestamp}] [${level}] ${message}\n`);
    } catch (err) {
        // Silently fail - don't want logging errors to crash the app
    }
}

function closeLogger() {
    if (logFile) {
        logFile.write(`\nApp closed at ${new Date().toISOString()}\n`);
        logFile.end();
        logFile = null;
    }
}

module.exports = {
    initLogger,
    closeLogger,
    getLogPath,
};
