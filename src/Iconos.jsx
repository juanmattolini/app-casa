// Drawings for categories: rooms, trades, appliances and shop types.
// The category is guessed from its name (free text), so "Baño de arriba" or "Plomero Juan" still match.
// Each drawing has a tone; the colors live in estilos.css (.cat-azul, .cat-ambar...).

import { Fragment, createElement } from 'react'

const d = (...trazos) => createElement(Fragment, null, ...trazos)
const DIBUJOS = {
  olla: d(<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />, <path d="M2 10h2M20 10h2M9 6.5c0-1 1-1.2 1-2.5M14 6.5c0-1 1-1.2 1-2.5" />),
  banera: d(<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" />, <path d="M6 12V6.5a2.5 2.5 0 0 1 5 0M7 19l-1 2M17 19l1 2" />),
  cama: d(<path d="M3 6v13M3 15h18v4M21 15v-2.5A3.5 3.5 0 0 0 17.5 9H11v6" />, <circle cx="7" cy="11.5" r="1.8" />),
  sofa: d(<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />, <path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4H3zM5 17v2M19 17v2" />),
  planta: d(<path d="M12 20v-8M8 20h8" />, <path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 14.5c0-3-2.2-5.5-6-5.5 0 3 2.2 5.5 6 5.5z" />),
  auto: d(<path d="M3 13.5 5 8h14l2 5.5V17H3zM3 13.5h18" />, <circle cx="7.5" cy="17" r="1.6" />, <circle cx="16.5" cy="17" r="1.6" />),
  lavarropas: d(<rect x="5" y="3" width="14" height="18" rx="2" />, <path d="M5 7.5h14M8 5.2h.01" />, <circle cx="12" cy="14" r="3.8" />),
  monitor: d(<rect x="3" y="4" width="18" height="12" rx="2" />, <path d="M8 20h8M12 16v4" />),
  casa: d(<path d="M3.5 11 12 4l8.5 7" />, <path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5" />),
  gota: d(<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />, <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />),
  rayo: d(<path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12z" />),
  llama: d(<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4.5 3-6.5 1 2 2 2.5 3 2.5 0-3-1-5 0-7z" />),
  rodillo: d(<rect x="4" y="3.5" width="13" height="5.5" rx="1.5" />, <path d="M17 6.2h3v5h-8v3" />, <rect x="10.5" y="14.2" width="3" height="6.8" rx="1" />),
  ladrillos: d(<rect x="3" y="5" width="18" height="14" rx="1.5" />, <path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M12 9.7v4.6M7 14.3V19M17 14.3V19" />),
  martillo: d(<path d="m13.5 9.5-8.8 8.8a1.6 1.6 0 0 0 2.3 2.3l8.8-8.8" />, <path d="m10.5 6.5 3-3h3l4.5 4.5-2.5 2.5-2-1-2 2z" />),
  llave: d(<circle cx="8" cy="15.5" r="4" />, <path d="m11 12.5 8.5-8.5M16.5 7l2 2M14.3 9.2l2 2" />),
  copo: d(<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />, <path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" />),
  enchufe: d(<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />),
  heladera: d(<rect x="6" y="2.5" width="12" height="19" rx="2" />, <path d="M6 10h12M9 6v2M9 13v3" />),
  tele: d(<rect x="3" y="6" width="18" height="12" rx="2" />, <path d="m9 2.5 3 3.5 3-3.5M8 21h8" />),
  herramienta: d(<path d="M15 4a4.5 4.5 0 0 0-4.3 5.8L4 16.5 7.5 20l6.7-6.7A4.5 4.5 0 0 0 20 9l-3 1-3-3z" />),
  etiqueta: d(<path d="M3.5 12V4.5H11l9.5 9.5-7.5 7.5z" />, <circle cx="7.8" cy="8.8" r="1.4" />),
}

// Order matters: the first rule whose word appears in the name wins.
const REGLAS = [
  [/toda la casa|general/, 'casa', 'pino'],
  [/aire|climati|refrig|split/, 'copo', 'azul'],
  [/electrodom|t[eé]cnico/, 'enchufe', 'violeta'],
  [/cocina|horno|anafe|microondas/, 'olla', 'ambar'],
  [/ba[ñn]o|ducha|toilette|sanitari/, 'banera', 'azul'],
  [/dormitorio|habitaci[oó]n|cuarto|pieza|cama/, 'cama', 'violeta'],
  [/sal[oó]n|living|comedor|estar|sala/, 'sofa', 'pino'],
  [/jard[ií]n|patio|terraza|balc[oó]n|parque|quincho|pileta|piscina/, 'planta', 'verde'],
  [/garaje|garage|cochera|auto/, 'auto', 'gris'],
  [/lavadero|lavander[ií]a|lavarropa|lavadora|secarropa/, 'lavarropas', 'azul'],
  [/oficina|estudio|escritorio|computa/, 'monitor', 'gris'],
  [/plomer|agua|ca[ñn]er/, 'gota', 'azul'],
  [/electric|luz|ilumina/, 'rayo', 'ambar'],
  [/gas|calef[oó]n|termotanque|caldera|estufa|calefac/, 'llama', 'coral'],
  [/pint/, 'rodillo', 'coral'],
  [/alba[ñn]il|corral[oó]n|construc|cemento|ladrill|bricolaje/, 'ladrillos', 'ambar'],
  [/carpinter|madera|mueble/, 'martillo', 'ambar'],
  [/cerraj|llave|puerta/, 'llave', 'gris'],
  [/heladera|nevera|freezer|frigor/, 'heladera', 'azul'],
  [/\btv\b|tele|smart/, 'tele', 'violeta'],
  [/ferreter|herramient|mantenimiento/, 'herramienta', 'gris'],
  [/casa|hogar/, 'casa', 'pino'],
]

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function categoriaDe(texto) {
  const t = String(texto ?? '').toLowerCase()
  const plano = sinTildes(texto)
  for (const [re, dibujo, tono] of REGLAS) if (re.test(t) || re.test(plano)) return { dibujo, tono }
  return { dibujo: 'etiqueta', tono: 'gris' }
}

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

// chico: just the drawing, for chips and labels. Otherwise a tinted rounded badge.
export function IconoCategoria({ texto, chico = false, className = '' }) {
  const { dibujo, tono } = categoriaDe(texto)
  const tam = chico ? 15 : 22
  return (
    <span className={`cat cat-${tono} ${chico ? 'cat-chico' : ''} ${className}`} aria-hidden="true">
      <svg {...svg} width={tam} height={tam}>{DIBUJOS[dibujo]}</svg>
    </span>
  )
}
