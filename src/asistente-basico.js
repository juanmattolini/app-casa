import { db, hoyISO } from './db.js'
import { PLANTILLAS } from './plantillas.js'
import { cantidadTexto } from './util.js'

// Asistente básico: respuestas armadas en la app, sin IA, sin servidor y sin costo. Reconoce palabras de la
// pregunta y responde con una guía corta y la lista de materiales de plantillas.js; también ordena las tareas
// pendientes y junta lo que falta comprar.

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const tiene = (texto, palabras) => palabras.some((p) => texto.includes(normal(p)))

// Temas puntuales: título de la tarea, pasos y qué materiales de la plantilla usar (todos si no se dice).
// Van antes que las guías generales, así "canilla que gotea" no queda como "Plomería" a secas.
const TEMAS = [
  {
    claves: ['canilla', 'grifo'], plantilla: 'plomeria', titulo: 'Arreglar la canilla que gotea', habitacion: 'Cocina',
    pasos: ['Cerrá la llave de paso.', 'Desarmá la canilla con la llave francesa y sacá el cuerito.', 'Poné uno nuevo de la misma medida y rearmá con cinta teflón en la rosca.'],
    usar: ['Cinta teflón', 'Juego de cueritos para canilla', 'Llave francesa'],
  },
  {
    claves: ['inodoro', 'mochila', 'deposito'], plantilla: 'plomeria', titulo: 'Arreglar la mochila del inodoro', habitacion: 'Baño',
    pasos: ['Cerrá la llave de paso del inodoro.', 'Fijate si pierde por la válvula de descarga o por el flotante.', 'Si el flexible está viejo o gotea, cambialo y sellá las roscas con teflón.'],
    usar: ['Flexible para canilla', 'Cinta teflón', 'Llave francesa'],
  },
  {
    claves: ['tapad', 'destap', 'desagu', 'pileta'], plantilla: 'plomeria', titulo: 'Destapar el desagüe',
    pasos: ['Sacá el agua acumulada.', 'Usá la sopapa con movimientos firmes, tapando el rebalse.', 'Si sigue tapado, desarmá el sifón con un balde abajo y limpialo.'],
    usar: ['Sopapa destapadora'],
  },
  {
    claves: ['enchufe', 'toma'], plantilla: 'electricidad', titulo: 'Cambiar el tomacorriente',
    pasos: ['Cortá la luz desde el tablero, no alcanza con la tecla.', 'Confirmá con el buscapolo que no hay corriente.', 'Pasá los cables al toma nuevo en el mismo orden y ajustá bien los tornillos.'],
    usar: ['Tomacorriente', 'Buscapolo', 'Cinta aisladora'],
  },
  {
    claves: ['lampara', 'foco', 'lamparita'], plantilla: 'electricidad', titulo: 'Cambiar las lámparas',
    pasos: ['Apagá la tecla y esperá que la lámpara se enfríe.', 'Cambiala por una LED de la misma rosca.'],
    usar: ['Lámpara LED'],
  },
  {
    claves: ['cuadro'], plantilla: 'colgar', titulo: 'Colgar el cuadro',
    pasos: ['Marcá la altura con el nivel.', 'Agujereá con mecha de 8 mm y poné el tarugo.', 'Atornillá dejando el tornillo un poco afuera, o usá ganchos si es liviano.'],
  },
  {
    claves: ['estante', 'repisa'], plantilla: 'colgar', titulo: 'Colocar el estante',
    pasos: ['Marcá los soportes con el nivel.', 'Agujereá con mecha de 8 mm, poné tarugos y atornillá los soportes.', 'Apoyá el estante y fijalo a los soportes.'],
    usar: ['Tarugos 8 mm', 'Tornillos para tarugo 8 mm', 'Mecha para pared 8 mm', 'Nivel de burbuja'],
  },
  {
    claves: ['silicona', 'banera', 'bañera', 'ducha', 'mampara'], plantilla: 'sellar', titulo: 'Renovar la silicona del baño', habitacion: 'Baño',
    pasos: ['Sacá la silicona vieja con la espátula.', 'Limpiá con alcohol isopropílico y dejá secar bien.', 'Aplicá silicona antihongos en un cordón parejo y alisalo con el dedo mojado.', 'No mojes la junta por 24 h.'],
    usar: ['Silicona antihongos', 'Pistola para silicona', 'Espátula', 'Alcohol isopropílico'],
  },
  {
    claves: ['pastina', 'azulejo', 'junta'], plantilla: 'sellar', titulo: 'Renovar la pastina',
    pasos: ['Rascá la pastina vieja con la espátula.', 'Limpiá el polvo y humedecé apenas las juntas.', 'Rellená con pastina nueva, pasá esponja húmeda y dejá secar.'],
    usar: ['Pastina', 'Espátula'],
  },
  {
    claves: ['gotera', 'membrana', 'terraza'], plantilla: 'humedad', titulo: 'Impermeabilizar el techo',
    pasos: ['Limpiá el techo con cepillo de alambre y sacá lo suelto.', 'Pasá una mano de fijador sellador.', 'Aplicá membrana líquida en 2 o 3 manos cruzadas, dejando secar entre manos.'],
    usar: ['Membrana líquida', 'Fijador sellador', 'Cepillo de alambre'],
  },
  {
    claves: ['moho', 'hongo'], plantilla: 'humedad', titulo: 'Sacar el moho de la pared',
    pasos: ['Limpiá la mancha con lavandina diluida y dejá secar.', 'Pasá fijador sellador.', 'Pintá con pintura antihongos y ventilá el ambiente.'],
    usar: ['Fijador sellador', 'Pintura antihongos', 'Espátula'],
  },
  {
    claves: ['pasto', 'cesped'], plantilla: 'jardin', titulo: 'Resembrar el césped', habitacion: 'Jardín',
    pasos: ['Cortá el pasto y aflojá la tierra de las zonas peladas.', 'Agregá tierra fértil y esparcí semillas.', 'Regá suave todos los días hasta que crezca.'],
    usar: ['Tierra fértil', 'Semillas de césped', 'Fertilizante para plantas', 'Manguera'],
  },
]

