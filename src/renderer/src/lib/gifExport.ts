// @ts-expect-error gif.js ships no types
import GIF from 'gif.js'

/**
 * Builds an animated GIF from the raw captured photos (in order), so guests
 * get a fun shareable loop in addition to the printed strip / digital copy.
 */
export function buildGif(
  photoDataUrls: string[],
  options: { width: number; height: number; delayMs: number }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: options.width,
      height: options.height,
      workerScript: '/gif.worker.js'
    })

    const loadAll = photoDataUrls.map(
      (src) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image()
          img.onload = () => res(img)
          img.onerror = rej
          img.src = src
        })
    )

    Promise.all(loadAll)
      .then((images) => {
        const canvas = document.createElement('canvas')
        canvas.width = options.width
        canvas.height = options.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Could not get canvas context')

        for (const img of images) {
          const imgRatio = img.width / img.height
          const boxRatio = options.width / options.height
          let sx = 0
          let sy = 0
          let sw = img.width
          let sh = img.height
          if (imgRatio > boxRatio) {
            sw = img.height * boxRatio
            sx = (img.width - sw) / 2
          } else {
            sh = img.width / boxRatio
            sy = (img.height - sh) / 2
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, options.width, options.height)
          gif.addFrame(ctx, { copy: true, delay: options.delayMs })
        }

        gif.on('finished', (blob: Blob) => resolve(blob))
        gif.render()
      })
      .catch(reject)
  })
}
