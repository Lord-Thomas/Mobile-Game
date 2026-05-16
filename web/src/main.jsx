import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { ColorManagement } from 'three'
import './index.css'
import App from './App.jsx'

ColorManagement.enabled = true

const params = new URLSearchParams(window.location.search)
const isTreeEditor = params.has('treeeditor') || params.has('editor')

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
