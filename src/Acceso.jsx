import { useState } from 'react'
import { entrar, entrarConClave, nube } from './nube.js'
import { useNube } from './Nube.jsx'
import './acceso.css'

// Sign-in gate. Without a session the user sees this screen first; "Seguir sin cuenta"
// keeps the app usable only on this device (the choice is remembered until sign-out).
const OMITIR = 'casa-sin-cuenta'
const CON_CLAVE = 'casa-con-clave'
const leer = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* not critical */ } }
export const olvidarOmision = () => guardar(OMITIR, null)

export default function Acceso({ children }) {
  const { sesion, fase } = useNube()
  const [omitido, setOmitido] = useState(() => leer(OMITIR) === '1')
  if (!nube || sesion || omitido) return children
  if (fase === 'iniciando') return <div className="acceso" aria-busy="true" />
  return <Pantalla onOmitir={() => { guardar(OMITIR, '1'); setOmitido(true) }} />
}

function Pantalla({ onOmitir }) {
  const [modo, setModo] = useState(leer(CON_CLAVE) ? 'clave' : 'enlace')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cambiar = (m) => { setModo(m); setError(''); setEnviado(null) }

  const enviar = async (e) => {
    e.preventDefault()
    const dir = email.trim()
    if (!dir) return
    setOcupado(true); setError('')
    try {
      if (modo === 'clave') {
        await entrarConClave(dir, clave)
        guardar(CON_CLAVE, '1')
      } else {
        await entrar(dir)
        setEnviado(dir)
      }
    } catch (err) {
      console.error(err)
      const msg = err?.message ?? ''
      setError(
        /invalid login|credentials/i.test(msg) ? 'Correo o contraseña incorrectos. Si aún no creaste una contraseña, entra con el enlace.'
        : /rate|seconds/i.test(msg) ? 'Espera un poco antes de pedir otro enlace.'
        : 'No se pudo entrar. Revisa tu conexión y la dirección de correo.',
      )
    } finally { setOcupado(false) }
  }

  return (
    <main className="acceso">
      <div className="acceso-marca">
        <img src="icon.svg" alt="" width="72" height="72" />
        <h1>Casa</h1>
        <p>Las tareas de la casa, siempre contigo.</p>
      </div>

      <section className="acceso-tarjeta">
        {enviado ? (
          <div className="acceso-enviado" role="status">
            <h2>Revisa tu correo</h2>
            <p>Te enviamos un enlace a <strong>{enviado}</strong>. Ábrelo en este móvil para entrar.</p>
            <button className="boton-texto" onClick={() => setEnviado(null)}>Usar otro correo</button>
          </div>
        ) : (
          <>
            <div className="acceso-modos" role="tablist" aria-label="Forma de entrar">
              <button role="tab" aria-selected={modo === 'enlace'} className={modo === 'enlace' ? 'activa' : ''} onClick={() => cambiar('enlace')}>Enlace</button>
              <button role="tab" aria-selected={modo === 'clave'} className={modo === 'clave' ? 'activa' : ''} onClick={() => cambiar('clave')}>Contraseña</button>
            </div>
            <form onSubmit={enviar}>
              <label htmlFor="acceso-email">Correo electrónico</label>
              <input id="acceso-email" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {modo === 'clave' && (
                <>
                  <label htmlFor="acceso-clave">Contraseña</label>
                  <div className="acceso-clave">
                    <input id="acceso-clave" type={verClave ? 'text' : 'password'} autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
                    <button type="button" className="boton-texto" onClick={() => setVerClave((v) => !v)} aria-pressed={verClave}>{verClave ? 'Ocultar' : 'Ver'}</button>
                  </div>
                </>
              )}
              {error && <p className="error" role="alert">{error}</p>}
              <button className="boton primario acceso-entrar" disabled={ocupado}>
                {ocupado ? 'Un momento…' : modo === 'clave' ? 'Entrar' : 'Enviarme el enlace'}
              </button>
            </form>
            <p className="tenue pie acceso-ayuda">
              {modo === 'enlace'
                ? 'Te mandamos un enlace al correo: sin contraseña. Si es tu primera vez, se crea la cuenta sola.'
                : 'Si olvidaste la contraseña, entra con el enlace y crea otra en Ajustes.'}
            </p>
          </>
        )}
      </section>

      <button className="boton-texto acceso-omitir" onClick={onOmitir}>Seguir sin cuenta</button>
      <p className="tenue pie acceso-pie">Sin cuenta, tus datos quedan solo en este móvil.</p>
    </main>
  )
}
