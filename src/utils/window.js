const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const storage = require('../storage');

let mouseEventsIgnored = false;
let windowResizing = false;
let resizeAnimation = null;
const RESIZE_ANIMATION_DURATION = 500; // milliseconds


function createWindow(sendToRenderer, geminiSessionRef) {
    // Get layout preference (default to 'normal')
    let windowWidth = 1100;
    let windowHeight = 800;

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#00000000',
    });

    const { session, desktopCapturer } = require('electron');

    // Store selected source for Windows custom picker
    let selectedSourceId = null;

    // Setup display media handler based on platform
    if (process.platform === 'darwin') {
        // macOS: Use native system picker
        session.defaultSession.setDisplayMediaRequestHandler(
            (request, callback) => {
                desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
                    callback({ video: sources[0], audio: 'loopback' });
                });
            },
            { useSystemPicker: true }
        );
    } else {
        // Windows/Linux: Use selected source from custom picker
        session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ['screen', 'window'],
                    thumbnailSize: { width: 0, height: 0 },
                });

                // Find the selected source or use first screen
                let source = sources[0];
                if (selectedSourceId) {
                    const found = sources.find(s => s.id === selectedSourceId);
                    if (found) source = found;
                }

                if (source) {
                    callback({ video: source, audio: 'loopback' });
                } else {
                    callback({});
                }
            } catch (error) {
                console.error('Error in display media handler:', error);
                callback({});
            }
        });
    }

    // IPC handler to set selected source
    ipcMain.handle('set-selected-source', async (event, sourceId) => {
        selectedSourceId = sourceId;
        return { success: true };
    });

    mainWindow.setResizable(false);
    mainWindow.setContentProtection(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Hide from Windows taskbar
    if (process.platform === 'win32') {
        try {
            mainWindow.setSkipTaskbar(true);
            console.log('Hidden from Windows taskbar');
        } catch (error) {
            console.warn('Could not hide from taskbar:', error.message);
        }
    }

    // Hide from Mission Control on macOS
    if (process.platform === 'darwin') {
        try {
            mainWindow.setHiddenInMissionControl(true);
            console.log('Hidden from macOS Mission Control');
        } catch (error) {
            console.warn('Could not hide from Mission Control:', error.message);
        }
    }

    // Center window at the top of the screen
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = 0;
    mainWindow.setPosition(x, y);

    if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // After window is created, initialize keybinds
    mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            let keybinds = defaultKeybinds;

            // Load keybinds from storage
            const savedKeybinds = storage.getKeybinds();
            if (savedKeybinds) {
                keybinds = { ...defaultKeybinds, ...savedKeybinds };
            }

            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }, 150);
    });

    setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);

    return mainWindow;
}

