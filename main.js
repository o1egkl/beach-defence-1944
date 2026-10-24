const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    title: 'Beach Defence 1944',
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    backgroundColor: '#0f130d',
    autoHideMenuBar: true,
    fullscreenable: true,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webgl: true,
      backgroundThrottling: false
    }
  });

  // Remove standard browser menu for clean arcade immersion
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hotkeys: F11 for fullscreen toggle, Ctrl+Q to quit
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    if ((input.key === 'q' || input.key === 'Q') && input.control && input.type === 'keyDown') {
      app.quit();
      event.preventDefault();
    }
  });
}

// IPC quit handler from renderer
ipcMain.on('quit-app', () => {
  app.quit();
});

// Hardware-accelerated WebGL flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
