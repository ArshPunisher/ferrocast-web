import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { GuestPage } from './GuestPage'

// The guest's page (guest.html): its own small entry, without the dashboard's app.
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <GuestPage />
    </StrictMode>,
  )
