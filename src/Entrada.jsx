import { useEffect, useState } from 'react'
import { entrar, escucharNube, estadoNube, nube } from './nube.js'

const CLAVE_SIN_CUENTA = 'casa:sin-cuenta'

function leerSinCuenta() {
  try { return localStorage.getItem(CLAVE_SIN_CUENTA) === '1' } catch { return false }
}

// True while the welcome / sign-in screen should cover the app: cloud on, no session,
// and the person hasn't chosen to keep using the app on this device only.
export function useEntradaVisible() {
  const [e, setE] = useState(estadoNube)
  const [sinCuenta, setSinCuenta] = useState(leerSinCuenta)
  useEffect(() => escucharNube(setE), [])
  const seguirSinCuenta = () => {
    try { localStorage.setItem(CLAVE_SIN_CUENTA, '1') } catch {}
    setSinCuenta(true)
  }
  return [!!nube && e.fase === 'sin-sesion' && !sinCuenta, seguirSinCuenta]
}

export default function Entrada({ onSinCuenta }) {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const pedirEnlace = async (e) => {
    e.preventDefault()
    const dir = email.trim()
    if (!dir) return
    setOcupado(true); setError('')
    try {
      await entrar(dir)
      setEnviado(dir)
    } catch (err) {
      console.error(err)
      setError(/rate|seconds/i.test(err.message) ? 'Espera un poco antes de pedir otro enlace.' : 'No se pudo enviar el correo. Revisa la dirección.')
    } finally { setOcupado(false) }
  }

  return (
    <main className="entrada">
      <div className="entrada-arriba">
        <img className="entrada-logo" src="./icon.svg" alt="" />
        <h1>Casa</h1>
        <p>Las tareas de tu casa, con materiales, fotos y presupuestos, siempre a mano.</p>
      </div>

      <div className="entrada-tarjeta">
        {enviado ? (
          <div className="entrada-enviado" role="status">
            <span className="entrada-sobre" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
            </span>
            <h2>Revisa tu correo</h2>
            <p>Te enviamos un enlace a <strong>{enviado}</strong>. Ábrelo en este móvil para entrar.</p>
            <button className="boton-texto" onClick={() => setEnviado(null)}>Usar otro correo</button>
          </div>
        ) : (
          <form className="entrada-form" onSubmit={pedirEnlace}>
            <h2>Iniciar sesión</h2>
            <p className="tenue">Escribe tu correo y te mandamos un enlace para entrar, sin contraseña.</p>
            <input id="entrada-email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com"
              value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo electrónico" required />
            <button className="boton primario ancho" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviarme el enlace'}</button>
            {error && <p className="error" role="status">{error}</p>}
          </form>
        )}
      </div>

      <button className="entrada-saltar" onClick={onSinCuenta}>Seguir sin cuenta (solo en este móvil)</button>
    </main>
  )
}
