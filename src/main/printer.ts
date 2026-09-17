import { BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import type { PaperSize, PrinterInfo, PrintJobOptions, PrintJobResult } from '@shared/types'
import { PAPER_SIZES } from '@shared/types'

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

function findPaperSize(id: string): PaperSize {
  return PAPER_SIZES.find((p) => p.id === id) ?? PAPER_SIZES[1]
}

/**
 * Prints an already-composed, print-ready image at native size (no scaling surprises)
 * by loading it into a hidden window sized exactly to the paper and issuing a silent
 * print job to the given DNP printer via the OS print driver.
 */
export async function printImage(options: PrintJobOptions): Promise<PrintJobResult> {
  const { imagePath, printerName, paperSizeId, copies } = options
  const paper = findPaperSize(paperSizeId)

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false }
  })

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${paper.widthIn}in ${paper.heightIn}in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  img { display: block; width: ${paper.widthIn}in; height: ${paper.heightIn}in; object-fit: cover; }
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
            width: Math.round(paper.widthIn * MICRONS_PER_INCH),
            height: Math.round(paper.heightIn * MICRONS_PER_INCH)
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

export function getAllWebContentsPrinterCapableWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}
