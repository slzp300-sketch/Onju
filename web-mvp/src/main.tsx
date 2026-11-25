import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyDocumentLocale } from './i18n'
import { loadRegionalContext } from './regionalContext'

applyDocumentLocale(loadRegionalContext())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
