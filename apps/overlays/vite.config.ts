import { defineConfig, type Plugin } from 'vite'
import { catalog } from '@ferrocast/designs'

/**
 * Writes the built-in design catalogue next to the overlay page (`designs/catalog.json`).
 * The engine embeds this bundle and reads the file at start (API.md §4 Designs), so new
 * built-ins ship with an app update and need no server.
 */
function designCatalog(): Plugin {
  return {
    name: 'ferrocast-design-catalog',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'designs/catalog.json',
        source: JSON.stringify(catalog()),
      })
    },
  }
}

// The page is served by the engine under /o/<token>/, so every asset path is relative.
// OBS's browser source is Chromium (CEF); Linux builds can lag a few versions behind.
export default defineConfig({
  base: './',
  plugins: [designCatalog()],
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
