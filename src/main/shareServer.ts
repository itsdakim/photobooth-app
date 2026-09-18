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
        // expected: /event/<eventId>/<kind>/<filename>, kind is 'completed' or 'gif'
        if (parts[0] !== 'event' || parts.length < 4) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const eventId = parts[1]
        const dirName = KIND_DIRS[parts[2]]
        const filename = parts.slice(3).join('/')
        if (!dirName || eventId.includes('..') || filename.includes('..')) {
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
