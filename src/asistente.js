import { db } from './db.js'
import { nube } from './nube.js'
import { responderBasico } from './asistente-basico.js'
import { cantidadTexto } from './util.js'

// Asistente: chat sobre la casa que responde la Edge Function "asistente" (supabase/functions/asistente) con Claude.
// La clave de la API vive solo en el servidor; cada consulta tiene costo y hay un límite diario por usuario.
//
// Modo (VITE_ASISTENTE al compilar, o ?asistente=... en la dirección, que queda guardado en este dispositivo):
//   ''/no    apagado: no se muestra nada (por defecto)
//   basico   respuestas armadas en el dispositivo (asistente-basico.js): sin IA, sin servidor y gratis
//   si       llama a la función con Claude (necesita sesión iniciada y tiene costo)
// ("prueba" es lo mismo que "basico".)

const CLAVE_MODO = 'app-casa-asistente-modo'
const CLAVE_CHARLA = 'app-casa-asistente'
const MAX_GUARDADOS = 40

function leerModo() {
  try {
    const url = new URLSearchParams(location.search).get('asistente')
    if (url != null) localStorage.setItem(CLAVE_MODO, url)
    return localStorage.getItem(CLAVE_MODO) ?? import.meta.env.VITE_ASISTENTE ?? ''
  } catch {
    return import.meta.env.VITE_ASISTENTE ?? ''
  }
}
const MODO = leerModo()
export const asistenteBasico = MODO === 'basico' || MODO === 'prueba'
export const asistenteActivo = asistenteBasico || (MODO === 'si' && !!nube)

// La conversación queda en este dispositivo (no se sincroniza).
export function leerCharla() {
  try { return JSON.parse(localStorage.getItem(CLAVE_CHARLA)) ?? [] } catch { return [] }
}
export function guardarCharla(mensajes) {
  try { localStorage.setItem(CLAVE_CHARLA, JSON.stringify(mensajes.slice(-MAX_GUARDADOS))) } catch { /* no es crítico */ }
}

// Lo que el asistente sabe de la casa: tareas pendientes con materiales, habitaciones y aparatos. Sin fotos ni contactos.
export async function contextoCasa(focoId) {
  const [tareas, materiales, habitaciones, aparatos] = await Promise.all([
    db.tareas.toArray(), db.materiales.toArray(), db.habitaciones.toArray(), db.aparatos.toArray(),
  ])
  const hab = Object.fromEntries(habitaciones.map((h) => [h.id, h.nombre]))
  const porTarea = new Map()
  for (const m of materiales) {
    if (!porTarea.has(m.tareaId)) porTarea.set(m.tareaId, [])
    const cant = cantidadTexto(m)
    porTarea.get(m.tareaId).push(`${m.nombre}${cant ? ` (${cant})` : ''}${m.comprado ? ' ✓comprado' : ''}`)
  }
  const resumen = (t) => ({
    titulo: t.titulo,
    habitacion: hab[t.habitacionId] ?? undefined,
    prioridad: t.prioridad,
    vence: t.fechaLimite ?? undefined,
    notas: t.notas ? t.notas.slice(0, 200) : undefined,
    materiales: porTarea.get(t.id),
  })
  const pendientes = tareas.filter((t) => t.estado !== 'hecha' && !t.ejemplo)
  const foco = focoId ? tareas.find((t) => t.id === focoId) : null
  return {
    foco: foco ? resumen(foco) : undefined,
    tareasPendientes: pendientes.filter((t) => t !== foco).slice(0, 50).map(resumen),
    habitaciones: habitaciones.map((h) => h.nombre),
    aparatos: aparatos.slice(0, 30).map((a) => [a.nombre, hab[a.habitacionId]].filter(Boolean).join(' · ')),
  }
}

// Envía la conversación (los últimos mensajes, solo texto) y devuelve { texto, propuestas, restantes } o lanza un error.
export async function preguntar(mensajes, focoId) {
  // Las propuestas viajan como una nota al final del texto, para que el asistente sepa qué ya ofreció.
  const historial = mensajes.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12).map((m) => ({
    role: m.role,
    content: m.content + (m.propuestas?.length ? `\n\n[Propuse la tarea: ${m.propuestas.map((t) => t.titulo).join('; ')}]` : ''),
  }))
  if (asistenteBasico) return responderBasico(historial[historial.length - 1]?.content ?? '')
  const contexto = await contextoCasa(focoId)
  const { data, error } = await nube.functions.invoke('asistente', { body: { mensajes: historial, contexto } })
  if (data?.error) throw new Error(data.error)
  if (error) {
    // Las respuestas con error traen el motivo en el cuerpo.
    let motivo = null
    try { motivo = (await error.context?.json?.())?.error } catch { /* sin cuerpo */ }
    throw new Error(motivo ?? 'El asistente no respondió. Revisá la conexión y probá de nuevo.')
  }
  return data
}
