import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'

const isTreeEditor = new URLSearchParams(window.location.search).has('treeeditor')

if (isTreeEditor) {
  import('./tools/TreeEditor.jsx').then(({ default: TreeEditor }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <TreeEditor />
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
