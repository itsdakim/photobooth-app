import type { PhotoboothApi } from './index'

declare global {
  interface Window {
    api: PhotoboothApi
  }
}
