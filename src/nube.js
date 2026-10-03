import Dexie from 'dexie'
import { createClient } from '@supabase/supabase-js'
import { borrarEjemplos, db, unirHabitacionesRepetidas } from './db.js'
import { NUBE_CLAVE, NUBE_URL } from './nube-config.js'

// Cloud sync with Supabase. The device stays the source the app reads from (works offline);
// each sync compares every local row with what was last sent, uploads the differences, then
// downloads what other devices changed. Rows travel as JSON in public.registros, keyed by a
// uid; local numeric ids and references (tareaId, habitacionId...) are translated to uids.
// Blobs (photos, PDFs) go to the "archivos" bucket.

export const nube = NUBE_URL
  ? createClient(NUBE_URL, NUBE_CLAVE, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true } })
  : null

// Upload order matters: parents first so references resolve on the other side.
const TABLAS = ['habitaciones', 'tareas', 'materiales', 'fotos', 'presupuestos', 'meta']
const REFERENCIAS = {
  tareas: { habitacionId: 'habitaciones', siguienteId: 'tareas' },
  materiales: { tareaId: 'tareas' },
  fotos: { tareaId: 'tareas' },
  presupuestos: { tareaId: 'tareas' },
}
const META_SINCRONIZADA = ['moneda']
const BUCKET = 'archivos'
const ESTADO = '_estado'

/* ---------- status for the UI ---------- */

