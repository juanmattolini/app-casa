import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { inicializar } from './db.js'
import { iniciarNube } from './nube.js'
import './estilos.css'

const root = createRoot(document.getElementById('root'))
inicializar()
  .catch((e) => console.error('No se pudo preparar la base de datos', e))
  .finally(() => {
    root.render(<App />)
    iniciarNube().catch((e) => console.error('No se pudo conectar con la nube', e))
  })
