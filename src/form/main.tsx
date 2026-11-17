import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '../index.css'
import '../i18n'
import FormApp from './FormApp'
import { slugFromPath } from './logic'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FormApp slug={slugFromPath(window.location.pathname)} />
  </StrictMode>,
)