// Guía general por plantilla, para cuando la pregunta solo nombra el tipo de trabajo.
const GUIAS = {
  pintar: { titulo: 'Pintar', pasos: ['Cubrí el piso y los muebles con nylon y encintá los bordes.', 'Repará grietas con enduido y lijá.', 'Pasá 2 manos de látex: primero los bordes con pincel, después el rodillo.'] },
  plomeria: { titulo: 'Arreglo de plomería', pasos: ['Cerrá siempre la llave de paso antes de desarmar.', 'Sellá las roscas con cinta teflón (en el sentido de la rosca).'] },
  electricidad: { titulo: 'Arreglo eléctrico', pasos: ['Cortá la luz desde el tablero y verificá con el buscapolo.', 'Si hay olor a quemado, chispas o hay que tocar el tablero, llamá a un electricista matriculado.'] },
  jardin: { titulo: 'Mantenimiento del jardín', habitacion: 'Jardín', pasos: ['Podá con tijera limpia.', 'Fertilizá en primavera y regá temprano o a la tarde.'] },
  limpieza: { titulo: 'Limpieza a fondo', pasos: ['Empezá de arriba hacia abajo.', 'No mezcles lavandina con otros productos.'] },
  colgar: { titulo: 'Colgar y agujerear', pasos: ['Antes de agujerear, fijate que no pasen caños ni cables (en línea recta desde enchufes y canillas).', 'Usá tarugo y mecha de la misma medida.'] },
  sellar: { titulo: 'Sellar baño y cocina', pasos: ['Sacá lo viejo, limpiá con alcohol y dejá secar antes de sellar.'] },
  humedad: { titulo: 'Tratar la humedad', pasos: ['Primero buscá de dónde viene el agua: sin cortar la causa, la humedad vuelve.', 'Después secá, sellá y pintá con antihongos.'] },
}

const SEGURIDAD = {
  electricidad: 'Ojo: si no estás seguro, llamá a un electricista matriculado.',
}
const GAS = ['gas', 'calefon', 'calefactor', 'termotanque', 'estufa', 'hornalla']

const TEMAS_DE_EJEMPLO = 'Probá con algo como "canilla que gotea", "pintar el dormitorio", "colgar un cuadro", "humedad en la pared", "¿qué hago primero?" o "¿qué tengo que comprar?".'

function propuesta({ titulo, habitacion, pasos, plantilla, usar }) {
  const p = PLANTILLAS.find((x) => x.id === plantilla)
  const materiales = p.materiales
    .filter(([nombre]) => !usar || usar.includes(nombre))
    .map(([nombre, cantidad, unidad]) => ({ nombre, cantidad, unidad }))
  return { titulo, habitacion: habitacion ?? '', prioridad: 'media', notas: pasos.join('\n'), materiales }
}

const lista = (pasos) => pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')

