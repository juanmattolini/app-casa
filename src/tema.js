import { useEffect, useState } from 'react'

// Light / dark look. 'auto' follows the phone or PC setting; the choice is kept on this device.
// index.html applies the saved choice before the app loads so there is no flash.
const CLAVE = 'casa-tema'
const COLORES = { light: '#f3f5f1', dark: '#0d1412' }
const oscuroSistema = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

export function leerTema() {
  try { return localStorage.getItem(CLAVE) ?? 'auto' } catch { return 'auto' }
}

export const temaEfectivo = (tema) => (tema === 'auto' ? (oscuroSistema() ? 'dark' : 'light') : tema)

function aplicar(tema) {
  const raiz = document.documentElement
  if (tema === 'auto') delete raiz.dataset.theme
  else raiz.dataset.theme = tema
  const color = COLORES[temaEfectivo(tema)]
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', color)
}

const oyentes = new Set()

export function fijarTema(tema) {
  try { tema === 'auto' ? localStorage.removeItem(CLAVE) : localStorage.setItem(CLAVE, tema) } catch { /* not critical */ }
  aplicar(tema)
  for (const f of oyentes) f(tema)
}

export function useTema() {
  const [tema, setTema] = useState(leerTema)
  const [, refrescar] = useState(0)
  useEffect(() => {
    oyentes.add(setTema)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const cambio = () => { if (leerTema() === 'auto') { aplicar('auto'); refrescar((n) => n + 1) } }
    mq?.addEventListener?.('change', cambio)
    return () => { oyentes.delete(setTema); mq?.removeEventListener?.('change', cambio) }
  }, [])
  return [tema, fijarTema]
}

// Quick switch: flips between light and dark from whatever is showing now.
export const alternarTema = () => fijarTema(temaEfectivo(leerTema()) === 'dark' ? 'light' : 'dark')
