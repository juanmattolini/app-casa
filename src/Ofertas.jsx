import { useEffect, useMemo, useState } from 'react'
import { hoyISO } from './db.js'
import { escucharNube, estadoNube, nube } from './nube.js'

// Ofertas de comercios auspiciantes, debajo de la lista de Compras.
// Se leen de Supabase (tabla "ofertas", solo lectura) y se guardan en el dispositivo para verlas sin conexión.
// Cada oferta lleva palabras clave: si coinciden con algún material por comprar, la oferta sube al principio.
// Siempre se marcan como "Auspiciado". Los cupones se registran en la tabla "cupones" si hay sesión iniciada.

const CACHE = 'app-casa-ofertas'
const MAX_VISIBLES = 3

const leerCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE)) ?? [] } catch { return [] }
}
const guardarCache = (ofertas) => {
  try { localStorage.setItem(CACHE, JSON.stringify(ofertas)) } catch { /* no es crítico */ }
}

export const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function useOfertas() {
  const [ofertas, setOfertas] = useState(leerCache)
  useEffect(() => {
    if (!nube) return
    let vivo = true
    const cargar = async () => {
      const { data, error } = await nube.from('ofertas').select('*').order('orden').order('creada', { ascending: false })
      if (!vivo || error || !data) return
      setOfertas(data)
      guardarCache(data)
    }
    cargar()
    window.addEventListener('online', cargar)
    return () => { vivo = false; window.removeEventListener('online', cargar) }
  }, [])
  return ofertas
}

function useSesion() {
  const [sesion, setSesion] = useState(estadoNube().sesion)
  useEffect(() => escucharNube((e) => setSesion(e.sesion)), [])
  return sesion
}

// Palabras de la oferta que aparecen en los materiales por comprar.
function coincidencias(oferta, textos) {
  const palabras = (oferta.palabras ?? []).map(normal).filter(Boolean)
  return palabras.filter((p) => textos.some((t) => t.includes(p)))
}

async function obtenerCupon(oferta, sesion) {
  if (nube && sesion) {
    const { data: previo } = await nube.from('cupones').select('codigo').eq('oferta_id', oferta.id).maybeSingle()
    if (previo) return { codigo: previo.codigo, registrado: true }
    const { data, error } = await nube.from('cupones').insert({ oferta_id: oferta.id }).select('codigo').single()
    if (!error && data) return { codigo: data.codigo, registrado: true }
  }
  // Sin sesión (o sin conexión): código local, no queda registrado.
  const clave = `app-casa-cupon-${oferta.id}`
  let codigo = null
  try { codigo = localStorage.getItem(clave) } catch { /* ignorar */ }
  if (!codigo) {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    codigo = 'CASA-' + Array.from({ length: 6 }, () => letras[Math.floor(Math.random() * letras.length)]).join('')
    try { localStorage.setItem(clave, codigo) } catch { /* ignorar */ }
  }
  return { codigo, registrado: false }
}

export default function Ofertas({ materiales }) {
  const todas = useOfertas()
  const [abierta, setAbierta] = useState(null)
  const textos = useMemo(() => materiales.map(normal), [materiales])

  const lista = useMemo(() => {
    const hoy = hoyISO()
    return todas
      .filter((o) => !o.vigente_hasta || o.vigente_hasta >= hoy)
      .map((o) => ({ oferta: o, coincide: coincidencias(o, textos) }))
      .sort((a, b) => b.coincide.length - a.coincide.length)
      .slice(0, MAX_VISIBLES)
  }, [todas, textos])

  if (lista.length === 0) return null

  return (
    <section className="bloque ofertas" aria-label="Ofertas de comercios auspiciantes">
      <h2>Dónde comprar <span className="aus">Auspiciado</span></h2>
      <ul className="lista-ofertas">
        {lista.map(({ oferta, coincide }) => (
          <li key={oferta.id}>
            <button className="oferta-tarjeta" onClick={() => setAbierta(oferta)}>
              <span className="oferta-desc">{oferta.descuento}</span>
              <span className="oferta-cuerpo">
                <span className="oferta-titulo">{oferta.titulo}</span>
                <span className="oferta-meta">
                  {oferta.comercio}{oferta.zona ? ` · ${oferta.zona}` : ''}
                </span>
                {coincide.length > 0 && <span className="oferta-match">Para tu lista: {coincide.join(', ')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {abierta && <HojaOferta oferta={abierta} onCerrar={() => setAbierta(null)} />}
    </section>
  )
}

function HojaOferta({ oferta, onCerrar }) {
  const sesion = useSesion()
  const [cupon, setCupon] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const verCupon = async () => {
    setCargando(true)
    try { setCupon(await obtenerCupon(oferta, sesion)) } finally { setCargando(false) }
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={oferta.titulo} onClick={(e) => e.stopPropagation()}>
        <div className="hoja-asa" aria-hidden="true" />
        <span className="aus">Auspiciado</span>
        <h3>{oferta.titulo}</h3>
        <p className="oferta-meta">
          {oferta.comercio}{oferta.rubro ? ` · ${oferta.rubro}` : ''}
          {oferta.direccion ? <><br />{oferta.direccion}{oferta.zona ? `, ${oferta.zona}` : ''}</> : null}
        </p>
        <div className="oferta-caja">
          <strong>{oferta.descuento}</strong>
          {oferta.detalle && <span>{oferta.detalle}</span>}
        </div>
        {oferta.vigente_hasta && <p className="tenue">Válido hasta el {oferta.vigente_hasta.split('-').reverse().join('/')}.</p>}

        {!cupon ? (
          <button className="boton primario ancho" onClick={verCupon} disabled={cargando}>
            {cargando ? 'Generando…' : 'Ver mi cupón'}
          </button>
        ) : (
          <div className="cupon">
            <p className="cupon-codigo" aria-label={`Código ${cupon.codigo}`}>{cupon.codigo}</p>
            <p className="tenue">Mostrá este código en el local.</p>
            {!cupon.registrado && (
              <p className="tenue">Iniciá sesión en Ajustes para que tus cupones queden guardados y registrados.</p>
            )}
            <button className="boton ancho" onClick={onCerrar}>Listo</button>
          </div>
        )}
      </div>
    </div>
  )
}
