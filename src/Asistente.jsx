import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.js'
import { asistentePrueba, guardarCharla, leerCharla, preguntar } from './asistente.js'
import { useUsuario } from './Nube.jsx'
import { BotonML, NotaAfiliado } from './MercadoLibre.jsx'
import { BarraSuperior, useMoneda } from './App.jsx'
import { normal } from './Ofertas.jsx'
import { cantidadTexto } from './util.js'

const SUGERENCIAS = [
  '¿Cómo arreglo una canilla que gotea?',
  '¿Qué necesito para pintar una habitación?',
  '¿Qué tarea me conviene hacer primero?',
]

// Pantalla de chat. Con focoId (desde el detalle de una tarea) el asistente sabe de qué tarea se habla.
export default function Asistente({ nav, focoId }) {
  const usuario = useUsuario()
  const foco = useLiveQuery(async () => (focoId ? db.tareas.get(focoId) : null), [focoId], null)
  const [mensajes, setMensajes] = useState(leerCharla)
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const [restantes, setRestantes] = useState(null)
  const final = useRef(null)
  const necesitaSesion = !asistentePrueba && !usuario

  useEffect(() => { guardarCharla(mensajes) }, [mensajes])
  useEffect(() => { final.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, esperando])

  const enviar = async (pregunta) => {
    const limpia = pregunta.trim()
    if (!limpia || esperando || necesitaSesion) return
    const conPregunta = [...mensajes, { role: 'user', content: limpia }]
    setMensajes(conPregunta)
    setTexto('')
    setEsperando(true)
    try {
      const r = await preguntar(conPregunta, focoId)
      setMensajes((ms) => [...ms, { role: 'assistant', content: r.texto || 'Te dejo una propuesta:', propuestas: r.propuestas ?? [] }])
      if (r.restantes != null) setRestantes(r.restantes)
    } catch (e) {
      setMensajes((ms) => [...ms, { role: 'error', content: e.message }])
    } finally {
      setEsperando(false)
    }
  }

  return (
    <main className="pantalla asistente">
      <BarraSuperior titulo="Asistente" onVolver={nav.volver} accion={
        mensajes.length > 0 && <button className="boton-texto" onClick={() => setMensajes([])}>Borrar charla</button>
      } />

      {foco && <p className="asis-foco">Sobre la tarea <strong>{foco.titulo}</strong></p>}

      {mensajes.length === 0 && (
        <div className="asis-intro">
          <p className="vacio-titulo">¿En qué te ayudo con la casa?</p>
          <p className="tenue">Preguntá cómo arreglar algo o qué materiales comprar. Si hace falta, te propongo la tarea con su lista para que la guardes.</p>
          {!necesitaSesion && (
            <div className="asis-sugerencias">
              {SUGERENCIAS.map((s) => <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>)}
            </div>
          )}
        </div>
      )}

      <ol className="asis-mensajes">
        {mensajes.map((m, i) => (
          <li key={i} className={`asis-msj ${m.role}`}>
            {m.role === 'assistant' ? <Texto texto={m.content} /> : <p>{m.content}</p>}
            {m.propuestas?.map((p, j) => <Propuesta key={j} propuesta={p} nav={nav} />)}
          </li>
        ))}
        {esperando && <li className="asis-msj assistant pensando" aria-live="polite"><span /><span /><span /></li>}
      </ol>
      <div ref={final} />

      <form className="asis-entrada" onSubmit={(e) => { e.preventDefault(); enviar(texto) }}>
        {necesitaSesion ? (
          <p className="tenue">Entrá con tu cuenta en Ajustes para usar el asistente.</p>
        ) : (
          <>
            <textarea rows={1} value={texto} placeholder="Escribí tu pregunta…" aria-label="Pregunta para el asistente"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) } }} />
            <button className="boton primario" disabled={!texto.trim() || esperando} aria-label="Enviar"><IconoEnviar /></button>
          </>
        )}
        <p className="asis-pie tenue">
          {asistentePrueba ? 'Modo de prueba: respuestas simuladas.' : 'Responde una IA (Claude) y puede equivocarse.'}
          {restantes != null && ` Te quedan ${restantes} consultas hoy.`}
        </p>
      </form>
    </main>
  )
}

// Texto del asistente: párrafos y listas tal cual, sin los ** de negrita.
const Texto = ({ texto }) => <p>{texto.replace(/\*\*(.+?)\*\*/g, '$1')}</p>

function Propuesta({ propuesta, nav }) {
  const moneda = useMoneda()
  const habitaciones = useLiveQuery(() => db.habitaciones.toArray(), [], [])
  const hab = habitaciones.find((h) => normal(h.nombre).trim() === normal(propuesta.habitacion).trim())
  const materiales = (propuesta.materiales ?? []).filter((m) => m.nombre?.trim()).map((m) => ({
    nombre: m.nombre.trim(), cantidad: m.cantidad > 0 ? m.cantidad : null, unidad: m.unidad || 'ud',
  }))
  const crear = () => nav.ir({
    pantalla: 'formulario',
    titulo: propuesta.titulo,
    notas: propuesta.notas ?? '',
    prioridad: ['alta', 'media', 'baja'].includes(propuesta.prioridad) ? propuesta.prioridad : 'media',
    habitacionId: hab?.id ?? '',
    materiales,
  })

  return (
    <section className="asis-propuesta">
      <span className="aus">Tarea propuesta</span>
      <h3>{propuesta.titulo}</h3>
      {hab && <p className="tenue">{hab.nombre}</p>}
      {materiales.length > 0 && (
        <ul className="materiales">
          {materiales.map((m) => (
            <li key={m.nombre} className="compra-mat">
              <div className="asis-mat">
                <span className="mat-nombre">{m.nombre}</span>
                <span className="mat-cant">{cantidadTexto(m)}</span>
              </div>
              <BotonML material={m} moneda={moneda} />
            </li>
          ))}
        </ul>
      )}
      <button className="boton primario ancho" onClick={crear}>Revisar y guardar tarea</button>
      {materiales.length > 0 && <NotaAfiliado />}
    </section>
  )
}

const IconoEnviar = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12 20 4l-6 16-3-7z" /><path d="m11 13 9-9" />
  </svg>
)
