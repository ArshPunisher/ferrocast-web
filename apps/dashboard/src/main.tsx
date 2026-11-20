import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { registerDesignFonts } from '@ferrocast/overlays'
import { App } from './App'
import { applyAppearance, loadAppearance } from './lib/appearance'
import { Motion } from './lib/use-appearance'

// The saved size, density, motion and colours, before the first paint.
applyAppearance(loadAppearance())

// Design fonts for the gallery and designer previews (downloaded only when a design uses one).
registerDesignFonts()

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <Motion>
        <App />
      </Motion>
    </StrictMode>,
  )