// ¿Qué hago primero? Vencidas, después prioridad alta, después las que vencen antes.
async function primero() {
  const tareas = (await db.tareas.toArray()).filter((t) => t.estado !== 'hecha')
  if (tareas.length === 0) return { texto: 'No tenés tareas pendientes. ¡Bien ahí!', propuestas: [] }
  const hoy = hoyISO()
  const peso = { alta: 0, media: 1, baja: 2 }
  const orden = [...tareas].sort((a, b) =>
    (a.fechaLimite && a.fechaLimite < hoy ? 0 : 1) - (b.fechaLimite && b.fechaLimite < hoy ? 0 : 1)
    || (peso[a.prioridad] ?? 1) - (peso[b.prioridad] ?? 1)
    || (a.fechaLimite ?? '9999').localeCompare(b.fechaLimite ?? '9999'))
  const motivo = (t) => (t.fechaLimite && t.fechaLimite < hoy ? 'está vencida' : t.prioridad === 'alta' ? 'es prioridad alta' : t.fechaLimite ? `vence el ${t.fechaLimite.split('-').reverse().slice(0, 2).join('/')}` : 'está pendiente')
  const top = orden.slice(0, 3).map((t, i) => `${i + 1}. ${t.titulo} (${motivo(t)})`)
  return { texto: `Yo empezaría por:\n${top.join('\n')}${tareas.length > 3 ? `\n\nTenés ${tareas.length} tareas pendientes en total.` : ''}`, propuestas: [] }
}

// ¿Qué tengo que comprar? Los materiales sin comprar de las tareas pendientes.
async function compras() {
  const pendientes = new Map((await db.tareas.toArray()).filter((t) => t.estado !== 'hecha').map((t) => [t.id, t]))
  const mats = (await db.materiales.toArray()).filter((m) => !m.comprado && pendientes.has(m.tareaId))
  if (mats.length === 0) return { texto: 'No te falta comprar nada para tus tareas pendientes.', propuestas: [] }
  const filas = mats.slice(0, 15).map((m) => `• ${m.nombre}${cantidadTexto(m) ? ` (${cantidadTexto(m)})` : ''}`)
  return { texto: `Te falta comprar:\n${filas.join('\n')}${mats.length > 15 ? `\n…y ${mats.length - 15} más.` : ''}\n\nEn la pestaña Compras tenés la lista completa con "Ver precios".`, propuestas: [] }
}

export async function responderBasico(pregunta) {
  const q = normal(pregunta)
  await new Promise((r) => setTimeout(r, 400))

  if (tiene(q, GAS)) {
    return { texto: 'Con el gas no conviene arreglar nada por tu cuenta: llamá a un gasista matriculado. Si sentís olor a gas, cerrá la llave general, ventilá y no prendas luces ni fuego.', propuestas: [] }
  }
  const tema = TEMAS.find((t) => tiene(q, t.claves))
  const p = tema ? null : PLANTILLAS.find((x) => tiene(q, x.claves))
  if (tema || p) {
    const g = tema ?? { ...GUIAS[p.id], plantilla: p.id }
    const aviso = SEGURIDAD[g.plantilla] ? `\n\n${SEGURIDAD[g.plantilla]}` : ''
    // Si ya hay una tarea pendiente sobre el mismo tema puntual, se nombra en vez de proponer otra.
    const pendientes = (await db.tareas.toArray()).filter((t) => t.estado !== 'hecha')
    const existente = tema && pendientes.find((t) => tiene(normal(t.titulo), tema.claves))
    if (existente) return { texto: `${lista(g.pasos)}${aviso}\n\nYa tenés la tarea "${existente.titulo}"; sumale ahí lo que te falte.`, propuestas: [] }
    // La habitación, si la pregunta nombra una de las del usuario ("humedad en el dormitorio").
    const hab = (await db.habitaciones.toArray()).find((h) => normal(h.nombre).trim() && q.includes(normal(h.nombre).trim()))
    const cierre = tema ? 'Te dejo la tarea armada con los materiales.' : `Te dejo una tarea con la lista de ${p.nombre.toLowerCase()}; sacá lo que no uses.`
    return { texto: `${lista(g.pasos)}${aviso}\n\n${cierre}`, propuestas: [propuesta({ ...g, habitacion: hab?.nombre ?? g.habitacion })] }
  }
  // Sin un tema de arreglo: preguntas sobre las propias tareas.
  if (tiene(q, ['primero', 'prioridad', 'urgente', 'que hago', 'empiezo', 'empezar'])) return primero()
  if (tiene(q, ['comprar', 'compras', 'me falta'])) return compras()
  return { texto: `En modo básico entiendo pocos temas. ${TEMAS_DE_EJEMPLO}`, propuestas: [] }
}