let estado = { sesion: null, fase: nube ? 'iniciando' : 'apagada', ultima: null, error: null }
const oyentes = new Set()
const fijar = (cambios) => {
  estado = { ...estado, ...cambios }
  for (const f of oyentes) f(estado)
}
export const estadoNube = () => estado
export function escucharNube(f) {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

/* ---------- helpers ---------- */

const estable = (v) => {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
const firmaDe = (blob) => `${blob.size}:${blob.type}`
const claveDe = (tabla, id) => `${tabla}:${id}`
const idDe = (tabla, fila) => (tabla === 'meta' ? fila.clave : fila.id)

async function filasLocales(tabla) {
  const filas = await db[tabla].toArray()
  return tabla === 'meta' ? filas.filter((f) => META_SINCRONIZADA.includes(f.clave)) : filas
}

// Local row -> what is stored remotely (datos) plus its blobs, kept apart.
function aRemoto(tabla, fila, uidDe) {
  const datos = {}
  const blobs = {}
  for (const [k, v] of Object.entries(fila)) {
    if (k === 'id' || (tabla === 'meta' && k === 'clave')) continue
    const ref = REFERENCIAS[tabla]?.[k]
    if (ref) datos[k] = v == null ? null : uidDe(ref, v) ?? null
    else if (v instanceof Blob) {
      blobs[k] = v
      datos[k] = { __archivo: firmaDe(v) }
    } else datos[k] = v
  }
  return { datos, blobs, json: estable(datos) }
}

async function cargarMapas() {
  const todos = await db.sincro.toArray()
  const porClave = new Map()
  const porUid = new Map()
  let est = {}
  const repetidos = []
  for (const m of todos) {
    if (m.clave === ESTADO) est = m
    else if (porUid.has(claveDe(m.tabla, m.uid))) repetidos.push(m.clave)
    else {
      porClave.set(m.clave, m)
      porUid.set(claveDe(m.tabla, m.uid), m)
    }
  }
  // Two local rows sharing one uid (left by an old bug): the second gets a new uid on upload.
  if (repetidos.length) await db.sincro.bulkDelete(repetidos)
  const uidDe = (tabla, id) => porClave.get(claveDe(tabla, id))?.uid
  const idLocal = (tabla, uid) => porUid.get(claveDe(tabla, uid))?.id
  const poner = (m) => {
    porClave.set(m.clave, m)
    porUid.set(claveDe(m.tabla, m.uid), m)
  }
  const quitar = (m) => {
    porClave.delete(m.clave)
    porUid.delete(claveDe(m.tabla, m.uid))
  }
  return { est, porClave, porUid, uidDe, idLocal, poner, quitar }
}

const guardarEstado = (cambios) => db.sincro.get(ESTADO).then((e) => db.sincro.put({ ...(e ?? {}), ...cambios, clave: ESTADO, tabla: '_', uid: ESTADO }))

/* ---------- upload ---------- */

async function subir(userId, mapas) {
  const locales = {}
  for (const tabla of TABLAS) locales[tabla] = await filasLocales(tabla)

  // Give every local row a uid first, so references between rows can be translated.
  const nuevos = []
  for (const tabla of TABLAS) {
    for (const fila of locales[tabla]) {
      const clave = claveDe(tabla, idDe(tabla, fila))
      if (mapas.porClave.has(clave)) continue
      const m = { clave, tabla, id: idDe(tabla, fila), uid: tabla === 'meta' ? fila.clave : crypto.randomUUID(), json: null, archivos: {} }
      mapas.poner(m)
      nuevos.push(m)
    }
  }
  if (nuevos.length) await db.sincro.bulkPut(nuevos)

  const presentes = new Set()
  const envio = []
  const viejos = []
  for (const tabla of TABLAS) {
    for (const fila of locales[tabla]) {
      const m = mapas.porClave.get(claveDe(tabla, idDe(tabla, fila)))
      presentes.add(m.clave)
      const { datos, blobs, json } = aRemoto(tabla, fila, mapas.uidDe)
      if (json === m.json) continue
      const archivos = {}
      for (const [campo, blob] of Object.entries(blobs)) {
        const antes = m.archivos?.[campo]
        if (antes?.firma === firmaDe(blob)) { archivos[campo] = antes; continue }
        const ruta = `${userId}/${m.uid}/${campo}-${Date.now()}`
        const { error } = await nube.storage.from(BUCKET).upload(ruta, blob, { contentType: blob.type || 'application/octet-stream', upsert: true })
        if (error) throw error
        archivos[campo] = { ruta, firma: firmaDe(blob) }
        if (antes) viejos.push(antes.ruta)
      }
      for (const [campo, a] of Object.entries(m.archivos ?? {})) if (!archivos[campo] && !viejos.includes(a.ruta)) viejos.push(a.ruta)
      envio.push({ m: { ...m, json, archivos }, fila: { user_id: userId, tabla, uid: m.uid, datos, archivos, borrado: false } })
    }
  }

  // Rows known to the cloud that no longer exist here were deleted on this device.
  const borrados = [...mapas.porClave.values()].filter((m) => !presentes.has(m.clave))
  for (const m of borrados) {
    for (const a of Object.values(m.archivos ?? {})) viejos.push(a.ruta)
    envio.push({ m, borrar: true, fila: { user_id: userId, tabla: m.tabla, uid: m.uid, datos: {}, archivos: {}, borrado: true } })
  }

  for (let i = 0; i < envio.length; i += 200) {
    const lote = envio.slice(i, i + 200)
    const { error } = await nube.from('registros').upsert(lote.map((e) => e.fila), { onConflict: 'user_id,tabla,uid' })
    if (error) throw error
    await db.transaction('rw', db.sincro, async () => {
      for (const e of lote) {
        if (e.borrar) { await db.sincro.delete(e.m.clave); mapas.quitar(e.m) } else { await db.sincro.put(e.m); mapas.poner(e.m) }
      }
    })
  }
  if (viejos.length) await nube.storage.from(BUCKET).remove(viejos) // best effort: leftovers only cost space
  return envio.length
}

/* ---------- download ---------- */

async function descargar(ruta, firma) {
  const { data, error } = await nube.storage.from(BUCKET).download(ruta)
  if (error) throw error
  const tipo = firma.slice(firma.indexOf(':') + 1)
  return tipo && data.type !== tipo ? new Blob([data], { type: tipo }) : data
}

async function traerDesde(cursor) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    let q = nube.from('registros').select('tabla, uid, datos, archivos, borrado, actualizado').order('actualizado').order('uid').range(desde, desde + 999)
    // Overlap a little: rows written at the same moment by another device may commit late.
    if (cursor) q = q.gt('actualizado', new Date(new Date(cursor).getTime() - 60000).toISOString())
    const { data, error } = await q
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}

async function bajar(mapas) {
  const filas = await traerDesde(mapas.est.cursor)
  if (!filas.length) return 0
  let aplicadas = 0
  const pendientesSiguiente = []
  for (const tabla of TABLAS) {
    for (const r of filas.filter((f) => f.tabla === tabla)) {
      const m = mapas.porUid.get(claveDe(tabla, r.uid))
      if (r.borrado) {
        if (m) {
          await db.transaction('rw', db[tabla], db.sincro, async () => {
            await db[tabla].delete(m.id)
            await db.sincro.delete(m.clave)
          })
          mapas.quitar(m)
          aplicadas++
        }
        continue
      }
      const json = estable(r.datos)
      if (m && m.json === json && estable(m.archivos ?? {}) === estable(r.archivos ?? {})) continue
      const actual = m ? await db[tabla].get(m.id) : null
      // A local edit not uploaded yet wins; it goes up on the next round.
      if (actual && m.json != null && aRemoto(tabla, actual, mapas.uidDe).json !== m.json) continue

      const fila = {}
      let huerfana = false
      for (const [k, v] of Object.entries(r.datos)) {
        const ref = REFERENCIAS[tabla]?.[k]
        if (ref && v != null) {
          const id = mapas.idLocal(ref, v)
          if (id == null && k === 'siguienteId') pendientesSiguiente.push(r.uid)
          else if (id == null) huerfana = true
          fila[k] = id ?? null
        } else if (v && typeof v === 'object' && v.__archivo) {
          const a = r.archivos?.[k]
          if (!a) fila[k] = null
          else if (actual && m.archivos?.[k]?.ruta === a.ruta && actual[k] instanceof Blob) fila[k] = actual[k]
          else fila[k] = await descargar(a.ruta, a.firma)
        } else fila[k] = v
      }
      if (huerfana) continue

      let id
      if (tabla === 'meta') {
        id = r.uid
        await db.meta.put({ ...fila, clave: id })
      } else if (actual) {
        id = m.id
        await db[tabla].put({ ...fila, id })
      } else id = await db[tabla].add(fila)
      const nuevo = { clave: claveDe(tabla, id), tabla, id, uid: r.uid, json, archivos: r.archivos ?? {} }
      if (m && m.clave !== nuevo.clave) { await db.sincro.delete(m.clave); mapas.quitar(m) }
      await db.sincro.put(nuevo)
      mapas.poner(nuevo)
      aplicadas++
    }
  }
  // A repeated task may point to a newer task that arrived after it.
  for (const uid of pendientesSiguiente) {
    const tareaId = mapas.idLocal('tareas', uid)
    const r = filas.find((f) => f.tabla === 'tareas' && f.uid === uid)
    const siguienteId = mapas.idLocal('tareas', r.datos.siguienteId)
    if (tareaId != null && siguienteId != null) await db.tareas.update(tareaId, { siguienteId })
  }
  await guardarEstado({ cursor: filas[filas.length - 1].actualizado })
  return aplicadas
}

/* ---------- first link of this device to an account ---------- */

async function enlazar(userId, mapas) {
  const { count, error } = await nube.from('registros').select('uid', { count: 'exact', head: true }).eq('borrado', false)
  if (error) throw error
  await db.sincro.clear()
  if (count > 0) {
    // The cloud already has this account's data: the sample tasks of this device are not wanted.
    await borrarEjemplos()
    if ((await db.tareas.count()) === 0) {
      // Fresh device: drop the sample data and take what is in the cloud.
      await db.transaction('rw', ['tareas', 'materiales', 'fotos', 'presupuestos', 'habitaciones'].map((t) => db[t]), async () => {
        for (const t of ['tareas', 'materiales', 'fotos', 'presupuestos', 'habitaciones']) await db[t].clear()
      })
      await db.meta.bulkDelete(META_SINCRONIZADA)
    } else {
      // Both sides have data: merge, reusing cloud rooms that have the same name.
      const { data, error: e } = await nube.from('registros').select('uid, datos, archivos').eq('tabla', 'habitaciones').eq('borrado', false)
      if (e) throw e
      const porNombre = new Map(data.map((r) => [String(r.datos.nombre ?? '').trim().toLowerCase(), r]))
      const enlaces = []
      for (const h of await db.habitaciones.toArray()) {
        const r = porNombre.get(String(h.nombre ?? '').trim().toLowerCase())
        if (!r) continue
        porNombre.delete(String(h.nombre ?? '').trim().toLowerCase())
        enlaces.push({ clave: claveDe('habitaciones', h.id), tabla: 'habitaciones', id: h.id, uid: r.uid, json: null, archivos: {} })
      }
      await db.sincro.bulkPut(enlaces)
    }
  }
  await guardarEstado({ userId, cursor: null })
  return cargarMapas()
}

/* ---------- orchestration ---------- */

// Two open windows of the app share the same local data: only one may sync at a time,
// or both would give the same rows different uids and upload them twice.
const conCandado = (f) => (navigator.locks ? navigator.locks.request('app-casa-sincro', f) : f())

let enCurso = null
let repetir = false

export function sincronizar() {
  if (!nube || !estado.sesion) return Promise.resolve()
  if (enCurso) { repetir = true; return enCurso }
  enCurso = (async () => {
    do {
      repetir = false
      if (!navigator.onLine) { fijar({ fase: 'sin-conexion' }); return }
      fijar({ fase: 'sincronizando', error: null })
      try {
        const userId = estado.sesion.user.id
        await conCandado(async () => {
          let mapas = await cargarMapas()
          if (mapas.est.userId !== userId) mapas = await enlazar(userId, mapas)
          await unirHabitacionesRepetidas()
          await subir(userId, mapas)
          if (await bajar(mapas)) await unirHabitacionesRepetidas()
        })
        fijar({ fase: 'al-dia', ultima: Date.now() })
      } catch (err) {
        console.error('Sincronización', err)
        fijar({ fase: navigator.onLine ? 'error' : 'sin-conexion', error: err?.message ?? String(err) })
        return
      }
    } while (repetir)
  })().finally(() => { enCurso = null })
  return enCurso
}

let espera = null
const pronto = (ms = 2000) => {
  clearTimeout(espera)
  espera = setTimeout(sincronizar, ms)
}

export async function iniciarNube() {
  if (!nube) return
  const { data } = await nube.auth.getSession()
  fijar({ sesion: data.session, fase: data.session ? 'al-dia' : 'sin-sesion' })
  nube.auth.onAuthStateChange((evento, sesion) => {
    fijar({ sesion, fase: sesion ? estado.fase : 'sin-sesion' })
    if (evento === 'SIGNED_IN') pronto(0)
  })
  if (data.session) pronto(0)

  // Any change to the app's own tables schedules an upload a moment later.
  Dexie.on('storagemutated', (partes) => {
    const tablas = Object.keys(partes).map((p) => p.split('/')[3])
    if (tablas.some((t) => TABLAS.includes(t))) pronto()
  })
  window.addEventListener('online', () => pronto(0))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pronto(0) })
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar() }, 60000)
}

export async function entrar(email) {
  const { error } = await nube.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
  })
  if (error) throw error
}

export async function salir() {
  await nube.auth.signOut()
}
