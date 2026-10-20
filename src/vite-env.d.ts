/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

declare const __APP_VERSION__: string

declare module 'exifr/dist/lite.esm.mjs' {
  import exifr from 'exifr'
  export default exifr
}
