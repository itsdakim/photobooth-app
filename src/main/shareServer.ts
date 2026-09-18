import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { eventsDir } from './storage'

let server: http.Server | null = null
let activePort: number | null = null

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif'
}

const KIND_DIRS: Record<string, string> = {
  completed: 'Completed Photos',
  gif: 'GIFs'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function sendLandingPage(res: http.ServerResponse, eventId: string, sessionId: string): void {
  const photoPath = path.join(eventsDir(), eventId, 'Completed Photos', `${sessionId}.png`)
  const gifPath = path.join(eventsDir(), eventId, 'GIFs', `${sessionId}.gif`)
  const hasPhoto = fs.existsSync(photoPath)
  const hasGif = fs.existsSync(gifPath)
  const photoUrl = escapeHtml(`/event/${eventId}/completed/${sessionId}.png`)
  const gifUrl = escapeHtml(`/event/${eventId}/gif/${sessionId}.gif`)

  if (!hasPhoto && !hasGif) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Photos</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAF9F6; color: #1B1A17; margin: 0; padding: 32px 20px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.sub { color: #6B6862; margin: 0 0 24px; font-size: 14px; }
  .card { background: #fff; border: 1px solid #E7E4DD; border-radius: 16px; padding: 16px; margin: 0 auto 20px; max-width: 420px; }
  .card img { max-width: 100%; border-radius: 8px; display: block; margin: 0 auto 14px; }
  .card .label { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #8A8579; margin-bottom: 10px; }
  a.download { display: inline-block; background: #33415C; color: #fff; text-decoration: none; padding: 13px 28px; border-radius: 999px; font-weight: 600; font-size: 15px; }
</style>
</head>
<body>
  <h1>Your Photos Are Ready</h1>
  <p class="sub">Tap a button below to save to your phone</p>
  ${
    hasPhoto
      ? `<div class="card"><div class="label">Photo</div><img src="${photoUrl}" alt="Your photo" /><a class="download" href="${photoUrl}" download>Download Photo</a></div>`
      : ''
  }
  ${
    hasGif
      ? `<div class="card"><div class="label">GIF</div><img src="${gifUrl}" alt="Your GIF" /><a class="download" href="${gifUrl}" download>Download GIF</a></div>`
      : ''
  }
</body>
</html>`

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(html)
}

/** Starts a minimal read-only local HTTP server so guests on the venue wifi can
 *  scan a QR code and download their photo/GIF directly to their phone. */
export function startShareServer(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(activePort as number)
      return
    }
    const srv = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[0] !== 'event' || parts.length < 3) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const eventId = parts[1]
        if (eventId.includes('..')) {
          res.writeHead(400)
          res.end('Bad request')
          return
        }

        // /event/<eventId>/session/<sessionId> -> guest-facing download page
        if (parts[2] === 'session' && parts.length === 4) {
          const sessionId = parts[3]
          if (sessionId.includes('..')) {
            res.writeHead(400)
            res.end('Bad request')
            return
          }
          sendLandingPage(res, eventId, sessionId)
          return
        }

        // /event/<eventId>/<kind>/<filename> -> raw file, kind is 'completed' or 'gif'
        const dirName = KIND_DIRS[parts[2]]
        const filename = parts.slice(3).join('/')
        if (!dirName || filename.includes('..')) {
          res.writeHead(400)
          res.end('Bad request')
          return
        }
        const filePath = path.join(eventsDir(), eventId, dirName, filename)
        if (!filePath.startsWith(eventsDir())) {
          res.writeHead(400)
          res.end('Bad request')
          return
        }
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            res.writeHead(404)
            res.end('Not found')
            return
          }
          const ext = path.extname(filePath).toLowerCase()
          res.writeHead(200, {
            'Content-Type': MIME[ext] ?? 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-store'
          })
          fs.createReadStream(filePath).pipe(res)
        })
      } catch {
        res.writeHead(500)
        res.end('Server error')
      }
    })

    srv.on('error', reject)
    srv.listen(port, () => {
      server = srv
      activePort = port
      resolve(port)
    })
  })
}

export function stopShareServer(): void {
  if (server) {
    server.close()
    server = null
    activePort = null
  }
}

export function getLocalNetworkUrl(port: number): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${port}`
      }
    }
  }
  return `http://localhost:${port}`
}
