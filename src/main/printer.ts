import { BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import type { PrinterInfo, PrintJobOptions, PrintJobResult } from '@shared/types'

const MICRONS_PER_INCH = 25400

export async function listPrinters(win: BrowserWindow): Promise<PrinterInfo[]> {
  const printers = await win.webContents.getPrintersAsync()
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    isDefault: p.isDefault
  }))
}

/**
 * Prints an already-composed, print-ready image at native size (no scaling surprises)
 * by loading it into a hidden window sized exactly to the page and issuing a silent
 * print job to the given DNP printer via the OS print driver. The page dimensions come
 * straight from the layout's own canvas orientation (not a fixed paper-size lookup), so
 * a landscape layout (e.g. a horizontal 4x6) prints in the right orientation.
 */
export async function printImage(options: PrintJobOptions): Promise<PrintJobResult> {
  const { imagePath, printerName, widthIn, heightIn, copies } = options

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false }
  })

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  img { display: block; width: ${widthIn}in; height: ${heightIn}in; object-fit: cover; }
</style>
</head>
<body>
  <img src="${pathToFileURL(imagePath).href}" />
</body>
</html>`

  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    const result = await new Promise<PrintJobResult>((resolve) => {
      printWin.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName,
          copies: Math.max(1, Math.min(99, copies)),
          margins: { marginType: 'none' },
          pageSize: {
            width: Math.round(widthIn * MICRONS_PER_INCH),
            height: Math.round(heightIn * MICRONS_PER_INCH)
          }
        },
        (success, errorType) => {
          resolve(success ? { success: true } : { success: false, error: errorType })
        }
      )
    })
    return result
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy()
  }
}
