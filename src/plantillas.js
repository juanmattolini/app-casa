// Listas de materiales listas para usar por tipo de trabajo. Al elegir una en el formulario se añaden sus
// materiales a la tarea (sin repetir los que ya estén) y luego se pueden quitar o cambiar uno por uno.
// Los nombres son los que se buscan en Mercado Libre con "Ver precios", así que van como se venden.
// Unidades: las de UNIDADES en App.jsx.
// `claves`: palabras del título de la tarea que hacen que la lista aparezca primera como sugerida.

export const PLANTILLAS = [
  {
    id: 'pintar', icono: '🎨', nombre: 'Pintar', claves: ['pint', 'pared', 'techo', 'latex', 'esmalte'],
    materiales: [
      ['Pintura látex interior', 4, 'L'],
      ['Rodillo de pintura', 1, 'ud'],
      ['Pincel', 1, 'ud'],
      ['Bandeja para pintura', 1, 'ud'],
      ['Cinta de papel para pintor', 1, 'rollo'],
      ['Enduido plástico', 1, 'kg'],
      ['Lija al agua', 4, 'ud'],
      ['Nylon cobertor', 1, 'rollo'],
    ],
  },
  {
    id: 'plomeria', icono: '🚰', nombre: 'Plomería', claves: ['canilla', 'grifo', 'caño', 'cano', 'perdida', 'gotea', 'inodoro', 'mochila', 'agua', 'desagu', 'plomer'],
    materiales: [
      ['Cinta teflón', 1, 'rollo'],
      ['Flexible para canilla', 1, 'ud'],
      ['Juego de cueritos para canilla', 1, 'ud'],
      ['Sellador para roscas', 1, 'ud'],
      ['Llave francesa', 1, 'ud'],
      ['Sopapa destapadora', 1, 'ud'],
    ],
  },
  {
    id: 'electricidad', icono: '💡', nombre: 'Electricidad', claves: ['luz', 'enchufe', 'toma', 'lampara', 'cable', 'electric', 'tecla', 'foco'],
    materiales: [
      ['Lámpara LED', 2, 'ud'],
      ['Cinta aisladora', 1, 'rollo'],
      ['Cable unipolar 2,5 mm', 10, 'm'],
      ['Tomacorriente', 1, 'ud'],
      ['Tecla de luz', 1, 'ud'],
      ['Buscapolo', 1, 'ud'],
    ],
  },
  {
    id: 'jardin', icono: '🌱', nombre: 'Jardín', claves: ['jardin', 'pasto', 'cesped', 'planta', 'maceta', 'poda', 'huerta', 'patio'],
    materiales: [
      ['Tierra fértil', 2, 'bolsa'],
      ['Fertilizante para plantas', 1, 'kg'],
      ['Semillas de césped', 1, 'kg'],
      ['Guantes de jardinería', 1, 'ud'],
      ['Tijera de podar', 1, 'ud'],
      ['Manguera', 15, 'm'],
    ],
  },
  {
    id: 'limpieza', icono: '🧽', nombre: 'Limpieza', claves: ['limpi', 'lavar', 'ordenar', 'mugre'],
    materiales: [
      ['Lavandina', 2, 'L'],
      ['Detergente', 1, 'L'],
      ['Desengrasante', 1, 'ud'],
      ['Trapo de piso', 2, 'ud'],
      ['Esponjas', 1, 'caja'],
      ['Guantes de látex', 1, 'caja'],
      ['Bolsas de residuo', 1, 'caja'],
    ],
  },
  {
    id: 'colgar', icono: '🔩', nombre: 'Colgar y agujerear', claves: ['colgar', 'cuadro', 'estante', 'repisa', 'agujer', 'cortina', 'barral', 'tv'],
    materiales: [
      ['Tarugos 8 mm', 1, 'caja'],
      ['Tornillos para tarugo 8 mm', 1, 'caja'],
      ['Mecha para pared 8 mm', 1, 'ud'],
      ['Nivel de burbuja', 1, 'ud'],
      ['Ganchos para cuadros', 1, 'caja'],
    ],
  },
  {
    id: 'sellar', icono: '🛁', nombre: 'Baño y cocina', claves: ['silicona', 'junta', 'pastina', 'azulejo', 'bano', 'baño', 'cocina', 'bacha', 'ducha', 'banera'],
    materiales: [
      ['Silicona antihongos', 1, 'cartucho'],
      ['Pistola para silicona', 1, 'ud'],
      ['Pastina', 1, 'kg'],
      ['Espátula', 1, 'ud'],
      ['Alcohol isopropílico', 1, 'L'],
    ],
  },
  {
    id: 'humedad', icono: '💧', nombre: 'Humedad y techo', claves: ['humedad', 'filtra', 'gotera', 'membrana', 'hongo', 'moho', 'impermeab'],
    materiales: [
      ['Membrana líquida', 4, 'kg'],
      ['Fijador sellador', 1, 'L'],
      ['Pintura antihongos', 1, 'L'],
      ['Cepillo de alambre', 1, 'ud'],
      ['Espátula', 1, 'ud'],
    ],
  },
]

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Las plantillas que encajan con el título van primero (marcadas como sugeridas); el resto, en su orden.
export function ordenarPlantillas(titulo) {
  const t = normal(titulo)
  const sugerida = (p) => !!t && p.claves.some((c) => t.includes(normal(c)))
  const con = PLANTILLAS.map((p) => ({ ...p, sugerida: sugerida(p) }))
  return [...con.filter((p) => p.sugerida), ...con.filter((p) => !p.sugerida)]
}

// Materiales de la plantilla que todavía no están en la tarea (comparando el nombre sin tildes ni mayúsculas).
export function materialesDePlantilla(plantilla, actuales) {
  const ya = new Set(actuales.map((m) => normal(m.nombre)))
  return plantilla.materiales
    .filter(([nombre]) => !ya.has(normal(nombre)))
    .map(([nombre, cantidad, unidad]) => ({ nombre, cantidad, unidad, comprado: false }))
}
