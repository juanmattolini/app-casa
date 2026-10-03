import { useEffect, useState } from 'react'
import { entrar, escucharNube, estadoNube, nube, salir, sincronizar } from './nube.js'

function useNube() {
  const [e, setE] = useState(estadoNube)
  useEffect(() => escucharNube(setE), [])
  return e
}

const FASES = {
  iniciando: 'Preparando…',
  sincronizando: 'Sincronizando…',
  'al-dia': 'Todo guardado en la nube.',
  'sin-conexion': 'Sin conexión. Se sincroniza solo cuando vuelva internet.',
  error: 'No se pudo sincronizar. Se reintentará solo.',
}

// Ajustes block: sign in with an emailed link, see sync status, sign out.
export default function Nube() {
  const { sesion, fase, ultima } = useNube()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (!nube) return null

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

  if (!sesion)
    return (
      <section className="bloque">
        <h2>Nube</h2>
        <p className="tenue">Guarda tus tareas, fotos y presupuestos en la nube para no perderlos y verlos en otro dispositivo.</p>
        {enviado ? (
          <p role="status">Te enviamos un enlace a <strong>{enviado}</strong>. Ábrelo en este móvil para entrar.</p>
        ) : (
          <form className="fila-form" onSubmit={pedirEnlace}>
            <input id="nube-email" type="email" inputMode="email" autoComplete="email" placeholder="Tu correo" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo electrónico" />
            <button className="boton pequeño" disabled={ocupado}>Entrar</button>
          </form>
        )}
        {enviado && <button className="boton-texto" onClick={() => setEnviado(null)}>Usar otro correo</button>}
        {error && <p className="error" role="status">{error}</p>}
      </section>
    )

  return (
    <section className="bloque">
      <h2>Nube</h2>
      <p>Conectado como <strong>{sesion.user.email}</strong></p>
      <p className={fase === 'error' ? 'error' : 'tenue'} role="status">
        {FASES[fase] ?? ''}
        {fase === 'al-dia' && ultima && ` Última vez: ${new Date(ultima).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}.`}
      </p>
      <div className="botones-foto">
        <button className="boton" disabled={fase === 'sincronizando'} onClick={() => sincronizar()}>Sincronizar ahora</button>
        <button className="boton-texto" onClick={salir}>Cerrar sesión</button>
      </div>
      <p className="tenue pie">Al cerrar sesión los datos se quedan en este móvil.</p>
    </section>
  )
}