function getDefaultKeybinds() {
    const isMac = process.platform === 'darwin';
    return {
        moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
        moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
        moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
        moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
        toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
        toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
        nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
        previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
        nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
        scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
        scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        emergencyErase: isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
        pushToTalk: isMac ? 'Ctrl+Space' : 'Ctrl+Space',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    console.log('Updating global shortcuts with:', keybinds);

    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    const prefs = storage.getPreferences();
    const audioInputMode = prefs.audioInputMode || 'auto';
    const enablePushToTalk = audioInputMode === 'push-to-talk';

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    // Register window movement shortcuts
    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX - moveIncrement, currentY);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX + moveIncrement, currentY);
        },
    };

    // Register each movement shortcut
    Object.keys(movementActions).forEach(action => {
        const keybind = keybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
                console.log(`Registered ${action}: ${keybind}`);
            } catch (error) {
                console.error(`Failed to register ${action} (${keybind}):`, error);
            }
        }
    });

    // Register toggle visibility shortcut
    if (keybinds.toggleVisibility) {
        try {
            globalShortcut.register(keybinds.toggleVisibility, () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.showInactive();
                }
            });
            console.log(`Registered toggleVisibility: ${keybinds.toggleVisibility}`);
        } catch (error) {
            console.error(`Failed to register toggleVisibility (${keybinds.toggleVisibility}):`, error);
        }
    }

    // Register toggle click-through shortcut
    if (keybinds.toggleClickThrough) {
        try {
            globalShortcut.register(keybinds.toggleClickThrough, () => {
                mouseEventsIgnored = !mouseEventsIgnored;
                if (mouseEventsIgnored) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    console.log('Mouse events ignored');
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                    console.log('Mouse events enabled');
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
            console.log(`Registered toggleClickThrough: ${keybinds.toggleClickThrough}`);
        } catch (error) {
            console.error(`Failed to register toggleClickThrough (${keybinds.toggleClickThrough}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (keybinds.nextStep) {
        try {
            globalShortcut.register(keybinds.nextStep, async () => {
                console.log('Next step shortcut triggered');
                try {
                    // Determine the shortcut key format
                    const isMac = process.platform === 'darwin';
                    const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';

                    // Use the new handleShortcut function
                    mainWindow.webContents.executeJavaScript(`
                        mastermind.handleShortcut('${shortcutKey}');
                    `);
                } catch (error) {
                    console.error('Error handling next step shortcut:', error);
                }
            });
            console.log(`Registered nextStep: ${keybinds.nextStep}`);
        } catch (error) {
            console.error(`Failed to register nextStep (${keybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (keybinds.previousResponse) {
        try {
            globalShortcut.register(keybinds.previousResponse, () => {
                console.log('Previous response shortcut triggered');
                sendToRenderer('navigate-previous-response');
            });
            console.log(`Registered previousResponse: ${keybinds.previousResponse}`);
        } catch (error) {
            console.error(`Failed to register previousResponse (${keybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (keybinds.nextResponse) {
        try {
            globalShortcut.register(keybinds.nextResponse, () => {
                console.log('Next response shortcut triggered');
                sendToRenderer('navigate-next-response');
            });
            console.log(`Registered nextResponse: ${keybinds.nextResponse}`);
        } catch (error) {
            console.error(`Failed to register nextResponse (${keybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (keybinds.scrollUp) {
        try {
            globalShortcut.register(keybinds.scrollUp, () => {
                console.log('Scroll up shortcut triggered');
                sendToRenderer('scroll-response-up');
            });
            console.log(`Registered scrollUp: ${keybinds.scrollUp}`);
        } catch (error) {
            console.error(`Failed to register scrollUp (${keybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
    if (keybinds.scrollDown) {
        try {
            globalShortcut.register(keybinds.scrollDown, () => {
                console.log('Scroll down shortcut triggered');
                sendToRenderer('scroll-response-down');
            });
            console.log(`Registered scrollDown: ${keybinds.scrollDown}`);
        } catch (error) {
            console.error(`Failed to register scrollDown (${keybinds.scrollDown}):`, error);
        }
    }

    // Register emergency erase shortcut
    if (keybinds.emergencyErase) {
        try {
            globalShortcut.register(keybinds.emergencyErase, () => {
                console.log('Emergency Erase triggered!');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();

                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    sendToRenderer('clear-sensitive-data');

                    setTimeout(() => {
                        const { app } = require('electron');
                        app.quit();
                    }, 300);
                }
            });
            console.log(`Registered emergencyErase: ${keybinds.emergencyErase}`);
        } catch (error) {
            console.error(`Failed to register emergencyErase (${keybinds.emergencyErase}):`, error);
        }
    }

    // Register push-to-talk shortcut (OpenAI SDK only, gated by preferences)
    if (keybinds.pushToTalk && enablePushToTalk) {
        try {
            globalShortcut.register(keybinds.pushToTalk, () => {
                sendToRenderer('push-to-talk-toggle');
            });
            console.log(`Registered pushToTalk (toggle): ${keybinds.pushToTalk}`);
        } catch (error) {
            console.error(`Failed to register pushToTalk (${keybinds.pushToTalk}):`, error);
        }
    }
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    ipcMain.on('view-changed', (event, view) => {
        if (view !== 'assistant' && !mainWindow.isDestroyed()) {
            mainWindow.setIgnoreMouseEvents(false);
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('toggle-window-visibility', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.showInactive();
            }
            return { success: true };
        } catch (error) {
            console.error('Error toggling window visibility:', error);
            return { success: false, error: error.message };
        }
    });

    function animateWindowResize(mainWindow, targetWidth, targetHeight, layoutMode) {
        return new Promise(resolve => {
            // Check if window is destroyed before starting animation
            if (mainWindow.isDestroyed()) {
                console.log('Cannot animate resize: window has been destroyed');
                resolve();
                return;
            }

            // Clear any existing animation
            if (resizeAnimation) {
                clearInterval(resizeAnimation);
                resizeAnimation = null;
            }

            const [startWidth, startHeight] = mainWindow.getSize();

            // If already at target size, no need to animate
            if (startWidth === targetWidth && startHeight === targetHeight) {
                console.log(`Window already at target size for ${layoutMode} mode`);
                resolve();
                return;
            }

            console.log(`Starting animated resize from ${startWidth}x${startHeight} to ${targetWidth}x${targetHeight}`);

            windowResizing = true;
            mainWindow.setResizable(true);

            const frameRate = 60; // 60 FPS
            const totalFrames = Math.floor(RESIZE_ANIMATION_DURATION / (1000 / frameRate));
            let currentFrame = 0;

            const widthDiff = targetWidth - startWidth;
            const heightDiff = targetHeight - startHeight;

            resizeAnimation = setInterval(() => {
                currentFrame++;
                const progress = currentFrame / totalFrames;

                // Use easing function (ease-out)
                const easedProgress = 1 - Math.pow(1 - progress, 3);

                const currentWidth = Math.round(startWidth + widthDiff * easedProgress);
                const currentHeight = Math.round(startHeight + heightDiff * easedProgress);

                if (!mainWindow || mainWindow.isDestroyed()) {
                    clearInterval(resizeAnimation);
                    resizeAnimation = null;
                    windowResizing = false;
                    return;
                }
                mainWindow.setSize(currentWidth, currentHeight);

                // Re-center the window during animation
                const primaryDisplay = screen.getPrimaryDisplay();
                const { width: screenWidth } = primaryDisplay.workAreaSize;
                const x = Math.floor((screenWidth - currentWidth) / 2);
                const y = 0;
                mainWindow.setPosition(x, y);

                if (currentFrame >= totalFrames) {
                    clearInterval(resizeAnimation);
                    resizeAnimation = null;
                    windowResizing = false;

                    // Check if window is still valid before final operations
                    if (!mainWindow.isDestroyed()) {
                        mainWindow.setResizable(false);

                        // Ensure final size is exact
                        mainWindow.setSize(targetWidth, targetHeight);
                        const finalX = Math.floor((screenWidth - targetWidth) / 2);
                        mainWindow.setPosition(finalX, 0);
                    }

                    console.log(`Animation complete: ${targetWidth}x${targetHeight}`);
                    resolve();
                }
            }, 1000 / frameRate);
        });
    }

    ipcMain.handle('update-sizes', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            // Get current view and layout mode from renderer
            let viewName, layoutMode;
            try {
                viewName = await event.sender.executeJavaScript('mastermind.getCurrentView()');
                layoutMode = await event.sender.executeJavaScript('mastermind.getLayoutMode()');
            } catch (error) {
                console.warn('Failed to get view/layout from renderer, using defaults:', error);
                viewName = 'main';
                layoutMode = 'normal';
            }

            console.log('Size update requested for view:', viewName, 'layout:', layoutMode);

            let targetWidth, targetHeight;

            // Determine base size from layout mode
            const baseWidth = layoutMode === 'compact' ? 700 : 900;
            const baseHeight = layoutMode === 'compact' ? 500 : 600;

            // Adjust height based on view
            switch (viewName) {
                case 'main':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 320 : 400;
                    break;
                case 'customize':
                case 'settings':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 700 : 800;
                    break;
                case 'help':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 650 : 750;
                    break;
                case 'history':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 650 : 750;
                    break;
                case 'assistant':
                case 'onboarding':
                default:
                    targetWidth = baseWidth;
                    targetHeight = baseHeight;
                    break;
            }

            const [currentWidth, currentHeight] = mainWindow.getSize();
            console.log('Current window size:', currentWidth, 'x', currentHeight);

            // If currently resizing, the animation will start from current position
            if (windowResizing) {
                console.log('Interrupting current resize animation');
            }

            await animateWindowResize(mainWindow, targetWidth, targetHeight, `${viewName} view (${layoutMode})`);

            return { success: true };
        } catch (error) {
            console.error('Error updating sizes:', error);
            return { success: false, error: error.message };
        }
    });

    // Region selection window for capturing areas outside the main window
    let regionSelectionWindow = null;

    ipcMain.handle('start-region-selection', async (event, { screenshotDataUrl }) => {
        try {
            // Hide main window first
            const wasVisible = mainWindow.isVisible();
            if (wasVisible) {
                mainWindow.hide();
            }

            // Small delay to ensure window is hidden
            await new Promise(resolve => setTimeout(resolve, 100));

            // Get all displays to cover all screens
            const displays = screen.getAllDisplays();
            const primaryDisplay = screen.getPrimaryDisplay();

            // Calculate bounds that cover all displays
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            displays.forEach(display => {
                minX = Math.min(minX, display.bounds.x);
                minY = Math.min(minY, display.bounds.y);
                maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
                maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
            });

            const totalWidth = maxX - minX;
            const totalHeight = maxY - minY;

            // Create fullscreen transparent window for selection
            regionSelectionWindow = new BrowserWindow({
                x: minX,
                y: minY,
                width: totalWidth,
                height: totalHeight,
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                resizable: false,
                movable: false,
                hasShadow: false,
                // Hide from screen capture/sharing
                ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                },
            });

            // Hide window content from screen capture (macOS)
            if (process.platform === 'darwin') {
                regionSelectionWindow.setContentProtection(true);
            }

            regionSelectionWindow.setAlwaysOnTop(true, 'screen-saver', 1);

            // Create HTML content for selection overlay
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            width: 100vw;
                            height: 100vh;
                            cursor: crosshair;
                            overflow: hidden;
                            position: relative;
                        }
                        #screenshot {
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                        }
                        #overlay {
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: rgba(0, 0, 0, 0.3);
                        }
                        #selection {
                            position: absolute;
                            border: 2px dashed #fff;
                            background: rgba(255, 255, 255, 0.1);
                            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
                            display: none;
                            pointer-events: none;
                        }
                        #hint {
                            position: fixed;
                            top: 20px;
                            left: 50%;
                            transform: translateX(-50%);
                            background: rgba(0, 0, 0, 0.8);
                            color: white;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            font-size: 14px;
                            z-index: 10000;
                            pointer-events: none;
                        }
                    </style>
                </head>
                <body>
                    <img id="screenshot" src="${screenshotDataUrl}" />
                    <div id="overlay"></div>
                    <div id="selection"></div>
                    <div id="hint">Click and drag to select region • ESC to cancel</div>
                    <script>
                        const { ipcRenderer } = require('electron');
                        const selection = document.getElementById('selection');
                        const overlay = document.getElementById('overlay');
                        let isSelecting = false;
                        let startX = 0, startY = 0;

                        document.addEventListener('mousedown', (e) => {
                            if (e.button !== 0) return;
                            isSelecting = true;
                            startX = e.clientX;
                            startY = e.clientY;
                            selection.style.display = 'block';
                            selection.style.left = startX + 'px';
                            selection.style.top = startY + 'px';
                            selection.style.width = '0px';
                            selection.style.height = '0px';
                        });

                        document.addEventListener('mousemove', (e) => {
                            if (!isSelecting) return;
                            const currentX = e.clientX;
                            const currentY = e.clientY;
                            const left = Math.min(startX, currentX);
                            const top = Math.min(startY, currentY);
                            const width = Math.abs(currentX - startX);
                            const height = Math.abs(currentY - startY);
                            selection.style.left = left + 'px';
                            selection.style.top = top + 'px';
                            selection.style.width = width + 'px';
                            selection.style.height = height + 'px';
                        });

                        document.addEventListener('mouseup', (e) => {
                            if (!isSelecting) return;
                            isSelecting = false;
                            const rect = {
                                left: parseInt(selection.style.left),
                                top: parseInt(selection.style.top),
                                width: parseInt(selection.style.width),
                                height: parseInt(selection.style.height)
                            };
                            if (rect.width > 10 && rect.height > 10) {
                                ipcRenderer.send('region-selected', rect);
                            } else {
                                ipcRenderer.send('region-selection-cancelled');
                            }
                        });

                        document.addEventListener('keydown', (e) => {
                            if (e.key === 'Escape') {
                                ipcRenderer.send('region-selection-cancelled');
                            }
                        });
                    </script>
                </body>
                </html>
            `;

            regionSelectionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

            return new Promise(resolve => {
                ipcMain.once('region-selected', (event, rect) => {
                    if (regionSelectionWindow && !regionSelectionWindow.isDestroyed()) {
                        regionSelectionWindow.close();
                        regionSelectionWindow = null;
                    }
                    if (wasVisible) {
                        mainWindow.showInactive();
                    }
                    resolve({ success: true, rect });
                });

                ipcMain.once('region-selection-cancelled', () => {
                    if (regionSelectionWindow && !regionSelectionWindow.isDestroyed()) {
                        regionSelectionWindow.close();
                        regionSelectionWindow = null;
                    }
                    if (wasVisible) {
                        mainWindow.showInactive();
                    }
                    resolve({ success: false, cancelled: true });
                });

                // Also handle window close
                regionSelectionWindow.on('closed', () => {
                    regionSelectionWindow = null;
                    if (wasVisible && !mainWindow.isDestroyed()) {
                        mainWindow.showInactive();
                    }
                });
            });
        } catch (error) {
            console.error('Error starting region selection:', error);
            if (regionSelectionWindow && !regionSelectionWindow.isDestroyed()) {
                regionSelectionWindow.close();
                regionSelectionWindow = null;
            }
            if (!mainWindow.isDestroyed()) {
                mainWindow.showInactive();
            }
            return { success: false, error: error.message };
        }
    });

    // Get available screen sources for picker
    ipcMain.handle('get-screen-sources', async () => {
        try {
            const { desktopCapturer } = require('electron');
            const sources = await desktopCapturer.getSources({
                types: ['screen', 'window'],
                thumbnailSize: { width: 150, height: 150 },
            });

            return {
                success: true,
                sources: sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    thumbnail: source.thumbnail.toDataURL(),
                })),
            };
        } catch (error) {
            console.error('Error getting screen sources:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    createWindow,
    getDefaultKeybinds,
    updateGlobalShortcuts,
    setupWindowIpcHandlers,
};
