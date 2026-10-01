import Dexie from 'dexie'

export const db = new Dexie('app-casa')

db.version(1).stores({
  tareas: '++id, estado, habitacionId, prioridad, fechaLimite, creada',
  materiales: '++id, tareaId, comprado',
  fotos: '++id, tareaId',
  habitaciones: '++id, nombre',
  meta: 'clave',
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
  await db.transaction('rw', db.tareas, db.materiales, db.fotos, async () => {
    await db.materiales.where('tareaId').equals(id).delete()
    await db.fotos.where('tareaId').equals(id).delete()
    await db.tareas.delete(id)
  })
}

export async function alternarHecha(tarea) {
  const hecha = tarea.estado !== 'hecha'
  await db.tareas.update(tarea.id, { estado: hecha ? 'hecha' : 'pendiente', completada: hecha ? Date.now() : null })
}

export async function borrarEjemplos() {
  const ids = await db.tareas.filter((t) => !!t.ejemplo).primaryKeys()
  for (const id of ids) await borrarTarea(id)
}
