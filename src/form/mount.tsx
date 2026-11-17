import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import FormApp from './FormApp'
import { slugFromPath } from './logic'

export function mountForm(root: HTMLElement) {
  document.title = 'Bless Up'
  document.querySelector('meta[name="robots"]')?.remove()
  createRoot(root).render(
    <StrictMode>
      <FormApp slug={slugFromPath(window.location.pathname)} />
    </StrictMode>,
  )
}
