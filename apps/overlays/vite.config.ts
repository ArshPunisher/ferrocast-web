import { defineConfig } from 'vite'

// The page is served by the engine under /o/<token>/, so every asset path is relative.
// OBS's browser source is Chromium (CEF); Linux builds can lag a few versions behind.
export default defineConfig({
  base: './',
  clearScreen: false,
  server: { port: 5290, strictPort: true },
  preview: { port: 5291, strictPort: true },
  build: {
    outDir: '../../dist/overlays',
    emptyOutDir: true,
    target: ['safari15', 'chrome103'],
    sourcemap: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
})
