import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.js'
import Ofertas from './Ofertas.jsx'
import Recomendados from './Recomendados.jsx'
import { IconoCategoria } from './Iconos.jsx'

// "Ofertas" tab: sponsored offers (always visible, not only when something is left to buy)
// plus hardware stores and building-supply yards near the user.
// Nearby shops come from OpenStreetMap (Overpass API, free, no key). The location is asked only
// when the user taps the button, is sent only to that search, and is never saved: only the
// resulting list is kept on the device so it shows again next time.

const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const GUARDADO = 'casa-cercanos'
const RADIOS = [2, 5, 10]

const TIPOS = {
  hardware: 'Ferretería',
  doityourself: 'Materiales y bricolaje',
  building_materials: 'Corralón',
  building_supplies: 'Corralón',
  trade: 'Corralón',
  paint: 'Pinturería',
  electrical: 'Casa de electricidad',
  bathroom_furnishing: 'Sanitarios',
  plumbing: 'Sanitarios',
}

const leerGuardado = () => {
  try { return JSON.parse(localStorage.getItem(GUARDADO)) } catch { return null }
}

function ubicacion() {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error('sin-gps'))
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => mal(new Error(e.code === 1 ? 'denegado' : 'sin-ubicacion')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

// Straight-line distance in km.
function distancia(a, b) {
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

async function buscarCercanos({ lat, lon }, km) {
  const r = km * 1000
  const consulta = `[out:json][timeout:20];(
    nwr["shop"~"^(hardware|doityourself|building_materials|trade|paint|electrical|bathroom_furnishing)$"](around:${r},${lat},${lon});
    nwr["trade"~"^(building_supplies|plumbing)$"](around:${r},${lat},${lon});
  );out center tags 80;`
  let ultimoError
  for (const url of SERVIDORES) {
    try {
      const resp = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: consulta }) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const { elements = [] } = await resp.json()
      const vistos = new Set()
      return elements
        .map((e) => {
          const t = e.tags ?? {}
          const punto = { lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon }
          if (!t.name || punto.lat == null) return null
          const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
          return {
            id: `${e.type}${e.id}`,
            nombre: t.name,
            tipo: TIPOS[t.shop] ?? TIPOS[t.trade] ?? 'Ferretería',
            direccion: [calle, t['addr:city'] ?? t['addr:suburb']].filter(Boolean).join(', '),
            telefono: t.phone ?? t['contact:phone'] ?? '',
            horario: t.opening_hours ?? '',
            km: distancia({ lat, lon }, punto),
            ...punto,
          }
        })
        .filter((x) => x && !vistos.has(x.nombre + x.direccion) && vistos.add(x.nombre + x.direccion))
        .sort((a, b) => a.km - b.km)
        .slice(0, 30)
    } catch (err) {
      ultimoError = err
    }
  }
  throw ultimoError
}

const kmTexto = (km) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1).replace('.', ',')} km`)
const comoLlegar = (c) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`

export function PantallaOfertas() {
  const materiales = useLiveQuery(async () => {
    const tareas = new Map((await db.tareas.toArray()).map((t) => [t.id, t]))
    return (await db.materiales.toArray()).filter((m) => !m.comprado && tareas.get(m.tareaId)?.estado !== 'hecha').map((m) => m.nombre)
  }, [], [])

  return (
    <main className="pantalla con-pestanas">
      <header className="cabecera-simple">
        <h1>Ofertas</h1>
        <p className="tenue">Descuentos de comercios y ferreterías cerca tuyo.</p>
      </header>
      <Cercanos />
      <Ofertas
        materiales={materiales} max={Infinity} titulo="Descuentos"
        vacio={<section className="bloque ofertas"><h2>Descuentos</h2><p className="tenue">Por ahora no hay descuentos vigentes.</p></section>}
      />
      <Recomendados />
    </main>
  )
}

