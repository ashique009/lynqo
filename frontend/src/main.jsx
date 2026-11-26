import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

let pendingSwUpdate = null

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Never interrupt an active voice recording or message send with a reload
    if (typeof window !== 'undefined' && (window.__lynqoBusyCount || 0) > 0) {
      pendingSwUpdate = () => updateSW(true)
      return
    }
    updateSW(true)
  },
})

if (typeof window !== 'undefined') {
  window.__lynqoBusyCount = window.__lynqoBusyCount || 0
  window.addEventListener('lynqo:idle', () => {
    if (pendingSwUpdate && (window.__lynqoBusyCount || 0) === 0) {
      const fn = pendingSwUpdate
      pendingSwUpdate = null
      fn()
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)