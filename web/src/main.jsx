import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { ColorManagement } from 'three'
import './index.css'
import App from './App.jsx'

ColorManagement.enabled = true

const params = new URLSearchParams(window.location.search)
// ?editor opens the dev editor; optional value picks the mode (?editor=tree|house|particles).
// ?treeeditor is kept as a legacy alias.
const isEditor = params.has('editor') || params.has('treeeditor')

if (isEditor) {
  const initialMode = params.get('editor') || (params.has('treeeditor') ? 'tree' : '')
  import('./tools/Editor.jsx').then(({ default: Editor }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <Editor initialMode={initialMode || 'tree'} />
      </StrictMode>
    )
  })
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
      <Analytics />
    </StrictMode>,
  )
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered:', reg.scope))
      .catch((err) => console.warn('Service Worker registration failed:', err));
  });
}

