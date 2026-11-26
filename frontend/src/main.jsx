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

  // Adaptive Liquid Glass: detect constrained devices (<= 4GB RAM, <= 4 cores, or Data Saver)
  try {
    const mem = navigator.deviceMemory
    const cores = navigator.hardwareConcurrency
    const saveData = navigator.connection?.saveData
    if ((typeof mem === 'number' && mem <= 4) || (typeof cores === 'number' && cores <= 4) || saveData) {
      document.documentElement.classList.add('lynqo-low-end')
    }
  } catch {}
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)