function Cercanos() {
  const [guardado, setGuardado] = useState(leerGuardado)
  const [radio, setRadio] = useState(guardado?.radio ?? 5)
  const [estado, setEstado] = useState(null) // null | 'buscando' | {error}

  const buscar = async (km = radio) => {
    setRadio(km)
    setEstado('buscando')
    try {
      const yo = await ubicacion()
      const lista = await buscarCercanos(yo, km)
      const nuevo = { fecha: Date.now(), radio: km, lista }
      setGuardado(nuevo)
      try { localStorage.setItem(GUARDADO, JSON.stringify(nuevo)) } catch { /* not critical */ }
      setEstado(null)
    } catch (err) {
      console.error(err)
      setEstado({
        error: err.message === 'denegado'
          ? 'No diste permiso de ubicación. Actívalo para este sitio en la configuración del navegador y vuelve a intentar.'
          : err.message === 'sin-gps' || err.message === 'sin-ubicacion'
            ? 'No se pudo saber dónde estás. Revisa que la ubicación del celular esté encendida.'
            : 'No se pudo buscar ahora. Revisa la conexión y prueba de nuevo.',
      })
    }
  }

  const buscando = estado === 'buscando'
  const lista = guardado?.lista ?? []

  return (
    <section className="bloque cercanos">
      <h2>Cerca tuyo</h2>
      {!guardado ? (
        <div className="tarjeta cercanos-invitar">
          <IconoCategoria texto="ferretería" />
          <div>
            <p><strong>Ferreterías y corralones cerca</strong></p>
            <p className="tenue">Usamos tu ubicación solo para esta búsqueda. No se guarda.</p>
          </div>
          <button className="boton primario" disabled={buscando} onClick={() => buscar()}>
            <IconoUbicacion /> {buscando ? 'Buscando…' : 'Usar mi ubicación'}
          </button>
        </div>
      ) : (
        <>
          <div className="cercanos-barra">
            <div className="chips" role="group" aria-label="Distancia">
              {RADIOS.map((km) => (
                <button key={km} className={`chip ${radio === km ? 'activo' : ''}`} aria-pressed={radio === km} disabled={buscando} onClick={() => buscar(km)}>
                  {km} km
                </button>
              ))}
            </div>
            <button className="boton pequeño" disabled={buscando} onClick={() => buscar()}>
              <IconoUbicacion /> {buscando ? 'Buscando…' : 'Actualizar'}
            </button>
          </div>
          {lista.length === 0 && !buscando && (
            <p className="tenue">No encontramos ferreterías ni corralones a menos de {guardado.radio} km. Prueba con más distancia.</p>
          )}
          <ul className="lista lista-cercanos">
            {lista.map((c) => (
              <li key={c.id} className="fila cercano">
                <IconoCategoria texto={c.tipo} />
                <div className="fila-cuerpo">
                  <span className="fila-titulo">{c.nombre}</span>
                  <span className="fila-meta">
                    <span>{kmTexto(c.km)}</span>
                    <span>{c.tipo}</span>
                    {c.direccion && <span>{c.direccion}</span>}
                  </span>
                </div>
                <div className="cercano-acciones">
                  {c.telefono && <a className="llamar" href={`tel:${c.telefono.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${c.nombre}`}><IconoTel /></a>}
                  <a className="llamar" href={comoLlegar(c)} target="_blank" rel="noopener" aria-label={`Cómo llegar a ${c.nombre}`}><IconoRuta /></a>
                </div>
              </li>
            ))}
          </ul>
          <p className="tenue pie">Datos de OpenStreetMap. Distancia en línea recta.</p>
        </>
      )}
      {estado?.error && <p className="error" role="alert">{estado.error}</p>}
    </section>
  )
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const IconoUbicacion = () => <svg {...svg}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
const IconoRuta = () => <svg {...svg}><path d="M3 11.5 21 3l-8.5 18-2-7.5z" /></svg>
const IconoTel = () => <svg {...svg}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
