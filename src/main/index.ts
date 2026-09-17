import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from './utils'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

// Custom scheme used by the renderer to safely load images from the user's
// data directory (backgrounds, gallery thumbnails) regardless of whether the
// page itself is served over file:// (prod) or http://localhost (dev) —
// plain file:// <img> src is blocked by Chromium's web security in the latter.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pbfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.photobooth.app')

  protocol.handle('pbfile', (request) => {
    const encodedPath = request.url.slice('pbfile://local/'.length)
    const filePath = decodeURIComponent(encodedPath)
    return net.fetch(pathToFileURL(filePath).toString())
  })

  registerIpcHandlers(() => mainWindow)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
