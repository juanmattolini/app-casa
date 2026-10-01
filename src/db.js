import Dexie from 'dexie'

export const db = new Dexie('app-casa')

db.version(1).stores({
  tareas: '++id, estado, habitacionId, prioridad, fechaLimite, creada',
  materiales: '++id, tareaId, comprado',
  fotos: '++id, tareaId',
  habitaciones: '++id, nombre',
  meta: 'clave',
})

db.version(2).stores({
  presupuestos: '++id, tareaId',
})

export const PRIORIDADES = [
  { valor: 'alta', etiqueta: 'Alta' },
  { valor: 'media', etiqueta: 'Media' },
  { valor: 'baja', etiqueta: 'Baja' },
]

const HABITACIONES_INICIALES = ['Cocina', 'Baño', 'Dormitorio', 'Salón', 'Jardín', 'Garaje', 'Toda la casa']

export function hoyISO(offsetDias = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return d.toLocaleDateString('sv-SE') // YYYY-MM-DD in local time
}

// First run: rooms plus a few example tasks (marked as ejemplo) so the app isn't empty.
export async function inicializar() {
  try { await navigator.storage?.persist?.() } catch { /* not critical */ }
  const hecho = await db.meta.get('inicializada')
  if (hecho) return
  await db.transaction('rw', db.tareas, db.materiales, db.habitaciones, db.meta, async () => {
    const ids = {}
    for (const nombre of HABITACIONES_INICIALES) ids[nombre] = await db.habitaciones.add({ nombre })
    const ejemplos = [
      {
        titulo: 'Cambiar filtro del aire acondicionado',
        notas: 'El modelo actual está escrito en el lateral del filtro.',
        habitacionId: ids['Salón'], prioridad: 'media', fechaLimite: hoyISO(-2),
        materiales: [{ nombre: 'Filtro 20x25', cantidad: 1, unidad: 'ud' }],
      },
      {
        titulo: 'Arreglar grifo que gotea',
        notas: 'Cerrar la llave de paso antes de desmontar.',
        habitacionId: ids['Cocina'], prioridad: 'alta', fechaLimite: hoyISO(0),
        materiales: [
          { nombre: 'Juego de juntas tóricas', cantidad: 1, unidad: 'ud' },
          { nombre: 'Cinta de teflón', cantidad: 1, unidad: 'rollo' },
        ],
      },
      {
        titulo: 'Pintar la valla',
        notas: 'Lijar antes las zonas con óxido.',
        habitacionId: ids['Jardín'], prioridad: 'baja', fechaLimite: hoyISO(9),
        materiales: [
          { nombre: 'Pintura esmalte verde', cantidad: 4, unidad: 'L' },
          { nombre: 'Lija grano 120', cantidad: 3, unidad: 'ud', comprado: true },
          { nombre: 'Brocha 50 mm', cantidad: 1, unidad: 'ud' },
        ],
      },
      {
        titulo: 'Sellar silicona de la ducha',
        notas: '',
        habitacionId: ids['Baño'], prioridad: 'media', fechaLimite: null,
        materiales: [{ nombre: 'Silicona sanitaria blanca', cantidad: 1, unidad: 'cartucho' }],
      },
    ]
    for (const { materiales, ...t } of ejemplos) {
      const tareaId = await db.tareas.add({ ...t, estado: 'pendiente', ejemplo: true, creada: Date.now(), completada: null })
      for (const m of materiales) await db.materiales.add({ comprado: false, nota: '', ...m, tareaId })
    }
    await db.meta.put({ clave: 'inicializada', valor: true })
  })
}

