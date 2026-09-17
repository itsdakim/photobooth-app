/** Converts an absolute local file path to a URL the renderer is allowed to load
 *  as an <img>/<source> src, via the app's custom `pbfile://` protocol. */
export function toFileUrl(absolutePath: string): string {
  return `pbfile://local/${encodeURIComponent(absolutePath)}`
}
