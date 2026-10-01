import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { inicializar } from './db.js'
import './estilos.css'

const root = createRoot(document.getElementById('root'))
inicializar()
  .catch((e) => console.error('No se pudo preparar la base de datos', e))
  .finally(() => root.render(<App />))
