import { db } from './db.js'

// Backup = one JSON file with every table; photos and attachments go inside as data URLs.
const TABLAS = ['tareas', 'materiales', 'fotos', 'habitaciones', 'presupuestos', 'aparatos', 'contactos', 'meta']

const aDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})

async function serializar(fila) {
  const out = {}
  for (const [k, v] of Object.entries(fila)) out[k] = v instanceof Blob ? { __blob: await aDataUrl(v) } : v
  return out
}

async function deserializar(fila) {
  const out = {}
  for (const [k, v] of Object.entries(fila)) out[k] = v && typeof v === 'object' && v.__blob ? await (await fetch(v.__blob)).blob() : v
  return out
}

export async function exportar() {
  const tablas = {}
  for (const t of TABLAS) tablas[t] = await Promise.all((await db[t].toArray()).map(serializar))
  const datos = { app: 'app-casa', version: 1, fecha: new Date().toISOString(), tablas }
  const nombre = `casa-copia-${new Date().toLocaleDateString('sv-SE')}.json`
  const archivo = new File([JSON.stringify(datos)], nombre, { type: 'application/json' })
  if (navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(archivo)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export async function leerCopia(archivo) {
  let datos
  try { datos = JSON.parse(await archivo.text()) } catch { throw new Error('El archivo no es una copia de Casa.') }
  if (datos?.app !== 'app-casa' || !datos.tablas) throw new Error('El archivo no es una copia de Casa.')
  return datos
}

export async function restaurar(datos) {
  const filas = {}
  for (const t of TABLAS) filas[t] = await Promise.all((datos.tablas[t] ?? []).map(deserializar))
  await db.transaction('rw', TABLAS.map((t) => db[t]), async () => {
    for (const t of TABLAS) {
      await db[t].clear()
      await db[t].bulkAdd(filas[t])
    }
  })
}
