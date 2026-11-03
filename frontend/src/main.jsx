import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminApp from './admin/AdminApp.jsx'

function Aplicacao() {
  const caminho = window.location.pathname.replace(/\/+$/, '') || '/'

  if (caminho === '/admin' || caminho.startsWith('/admin/')) {
    return <AdminApp />
  }

  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Aplicacao />
  </StrictMode>,
)