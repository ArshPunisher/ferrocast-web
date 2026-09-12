import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './styles.css'
import { registerDesignFonts } from '@ferrocast/overlays'
import { App } from './App'

// Design fonts for the gallery and designer previews (downloaded only when a design uses one).
registerDesignFonts()

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </StrictMode>,
  )
