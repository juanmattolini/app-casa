import { useEffect, useState } from 'react'
import { hoyISO } from './db.js'

export function useBlobUrl(blob) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

const fmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' })

export function fechaCorta(iso) {
  if (!iso) return ''
  const hoy = hoyISO()
  if (iso === hoy) return 'Hoy'
  if (iso === hoyISO(1)) return 'Mañana'
  if (iso === hoyISO(-1)) return 'Ayer'
  const [y, m, d] = iso.split('-').map(Number)
  return fmt.format(new Date(y, m - 1, d)).replace('.', '')
}

export function grupoDe(tarea) {
  if (tarea.estado === 'hecha') return 'hechas'
  if (!tarea.fechaLimite) return 'sinFecha'
  const hoy = hoyISO()
  if (tarea.fechaLimite < hoy) return 'vencidas'
  if (tarea.fechaLimite === hoy) return 'hoy'
  return 'proximas'
}

export function diasDeRetraso(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const ms = new Date(new Date().toDateString()) - new Date(y, m - 1, d)
  return Math.round(ms / 86400000)
}

export function cantidadTexto(m) {
  if (m.cantidad == null || m.cantidad === '') return ''
  return `${String(m.cantidad).replace('.', ',')} ${m.unidad ?? ''}`.trim()
}

const fmtHora = (hora) => (hora || '09:00').replace(/^0/, '')

export function recordatorioTexto(r) {
  if (!r?.fecha) return ''
  return `${fechaCorta(r.fecha)}, ${fmtHora(r.hora)}`
}

const fmtEntero = new Intl.NumberFormat('es', { maximumFractionDigits: 0, useGrouping: 'always' })
const fmtDecimal = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })

export function dinero(n, moneda = '$') {
  if (n == null || Number.isNaN(n)) return ''
  const r = Math.round(n * 100) / 100
  return `${moneda} ${(r % 1 ? fmtDecimal : fmtEntero).format(r)}`.trim()
}

export function aNumero(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s/g, '')
  if (!limpio) return null
  // "1.250,50" or "1250.5" or "1,250.50": the last separator is the decimal one if followed by 1-2 digits.
  const m = limpio.match(/^(.*?)([.,](\d{1,2}))?$/)
  const entero = m[1].replace(/[.,]/g, '')
  const n = Number(m[2] ? `${entero}.${m[3]}` : entero)
  return Number.isFinite(n) ? n : null
}
