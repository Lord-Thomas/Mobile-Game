import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { ColorManagement } from 'three'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ui/ErrorBoundary.jsx'

ColorManagement.enabled = true

const params = new URLSearchParams(window.location.search)
// ?editor opens the dev editor; optional value picks the mode (?editor=tree|house|particles).
// ?treeeditor is kept as a legacy alias.
const isEditor = params.has('editor') || params.has('treeeditor')
// ?tool=thumbnail opens the thumbnail capture tool. Routed here (not inside App)
// so App() never has an early return before its hooks — see Rules of Hooks.
const isThumbnailTool = params.get('tool') === 'thumbnail'

if (isThumbnailTool) {
  import('./tools/ThumbnailTool.jsx').then(({ default: ThumbnailTool }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <ErrorBoundary>
          <ThumbnailTool />
        </ErrorBoundary>
      </StrictMode>
    )
  })
} else if (isEditor) {
  const initialMode = params.get('editor') || (params.has('treeeditor') ? 'tree' : '')
  import('./tools/Editor.jsx').then(({ default: Editor }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <ErrorBoundary>
          <Editor initialMode={initialMode || 'tree'} />
        </ErrorBoundary>
      </StrictMode>
    )
  })
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
        <Analytics />
      </ErrorBoundary>
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

