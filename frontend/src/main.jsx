import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PreferencesProvider from './preferences/PreferencesProvider.jsx'

// Preferences (theme, language) wrap the whole app so the sign-in screen can use them too.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
)
