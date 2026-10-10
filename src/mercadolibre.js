import { useEffect, useState } from 'react'
import { nube } from './nube.js'
import { normal } from './Ofertas.jsx'

// Mercado Libre: 3 opciones por material (Compras) y precio de referencia (presupuesto sugerido en Gastos).
// La búsqueda la hace la Edge Function "ml-buscar" (supabase/functions/ml-buscar), que guarda las credenciales
// y la caché del servidor. Acá hay otra caché de 24 h en el dispositivo para no repetir llamadas.
//
// Modo (VITE_ML al compilar, o ?ml=... en la dirección, que queda guardado en este dispositivo):
//   ''/no    apagado: no se muestra nada (por defecto hasta que la función esté desplegada)
//   prueba   datos simulados en el propio dispositivo, para ver la pantalla sin servidor
//   si       llama a la función de verdad

const CLAVE_MODO = 'app-casa-ml-modo'
const CLAVE_CACHE = 'app-casa-ml'
const HORAS = 24
const MAX_CACHE = 80

function leerModo() {
  try {
    const url = new URLSearchParams(location.search).get('ml')
    if (url != null) localStorage.setItem(CLAVE_MODO, url)
    return localStorage.getItem(CLAVE_MODO) ?? import.meta.env.VITE_ML ?? ''
  } catch {
    return import.meta.env.VITE_ML ?? ''
  }
}
const MODO = leerModo()
export const mlActivo = MODO === 'prueba' || (MODO === 'si' && !!nube)
export const mlPrueba = MODO === 'prueba'

const leerCache = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE_CACHE)) ?? {} } catch { return {} }
}
function guardarEnCache(q, datos) {
  try {
    const c = leerCache()
    c[q] = { t: Date.now(), datos }
    const claves = Object.keys(c).sort((a, b) => c[b].t - c[a].t)
    for (const k of claves.slice(MAX_CACHE)) delete c[k]
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(c))
  } catch { /* no es crítico */ }
}

// Mismo criterio que la función: datos inventados pero estables para un mismo texto.
function simulado(q) {
  let h = 0
  for (const c of q) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const base = 3000 + (h % 40) * 1000
  const opciones = [0.85, 1, 1.3].map((f, i) => ({
    id: `PRUEBA-${h}-${i}`,
    titulo: `${q.charAt(0).toUpperCase() + q.slice(1)} ${['económico', 'calidad estándar', 'primera marca'][i]}`,
    precio: Math.round((base * f) / 100) * 100,
    moneda: 'ARS',
    foto: null,
    envioGratis: i !== 0,
    enlace: `https://listado.mercadolibre.com.ar/${encodeURIComponent(q.replace(/\s+/g, '-'))}`,
  }))
  return { opciones, referencia: base, moneda: 'ARS', prueba: true }
}

export const consultaDe = (texto) => normal(texto).replace(/\s+/g, ' ').trim().slice(0, 80)

const enCurso = new Map()

// Devuelve { opciones, referencia, moneda } o lanza un error. Usa la caché si tiene menos de 24 h.
export function buscarML(texto) {
  const q = consultaDe(texto)
  if (q.length < 2) return Promise.resolve({ opciones: [], referencia: null, moneda: null })
  const guardado = leerCache()[q]
  if (guardado && Date.now() - guardado.t < HORAS * 3600_000) return Promise.resolve(guardado.datos)
  if (mlPrueba) return Promise.resolve(simulado(q))
  if (!enCurso.has(q)) {
    const p = (async () => {
      const { data, error } = await nube.functions.invoke('ml-buscar', { body: { q } })
      if (error || !data || data.error) throw new Error(data?.error ?? 'Sin respuesta de Mercado Libre')
      guardarEnCache(q, data)
      return data
    })()
    p.finally(() => enCurso.delete(q)).catch(() => {})
    enCurso.set(q, p)
  }
  return enCurso.get(q)
}

// Cuántas unidades del producto de referencia hacen falta. Solo se multiplica si la cantidad está en
// unidades sueltas ("3 ud"); "2 litros" de pintura cuenta como un producto, porque el envase ya trae litros.
const UNIDADES = new Set(['', 'u', 'ud', 'uds', 'unidad', 'unidades', 'pieza', 'piezas', 'cartucho', 'cartuchos', 'rollo', 'rollos', 'caja', 'cajas', 'bolsa', 'bolsas'])
export function unidadesDe(m) {
  const n = Number(String(m.cantidad ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 1
  return UNIDADES.has(normal(m.unidad ?? '').trim()) ? Math.min(Math.ceil(n), 50) : 1
}

// Precio de referencia de cada nombre: { [nombre]: número | null }. Busca de a uno para no saturar.
export function useReferencias(nombres) {
  const clave = [...new Set(nombres)].sort().join('\n')
  const [refs, setRefs] = useState({})
  useEffect(() => {
    if (!mlActivo || !clave) return
    let vivo = true
    ;(async () => {
      for (const nombre of clave.split('\n')) {
        try {
          const d = await buscarML(nombre)
          if (vivo) setRefs((r) => ({ ...r, [nombre]: d.referencia ?? null }))
        } catch {
          if (vivo) setRefs((r) => ({ ...r, [nombre]: null }))
        }
      }
    })()
    return () => { vivo = false }
  }, [clave])
  return refs
}

// Suma estimada de los materiales pendientes. { total, faltan } (faltan = sin precio todavía).
export function estimar(materiales, refs) {
  let total = 0, faltan = 0
  for (const m of materiales) {
    const r = refs[m.nombre]
    if (r == null) faltan++
    else total += r * unidadesDe(m)
  }
  return { total, faltan }
}