export async function guardarTarea(tarea, materiales, fotosNuevas, fotosBorradas) {
  return db.transaction('rw', db.tareas, db.materiales, db.fotos, async () => {
    const { id, ...datos } = tarea
    let tareaId = id
    if (tareaId) await db.tareas.update(tareaId, datos)
    else tareaId = await db.tareas.add({ ...datos, estado: 'pendiente', creada: Date.now(), completada: null })

    const existentes = await db.materiales.where('tareaId').equals(tareaId).primaryKeys()
    const conservados = new Set(materiales.filter((m) => m.id).map((m) => m.id))
    await db.materiales.bulkDelete(existentes.filter((k) => !conservados.has(k)))
    for (const m of materiales) {
      const fila = { tareaId, nombre: m.nombre, cantidad: m.cantidad, unidad: m.unidad, comprado: !!m.comprado, nota: m.nota ?? '' }
      if (m.id) await db.materiales.update(m.id, fila)
      else await db.materiales.add(fila)
    }
    await db.fotos.bulkDelete(fotosBorradas)
    for (const f of fotosNuevas) await db.fotos.add({ ...f, tareaId })
    return tareaId
  })
}

export async function borrarTarea(id) {
  await db.transaction('rw', db.tareas, db.materiales, db.fotos, db.presupuestos, async () => {
    await db.materiales.where('tareaId').equals(id).delete()
    await db.presupuestos.where('tareaId').equals(id).delete()
    await db.fotos.where('tareaId').equals(id).delete()
    await db.tareas.delete(id)
  })
}

export const REPETICIONES = [
  { clave: '1-semanas', etiqueta: 'Cada semana' },
  { clave: '2-semanas', etiqueta: 'Cada 2 semanas' },
  { clave: '1-meses', etiqueta: 'Cada mes' },
  { clave: '2-meses', etiqueta: 'Cada 2 meses' },
  { clave: '3-meses', etiqueta: 'Cada 3 meses' },
  { clave: '6-meses', etiqueta: 'Cada 6 meses' },
  { clave: '1-años', etiqueta: 'Cada año' },
]

export function sumarIntervalo(iso, repetir) {
  const [y, m, d] = iso.split('-').map(Number)
  const { cada, unidad } = repetir
  let fecha
  if (unidad === 'semanas') fecha = new Date(y, m - 1, d + 7 * cada)
  else {
    const meses = unidad === 'años' ? 12 * cada : cada
    // Clamp to the month's last day (31 Jan + 1 month = 28/29 Feb).
    const ultimo = new Date(y, m - 1 + meses + 1, 0).getDate()
    fecha = new Date(y, m - 1 + meses, Math.min(d, ultimo))
  }
  return fecha.toLocaleDateString('sv-SE')
}

const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const sumarDias = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + n).toLocaleDateString('sv-SE')
}

// Marking a repeating task done creates the next one (once), with the same materials unbought.
export async function alternarHecha(tarea) {
  const hecha = tarea.estado !== 'hecha'
  await db.transaction('rw', db.tareas, db.materiales, async () => {
    await db.tareas.update(tarea.id, { estado: hecha ? 'hecha' : 'pendiente', completada: hecha ? Date.now() : null })
    if (!hecha || !tarea.repetir || tarea.siguienteId) return
    const base = tarea.fechaLimite ?? hoyISO()
    const fechaLimite = sumarIntervalo(base, tarea.repetir)
    const recordatorio = tarea.recordatorio
      ? { ...tarea.recordatorio, fecha: sumarDias(tarea.recordatorio.fecha, diasEntre(base, fechaLimite)) }
      : null
    const { id, siguienteId, enCalendario, completada, ...resto } = tarea
    const nuevaId = await db.tareas.add({
      ...resto, fechaLimite, recordatorio, estado: 'pendiente', ejemplo: false, creada: Date.now(), completada: null,
    })
    const mats = await db.materiales.where('tareaId').equals(tarea.id).toArray()
    for (const { id: _, ...m } of mats) await db.materiales.add({ ...m, tareaId: nuevaId, comprado: false })
    await db.tareas.update(tarea.id, { siguienteId: nuevaId })
  })
}

export async function borrarEjemplos() {
  const ids = await db.tareas.filter((t) => !!t.ejemplo).primaryKeys()
  for (const id of ids) await borrarTarea(id)
}

// Only one quote per task can be the chosen one; picking it again unpicks it.
export async function elegirPresupuesto(p) {
  await db.transaction('rw', db.presupuestos, async () => {
    await db.presupuestos.where('tareaId').equals(p.tareaId).modify({ elegido: false })
    if (!p.elegido) await db.presupuestos.update(p.id, { elegido: true })
  })
}
