// Reminders live in the phone's calendar: no server, so the app hands the event over
// either as a Google Calendar link (opens the Calendar app on Android) or as an .ics file.
const DURACION_MIN = 30
const URL_APP = 'https://juanmattolini.github.io/app-casa/'

function partes(recordatorio) {
  const [y, m, d] = recordatorio.fecha.split('-').map(Number)
  const [hh, mm] = (recordatorio.hora || '09:00').split(':').map(Number)
  const inicio = new Date(y, m - 1, d, hh, mm)
  const fin = new Date(inicio.getTime() + DURACION_MIN * 60000)
  return { inicio, fin }
}

const dos = (n) => String(n).padStart(2, '0')
// Floating local time (no Z): the calendar uses the phone's time zone.
const sello = (d) => `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}T${dos(d.getHours())}${dos(d.getMinutes())}00`

function descripcion(tarea, materiales) {
  const lineas = []
  if (tarea.notas) lineas.push(tarea.notas)
  const faltan = materiales.filter((m) => !m.comprado)
  if (faltan.length) lineas.push('', 'Materiales por comprar:', ...faltan.map((m) => `- ${m.nombre}`))
  lineas.push('', `Abrir Casa: ${URL_APP}`)
  return lineas.join('\n').trim()
}

export function enlaceGoogle(tarea, materiales) {
  const { inicio, fin } = partes(tarea.recordatorio)
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: tarea.titulo,
    dates: `${sello(inicio)}/${sello(fin)}`,
    details: descripcion(tarea, materiales),
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

const escapar = (t) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function archivoIcs(tarea, materiales) {
  const { inicio, fin } = partes(tarea.recordatorio)
  const texto = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//app-casa//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:casa-${tarea.id}-${sello(inicio)}@app-casa`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${sello(inicio)}`, `DTEND:${sello(fin)}`,
    `SUMMARY:${escapar(tarea.titulo)}`,
    `DESCRIPTION:${escapar(descripcion(tarea, materiales))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(tarea.titulo)}`, 'TRIGGER:-PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const nombre = `${tarea.titulo.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tarea'}.ics`
  return new File([texto], nombre, { type: 'text/calendar' })
}

// Share sheet first (lets the user pick the calendar app); plain download otherwise.
export async function abrirIcs(archivo) {
  if (navigator.canShare?.({ files: [archivo] })) {
    try { return await navigator.share({ files: [archivo], title: archivo.name }) } catch (e) { if (e.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(archivo)
  const a = Object.assign(document.createElement('a'), { href: url, download: archivo.name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
