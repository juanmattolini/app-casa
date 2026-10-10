// Edge Function "ml-buscar": busca un material en Mercado Libre y devuelve 3 opciones + precio de referencia.
//
// POST { q: "pintura esmalte blanco" }  (o GET ?q=..., para probar desde el navegador)  →  { opciones: [{ id, titulo, precio, moneda, foto, envioGratis, enlace }],
//                                            referencia, moneda, prueba?, cache? }
//
// Las credenciales viven solo acá (secrets de Supabase), nunca en la app:
//   ML_CLIENT_ID, ML_CLIENT_SECRET  app registrada en developers.mercadolibre.com
//   ML_SITIO                        MLA (Argentina, por defecto), MLU, MLM, MLC, MCO...
//   ML_AFILIADO                     parámetros de afiliado que se suman a cada enlace, p. ej. "matt_tool=123&matt_word=appcasa"
// Sin ML_CLIENT_ID responde datos simulados ("prueba": true) y no guarda nada en caché.
//
// Caché en la tabla ml_cache (24 h). Se despliega con --no-verify-jwt porque la app la llama con la clave publicable.

import { createClient } from 'npm:@supabase/supabase-js@2'

const HORAS_CACHE = 24
const API = 'https://api.mercadolibre.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const normal = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

type Opcion = { id: string; titulo: string; precio: number; moneda: string; foto: string | null; envioGratis: boolean; enlace: string }
type Resultado = { opciones: Opcion[]; referencia: number | null; moneda: string | null; prueba?: boolean }

function mediana(xs: number[]) {
  if (xs.length === 0) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2)
}

function conAfiliado(enlace: string) {
  const extra = Deno.env.get('ML_AFILIADO')?.trim()
  if (!extra) return enlace
  return enlace + (enlace.includes('?') ? '&' : '?') + extra.replace(/^[?&]/, '')
}

// Token de aplicación (client_credentials). Dura ~6 h; se reutiliza mientras la función siga viva.
let token: { valor: string; vence: number } | null = null
async function obtenerToken() {
  if (token && token.vence > Date.now()) return token.valor
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: Deno.env.get('ML_CLIENT_ID')!,
      client_secret: Deno.env.get('ML_CLIENT_SECRET') ?? '',
    }),
  })
  if (!r.ok) throw new Error(`token ${r.status}`)
  const d = await r.json()
  token = { valor: d.access_token, vence: Date.now() + (d.expires_in - 300) * 1000 }
  return token.valor
}

async function buscarEnML(q: string, sitio: string): Promise<Resultado> {
  const url = `${API}/sites/${sitio}/search?` + new URLSearchParams({ q, limit: '15' })
  const r = await fetch(url, { headers: { Authorization: `Bearer ${await obtenerToken()}` } })
  if (!r.ok) throw new Error(`busqueda ${r.status}`)
  const d = await r.json()
  // deno-lint-ignore no-explicit-any
  const items = (d.results ?? []).filter((x: any) => x.price > 0 && x.condition !== 'used')
  // deno-lint-ignore no-explicit-any
  const opciones: Opcion[] = items.slice(0, 3).map((x: any) => ({
    id: x.id,
    titulo: x.title,
    precio: x.price,
    moneda: x.currency_id,
    foto: x.thumbnail ? String(x.thumbnail).replace(/^http:/, 'https:') : null,
    envioGratis: !!x.shipping?.free_shipping,
    enlace: conAfiliado(x.permalink),
  }))
  // Referencia: mediana de los primeros resultados, menos sensible a packs y repuestos sueltos.
  // deno-lint-ignore no-explicit-any
  return { opciones, referencia: mediana(items.slice(0, 10).map((x: any) => x.price)), moneda: items[0]?.currency_id ?? null }
}

// Datos inventados pero estables para un mismo texto, para probar la pantalla sin credenciales.
function simulado(q: string): Resultado {
  let h = 0
  for (const c of q) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const base = 3000 + (h % 40) * 1000
  const opciones = [0.85, 1, 1.3].map((f, i) => ({
    id: `PRUEBA-${h}-${i}`,
    titulo: `${q.charAt(0).toUpperCase() + q.slice(1)} ${['económico', 'calidad estándar', 'primera marca'][i]}`,
    precio: Math.round((base * f) / 100) * 100,
    moneda: 'ARS',
    foto: null,
    envioGratis: i !== 0,
    enlace: conAfiliado(`https://listado.mercadolibre.com.ar/${encodeURIComponent(q.replace(/\s+/g, '-'))}`),
  }))
  return { opciones, referencia: base, moneda: 'ARS', prueba: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let q = ''
  if (req.method === 'GET') q = normal(new URL(req.url).searchParams.get('q') ?? '').slice(0, 80)
  else {
    try { q = normal(String((await req.json()).q ?? '')).slice(0, 80) } catch { /* cuerpo inválido */ }
  }
  if (q.length < 2) return json({ error: 'falta q' }, 400)

  if (!Deno.env.get('ML_CLIENT_ID')) return json(simulado(q))

  const sitio = (Deno.env.get('ML_SITIO') ?? 'MLA').toUpperCase()
  const clave = `${sitio}:${q}`
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const desde = new Date(Date.now() - HORAS_CACHE * 3600_000).toISOString()
  const { data: guardado } = await db.from('ml_cache').select('datos').eq('consulta', clave).gte('creado', desde).maybeSingle()
  if (guardado) return json({ ...guardado.datos, cache: true })

  try {
    const datos = await buscarEnML(q, sitio)
    await db.from('ml_cache').upsert({ consulta: clave, datos, creado: new Date().toISOString() })
    return json(datos)
  } catch (e) {
    console.error('ml-buscar', clave, e)
    // Si la API falla, mejor un resultado viejo que nada.
    const { data: viejo } = await db.from('ml_cache').select('datos').eq('consulta', clave).maybeSingle()
    if (viejo) return json({ ...viejo.datos, cache: true })
    return json({ error: 'Mercado Libre no respondió' }, 502)
  }
})
