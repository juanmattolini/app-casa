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
