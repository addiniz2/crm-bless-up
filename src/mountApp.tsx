import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

export function mountApp(root: HTMLElement) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
