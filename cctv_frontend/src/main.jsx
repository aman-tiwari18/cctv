import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'

const CHUNK_RELOAD_KEY = 'cctv_analytics:last-chunk-reload';
const CHUNK_RELOAD_COOLDOWN_MS = 30000;

window.addEventListener('vite:preloadError', (event) => {
  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);

  if (now - lastReload < CHUNK_RELOAD_COOLDOWN_MS) {
    return;
  }

  event.preventDefault();
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename='/cctv_analytics'>
      <App />
    </BrowserRouter>

  </React.StrictMode>,
)
