// Edge Function "asistente": chat sobre la casa con Claude. Responde dudas (cómo arreglar algo, qué comprar)
// mirando las tareas y materiales del usuario, y puede proponer una tarea nueva con su lista de materiales.
// La propuesta no se guarda acá: vuelve a la app, que la muestra y el usuario decide si la crea.
//
// POST { mensajes: [{ role: 'user'|'assistant', content: '...' }], contexto: { tareas, habitaciones, aparatos, foco? } }
//   →  { texto, propuestas: [{ titulo, habitacion, prioridad, notas, materiales: [{ nombre, cantidad, unidad }] }], restantes }
//
// Secrets de Supabase (nunca en la app):
//   ANTHROPIC_API_KEY        clave de la API de Claude (console.anthropic.com). Sin ella responde 503.
//   ASISTENTE_LIMITE_DIARIO  consultas por usuario y por día (30 por defecto)
//   ASISTENTE_MODELO         modelo de Claude (claude-opus-5-5 por defecto)
// Requiere sesión: se despliega con verificación de JWT (lo normal) y la app la llama con el token del usuario.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODELO = Deno.env.get('ASISTENTE_MODELO')?.trim() || 'claude-opus-5-5'
const LIMITE = Math.max(1, Number(Deno.env.get('ASISTENTE_LIMITE_DIARIO')) || 30)
const MAX_MENSAJES = 12
const MAX_TEXTO = 2000
const MAX_CONTEXTO = 12000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Fijo para que quede en la caché de prompts; lo que cambia (la casa del usuario) va después.
const SISTEMA = `Sos el asistente de "App Casa", una app para anotar las tareas de mantenimiento de la casa con sus materiales.
Respondé en español rioplatense, claro y breve, como un amigo que sabe de arreglos: pasos concretos, herramientas y materiales con medidas cuando importan.
Usá lo que sabés de la casa del usuario (tareas, materiales, habitaciones, aparatos) cuando ayude a la respuesta.
Seguridad primero: si algo implica gas, electricidad de la instalación, estructura o altura peligrosa, decilo y recomendá un profesional matriculado.
Si el usuario quiere hacer algo que no está en sus tareas, o pide una lista de materiales, primero respondé con texto y después usá la herramienta proponer_tarea para ofrecerle crear la tarea con sus materiales. La app le muestra la propuesta y él decide si la guarda; no digas que ya la creaste.
No propongas tareas que ya existen; si ya existe, mencionala por su título.
Los nombres de materiales tienen que servir para buscarlos en Mercado Libre: genéricos y específicos ("sellador de silicona transparente para baño", no "lo de sellar").
No uses tablas ni títulos; como mucho listas cortas.`

const HERRAMIENTAS: Anthropic.Tool[] = [{
  name: 'proponer_tarea',
  description: 'Propone al usuario crear una tarea nueva con su lista de materiales. Solo propone: el usuario la revisa en la app antes de guardarla.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      titulo: { type: 'string', description: 'Título corto de la tarea, empezando con un verbo. Ej.: "Cambiar el sellador de la bañera"' },
      habitacion: { type: 'string', description: 'Habitación de la casa del usuario donde se hace, si corresponde (usá uno de sus nombres). Vacío si no aplica.' },
      prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
      notas: { type: 'string', description: 'Pasos o recordatorios breves para hacerla.' },
      materiales: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            nombre: { type: 'string' },
            cantidad: { type: 'number', description: 'Cantidad, 0 si no se sabe' },
            unidad: { type: 'string', description: 'ud, m, kg, litros, rollos...' },
          },
          required: ['nombre', 'cantidad', 'unidad'],
        },
      },
    },
    required: ['titulo', 'habitacion', 'prioridad', 'notas', 'materiales'],
  },
}]

type Mensaje = { role: 'user' | 'assistant'; content: string }

// Solo texto, alternando y empezando por el usuario; lo último que manda la app es la pregunta nueva.
function limpiar(entrada: unknown): Mensaje[] {
  const salida: Mensaje[] = []
  for (const m of Array.isArray(entrada) ? entrada.slice(-MAX_MENSAJES) : []) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null
    const content = typeof m?.content === 'string' ? m.content.trim().slice(0, MAX_TEXTO) : ''
    if (!role || !content) continue
    const ultimo = salida[salida.length - 1]
    if (ultimo?.role === role) ultimo.content += '\n\n' + content
    else salida.push({ role, content })
  }
  while (salida[0]?.role === 'assistant') salida.shift()
  return salida[salida.length - 1]?.role === 'user' ? salida : []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Usá POST' }, 405)

  const clave = Deno.env.get('ANTHROPIC_API_KEY')
  if (!clave) return json({ error: 'El asistente todavía no está configurado.' }, 503)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return json({ error: 'Entrá con tu cuenta para usar el asistente.' }, 401)

  let cuerpo: { mensajes?: unknown; contexto?: unknown } = {}
  try { cuerpo = await req.json() } catch { /* cuerpo inválido */ }
  const mensajes = limpiar(cuerpo.mensajes)
  if (mensajes.length === 0) return json({ error: 'Falta la pregunta.' }, 400)
  const casa = JSON.stringify(cuerpo.contexto ?? {}).slice(0, MAX_CONTEXTO)

  const { data: n, error: errorConteo } = await db.rpc('asistente_contar', { p_user: user.id, p_limite: LIMITE })
  if (errorConteo) {
    console.error('asistente_contar', errorConteo)
    return json({ error: 'No se pudo usar el asistente. Probá de nuevo.' }, 500)
  }
  if (n === -1) return json({ error: `Llegaste a las ${LIMITE} consultas de hoy. Mañana podés seguir.`, restantes: 0 }, 429)

  const claude = new Anthropic({ apiKey: clave })
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  // Si una consulta se rechaza por seguridad, Claude la reintenta con otro modelo (Haiku no tiene esta opción).
  const conRespaldo = MODELO.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }

  try {
    const r = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Hoy es ${hoy}. La casa del usuario (JSON de la app):\n${casa}` },
      ],
      tools: HERRAMIENTAS,
      tool_choice: { type: 'auto' },
      messages: mensajes,
      ...conRespaldo,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)

    await db.rpc('asistente_tokens', {
      p_user: user.id,
      p_entrada: (r.usage.input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0),
      p_salida: r.usage.output_tokens ?? 0,
    })

    if (r.stop_reason === 'refusal') {
      return json({ texto: 'Sobre eso no te puedo ayudar. Si es algo de la casa, probá contarlo de otra forma.', propuestas: [], restantes: LIMITE - n })
    }
    const texto = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n\n').trim()
    const propuestas = r.content.flatMap((b) => (b.type === 'tool_use' && b.name === 'proponer_tarea' ? [b.input] : []))
    const cortada = r.stop_reason === 'max_tokens' ? '\n\n(La respuesta quedó cortada; pedime que siga.)' : ''
    return json({ texto: texto + cortada, propuestas, restantes: LIMITE - n })
  } catch (e) {
    console.error('asistente', e)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'El asistente está muy pedido. Probá en un rato.' }, 503)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'La clave del asistente no es válida.' }, 503)
    return json({ error: 'El asistente no respondió. Probá de nuevo.' }, 502)
  }
})
