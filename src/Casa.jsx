import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, OFICIOS, borrarAparato, borrarContacto, hoyISO } from './db.js'
import { prepararFoto } from './imagenes.js'
import { dinero, fechaCorta, useBlobUrl } from './util.js'
import {
  Adjunto, BarraSuperior, IconoCamara, IconoClip, IconoImagen, IconoMas, IconoTelefono, Visor, useMoneda,
} from './App.jsx'

// "Casa" tab: the appliances of the house (with manual, invoice and warranty) and the
// people who do repairs, each with the history of tasks done on it / by them.

const MAX_PDF = 15 * 1024 * 1024
const fmtFecha = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })
const fechaLarga = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return fmtFecha.format(new Date(y, m - 1, d)).replace('.', '')
}
const soloDigitos = (tel) => tel.replace(/[^\d+]/g, '')

export function estadoGarantia(hasta) {
  if (!hasta) return null
  const hoy = hoyISO()
  if (hasta < hoy) return { clase: 'vencida', texto: 'Garantía vencida' }
  if (hasta <= hoyISO(60)) return { clase: 'pronto', texto: `Garantía hasta ${fechaCorta(hasta)}` }
  return { clase: 'vigente', texto: 'En garantía' }
}

// A photo is compressed; a PDF is kept as is (up to 15 MB).
async function leerAdjunto(archivo) {
  if (archivo.type === 'application/pdf') {
    if (archivo.size > MAX_PDF) throw new Error('El PDF es muy grande (máximo 15 MB).')
    return archivo
  }
  try {
    return (await prepararFoto(archivo)).imagen
  } catch {
    throw new Error('No se pudo leer el archivo. Prueba con una foto o un PDF.')
  }
}

/* ---------- Tab ---------- */

export function Casa({ nav, nombreHab }) {
  const [vista, setVista] = useState(() => sessionStorage.getItem('casa-vista') ?? 'aparatos')
  const aparatos = useLiveQuery(() => db.aparatos.orderBy('nombre').toArray(), [], null)
  const contactos = useLiveQuery(() => db.contactos.orderBy('nombre').toArray(), [], null)
  const cambiarVista = (v) => {
    setVista(v)
    try { sessionStorage.setItem('casa-vista', v) } catch { /* not critical */ }
  }

  return (
    <main className="pantalla con-pestanas">
      <header className="cabecera-simple">
        <h1>Casa</h1>
        <p className="tenue">Los aparatos de la casa y la gente que te ayuda.</p>
      </header>
      <div className="segmentado dos casa-vistas" role="tablist">
        {[['aparatos', 'Aparatos'], ['contactos', 'Contactos']].map(([v, texto]) => (
          <button key={v} role="tab" aria-selected={vista === v} className={`seg ${vista === v ? 'activo' : ''}`} onClick={() => cambiarVista(v)}>
            {texto}
          </button>
        ))}
      </div>

      {vista === 'aparatos' && aparatos && (aparatos.length === 0 ? (
        <div className="vacio">
          <p className="vacio-titulo">Sin aparatos todavía.</p>
          <p>Apunta el calefón, la heladera o el aire con su manual, factura y garantía.</p>
        </div>
      ) : (
        <ul className="lista">
          {aparatos.map((a) => <FilaAparato key={a.id} aparato={a} habitacion={nombreHab[a.habitacionId]} onAbrir={() => nav.ir({ pantalla: 'aparato', id: a.id })} />)}
        </ul>
      ))}

      {vista === 'contactos' && contactos && (contactos.length === 0 ? (
        <div className="vacio">
          <p className="vacio-titulo">Sin contactos todavía.</p>
          <p>Guarda a tu plomero, electricista o gasista para llamarlos desde las tareas.</p>
        </div>
      ) : (
        <ul className="lista">
          {contactos.map((c) => (
            <li key={c.id} className="fila fila-contacto">
              <button className="fila-cuerpo" onClick={() => nav.ir({ pantalla: 'contacto', id: c.id })}>
                <span className="fila-titulo">{c.nombre}</span>
                {c.oficio && <span className="tenue">{c.oficio}</span>}
              </button>
              {c.telefono && <a className="llamar" href={`tel:${soloDigitos(c.telefono)}`} aria-label={`Llamar a ${c.nombre}`}><IconoTelefono /></a>}
            </li>
          ))}
        </ul>
      ))}

      <button className="fab" onClick={() => nav.ir({ pantalla: vista === 'aparatos' ? 'aparatoForm' : 'contactoForm' })}
        aria-label={vista === 'aparatos' ? 'Nuevo aparato' : 'Nuevo contacto'}>
        <IconoMas />
      </button>
    </main>
  )
}

function FilaAparato({ aparato, habitacion, onAbrir }) {
  const url = useBlobUrl(aparato.miniatura)
  const g = estadoGarantia(aparato.garantiaHasta)
  const marca = [aparato.marca, aparato.modelo].filter(Boolean).join(' ')
  return (
    <li className="fila fila-aparato">
      <button className="fila-cuerpo" onClick={onAbrir}>
        <span className="fila-titulo">{aparato.nombre}</span>
        <span className="fila-meta">
          {marca && <span>{marca}</span>}
          {habitacion && <span className="etiqueta-hab">{habitacion}</span>}
          {g && <span className={`garantia ${g.clase}`}>{g.texto}</span>}
        </span>
      </button>
      {url ? <img className="miniatura" src={url} alt="" onClick={onAbrir} /> : <span className="miniatura sin-foto" aria-hidden="true" onClick={onAbrir} />}
    </li>
  )
}

/* ---------- Task history (shared by appliance and contact) ---------- */

function Historial({ tareas, presupuestos, nav, vacio, contactoNombre }) {
  const moneda = useMoneda()
  const ordenadas = [...tareas].sort((a, b) => (b.completada ?? Infinity) - (a.completada ?? Infinity) || b.creada - a.creada)
  // What was paid for a task: its chosen quote; for a contact, a quote from them counts too.
  const precioDe = (t) => {
    const ps = presupuestos.filter((p) => p.tareaId === t.id && p.precio != null)
    const elegido = ps.find((p) => p.elegido)
    if (elegido) return elegido.precio
    if (contactoNombre) return ps.find((p) => mismoNombre(p.proveedor, contactoNombre))?.precio ?? null
    return null
  }
  const total = ordenadas.filter((t) => t.estado === 'hecha').reduce((n, t) => n + (precioDe(t) ?? 0), 0)
  return (
    <section className="bloque">
      <h2>Historial {tareas.length > 0 && <span className="contador">{tareas.length}</span>}</h2>
      {tareas.length === 0 ? <p className="tenue">{vacio}</p> : (
        <>
          <ul className="materiales">
            {ordenadas.map((t) => {
              const precio = precioDe(t)
              const hecha = t.estado === 'hecha'
              return (
                <li key={t.id}>
                  <button className="fila-gasto" onClick={() => nav.ir({ pantalla: 'detalle', id: t.id })}>
                    <span className="mat-nombre">
                      {t.titulo}
                      <span className="tenue"> · {hecha ? `hecha ${fmtFecha.format(new Date(t.completada)).replace('.', '')}` : 'pendiente'}</span>
                    </span>
                    {precio != null && <span className="mat-cant">{dinero(precio, moneda)}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {total > 0 && <p className="tenue pie">Pagado en total: <strong>{dinero(total, moneda)}</strong></p>}
        </>
      )}
    </section>
  )
}

export const mismoNombre = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/* ---------- Appliance ---------- */

export function DetalleAparato({ id, nav, nombreHab }) {
  const aparato = useLiveQuery(() => db.aparatos.get(id), [id], null)
  const tareas = useLiveQuery(() => db.tareas.where('aparatoId').equals(id).toArray(), [id], [])
  const presupuestos = useLiveQuery(async () => {
    const ids = (await db.tareas.where('aparatoId').equals(id).primaryKeys())
    return db.presupuestos.where('tareaId').anyOf(ids).toArray()
  }, [id], [])
  const [visor, setVisor] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const fotoUrl = useBlobUrl(aparato?.foto)

  if (!aparato) return <main className="pantalla"><BarraSuperior onVolver={nav.volver} /></main>
  const g = estadoGarantia(aparato.garantiaHasta)

  return (
    <main className="pantalla">
      <BarraSuperior onVolver={nav.volver} accion={
        <button className="boton-texto" onClick={() => nav.ir({ pantalla: 'aparatoForm', id })}>Editar</button>
      } />
      <article className="detalle">
        {fotoUrl && <button className="foto-aparato" onClick={() => setVisor(aparato.foto)} aria-label="Ver foto"><img src={fotoUrl} alt="" /></button>}
        <h1>{aparato.nombre}</h1>
        <dl className="datos">
          <div><dt>Habitación</dt><dd>{nombreHab[aparato.habitacionId] ?? 'Sin asignar'}</dd></div>
          <div><dt>Marca</dt><dd>{aparato.marca || '—'}</dd></div>
          <div><dt>Modelo</dt><dd>{aparato.modelo || '—'}</dd></div>
          <div><dt>Comprado</dt><dd>{aparato.compra ? fechaLarga(aparato.compra) : '—'}</dd></div>
          <div className="ancho">
            <dt>Garantía</dt>
            <dd>{aparato.garantiaHasta
              ? <span className={`garantia ${g.clase}`}>{g.clase === 'vencida' ? 'Vencida el' : 'Hasta el'} {fechaLarga(aparato.garantiaHasta)}</span>
              : 'Sin datos'}</dd>
          </div>
        </dl>
        {aparato.notas && <p className="notas">{aparato.notas}</p>}

        <section className="bloque">
          <h2>Documentos</h2>
          <div className="documentos">
            <div>
              <span className="tenue">Manual</span>
              {aparato.manual ? <Adjunto blob={aparato.manual} nombre={aparato.manualNombre || 'manual.pdf'} onVerFoto={() => setVisor(aparato.manual)} /> : <p className="tenue">Sin manual.</p>}
            </div>
            <div>
              <span className="tenue">Factura</span>
              {aparato.factura ? <Adjunto blob={aparato.factura} nombre={aparato.facturaNombre || 'factura.pdf'} onVerFoto={() => setVisor(aparato.factura)} /> : <p className="tenue">Sin factura.</p>}
            </div>
          </div>
        </section>

        <Historial tareas={tareas} presupuestos={presupuestos} nav={nav} vacio="Todavía no hay tareas de este aparato." />

        <div className="acciones">
          <button className="boton primario" onClick={() => nav.ir({ pantalla: 'formulario', aparatoId: id, habitacionId: aparato.habitacionId ?? null })}>
            Nueva tarea para este aparato
          </button>
          {confirmando ? (
            <div className="confirmar">
              <span>¿Borrar este aparato? Sus tareas se conservan.</span>
              <div className="confirmar-botones">
                <button className="boton" onClick={() => setConfirmando(false)}>Cancelar</button>
                <button className="boton peligro" onClick={async () => { await borrarAparato(id); nav.volver() }}>Borrar</button>
              </div>
            </div>
          ) : (
            <button className="boton-texto peligro-texto" onClick={() => setConfirmando(true)}>Borrar aparato</button>
          )}
        </div>
      </article>
      {visor && <Visor blob={visor} onCerrar={() => setVisor(null)} />}
    </main>
  )
}

const APARATO_VACIO = { nombre: '', habitacionId: '', marca: '', modelo: '', compra: '', garantiaHasta: '', notas: '', foto: null, miniatura: null, manual: null, manualNombre: '', factura: null, facturaNombre: '' }

export function FormAparato({ id, nav, habitaciones }) {
  const [a, setA] = useState(id ? null : APARATO_VACIO)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(0)
  const [visor, setVisor] = useState(null)
  const fotoUrl = useBlobUrl(a?.miniatura)

  useEffect(() => {
    if (!id) return
    db.aparatos.get(id).then((x) => (x ? setA({ ...APARATO_VACIO, ...x, habitacionId: x.habitacionId ?? '' }) : nav.volver()))
  }, [id])

  if (!a) return <main className="pantalla"><BarraSuperior onVolver={nav.volver} /></main>
  const cambiar = (k) => (e) => setA((x) => ({ ...x, [k]: e.target.value }))

  const elegirFoto = async (e) => {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    setOcupado((n) => n + 1)
    try {
      const { imagen, miniatura } = await prepararFoto(archivo)
      setA((x) => ({ ...x, foto: imagen, miniatura }))
    } catch {
      setError('No se pudo leer la foto. Prueba con otra imagen.')
    } finally { setOcupado((n) => n - 1) }
  }
  const elegirDoc = (campo) => async (e) => {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setOcupado((n) => n + 1)
    try {
      const blob = await leerAdjunto(archivo)
      setA((x) => ({ ...x, [campo]: blob, [`${campo}Nombre`]: archivo.name }))
    } catch (err) {
      setError(err.message)
    } finally { setOcupado((n) => n - 1) }
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!a.nombre.trim()) return setError('Escribe el nombre del aparato.')
    const { id: _, ...resto } = a
    const fila = {
      ...resto,
      nombre: a.nombre.trim(), marca: a.marca.trim(), modelo: a.modelo.trim(), notas: a.notas.trim(),
      habitacionId: a.habitacionId === '' ? null : Number(a.habitacionId),
      compra: a.compra || null, garantiaHasta: a.garantiaHasta || null,
    }
    try {
      if (id) { await db.aparatos.put({ ...fila, id }); nav.volver() }
      else nav.reemplazar({ pantalla: 'aparato', id: await db.aparatos.add(fila) })
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar. Comprueba que el móvil tiene espacio libre.')
    }
  }

  const doc = (campo, titulo) => (
    <fieldset className="campo">
      <legend>{titulo}</legend>
      {a[campo] ? (
        <div className="adjunto-form">
          <Adjunto blob={a[campo]} nombre={a[`${campo}Nombre`]} onVerFoto={() => setVisor(a[campo])} />
          <button type="button" className="boton-texto peligro-texto" onClick={() => setA((x) => ({ ...x, [campo]: null, [`${campo}Nombre`]: '' }))}>Quitar</button>
        </div>
      ) : (
        <div className="botones-foto">
          <label className="boton">
            <IconoCamara /> Sacar foto
            <input id={`${campo}-camara`} type="file" accept="image/*" capture="environment" onChange={elegirDoc(campo)} hidden />
          </label>
          <label className="boton">
            <IconoClip /> Foto o PDF guardado
            <input id={`${campo}-archivo`} type="file" accept="image/*,application/pdf" onChange={elegirDoc(campo)} hidden />
          </label>
        </div>
      )}
    </fieldset>
  )

  return (
    <main className="pantalla">
      <BarraSuperior titulo={id ? 'Editar aparato' : 'Nuevo aparato'} onVolver={nav.volver} />
      <form className="formulario" onSubmit={guardar} noValidate>
        <label className="campo">
          <span>Nombre</span>
          <input id="ap-nombre" value={a.nombre} onChange={cambiar('nombre')} placeholder="Ej.: Calefón, heladera, aire del living" autoFocus={!id} />
        </label>
        <div className="campos-fila">
          <label className="campo">
            <span>Marca</span>
            <input id="ap-marca" value={a.marca} onChange={cambiar('marca')} />
          </label>
          <label className="campo">
            <span>Modelo</span>
            <input id="ap-modelo" value={a.modelo} onChange={cambiar('modelo')} />
          </label>
        </div>
        <label className="campo">
          <span>Habitación</span>
          <select id="ap-habitacion" value={String(a.habitacionId)} onChange={cambiar('habitacionId')}>
            <option value="">Sin asignar</option>
            {habitaciones.map((h) => <option key={h.id} value={String(h.id)}>{h.nombre}</option>)}
          </select>
        </label>
        <div className="campos-fila">
          <label className="campo">
            <span>Fecha de compra</span>
            <input id="ap-compra" type="date" value={a.compra ?? ''} onChange={cambiar('compra')} />
          </label>
          <label className="campo">
            <span>Garantía hasta</span>
            <input id="ap-garantia" type="date" value={a.garantiaHasta ?? ''} onChange={cambiar('garantiaHasta')} />
          </label>
        </div>
        <label className="campo">
          <span>Notas</span>
          <textarea id="ap-notas" rows={3} value={a.notas} onChange={cambiar('notas')} placeholder="Número de serie, service oficial, filtro que usa…" />
        </label>

        <fieldset className="campo">
          <legend>Foto</legend>
          {a.miniatura ? (
            <div className="adjunto-form">
              <button type="button" className="adjunto-foto" onClick={() => setVisor(a.foto)} aria-label="Ver foto">{fotoUrl && <img src={fotoUrl} alt="" />}</button>
              <button type="button" className="boton-texto peligro-texto" onClick={() => setA((x) => ({ ...x, foto: null, miniatura: null }))}>Quitar</button>
            </div>
          ) : (
            <div className="botones-foto">
              <label className="boton">
                <IconoCamara /> Hacer foto
                <input id="ap-foto-camara" type="file" accept="image/*" capture="environment" onChange={elegirFoto} hidden />
              </label>
              <label className="boton">
                <IconoImagen /> Elegir de la galería
                <input id="ap-foto-galeria" type="file" accept="image/*" onChange={elegirFoto} hidden />
              </label>
            </div>
          )}
        </fieldset>
        {doc('manual', 'Manual')}
        {doc('factura', 'Factura o ticket')}

        {error && <p className="error" role="alert">{error}</p>}
        <div className="barra-guardar">
          <button type="submit" className="boton primario ancho" disabled={ocupado > 0}>{ocupado > 0 ? 'Preparando archivos…' : 'Guardar aparato'}</button>
        </div>
      </form>
      {visor && <Visor blob={visor} onCerrar={() => setVisor(null)} />}
    </main>
  )
}

/* ---------- Contact ---------- */

// Tasks linked to the contact, plus tasks where they sent a quote under the same name.
async function tareasDeContacto(c) {
  const propias = await db.tareas.where('contactoId').equals(c.id).toArray()
  const presupuestos = (await db.presupuestos.toArray()).filter((p) => mismoNombre(p.proveedor, c.nombre))
  const ids = new Set(propias.map((t) => t.id))
  const extra = (await db.tareas.bulkGet([...new Set(presupuestos.map((p) => p.tareaId))].filter((x) => !ids.has(x)))).filter(Boolean)
  const tareas = [...propias, ...extra]
  return { tareas, presupuestos: await db.presupuestos.where('tareaId').anyOf(tareas.map((t) => t.id)).toArray() }
}

export function DetalleContacto({ id, nav }) {
  const c = useLiveQuery(() => db.contactos.get(id), [id], null)
  const datos = useLiveQuery(async () => (c ? tareasDeContacto(c) : { tareas: [], presupuestos: [] }), [c], { tareas: [], presupuestos: [] })
  const [confirmando, setConfirmando] = useState(false)

  if (!c) return <main className="pantalla"><BarraSuperior onVolver={nav.volver} /></main>
  const tel = c.telefono ? soloDigitos(c.telefono) : ''

  return (
    <main className="pantalla">
      <BarraSuperior onVolver={nav.volver} accion={
        <button className="boton-texto" onClick={() => nav.ir({ pantalla: 'contactoForm', id })}>Editar</button>
      } />
      <article className="detalle">
        <div>
          <h1>{c.nombre}</h1>
          {c.oficio && <p className="tenue oficio">{c.oficio}</p>}
        </div>
        {tel && (
          <div className="botones-foto">
            <a className="boton primario" href={`tel:${tel}`}><IconoTelefono /> Llamar</a>
            <a className="boton" href={`https://wa.me/${tel.replace('+', '')}`} target="_blank" rel="noopener">WhatsApp</a>
          </div>
        )}
        {c.telefono && <p className="tenue">{c.telefono}</p>}
        {c.notas && <p className="notas">{c.notas}</p>}

        <Historial tareas={datos.tareas} presupuestos={datos.presupuestos} nav={nav} contactoNombre={c.nombre}
          vacio="Todavía no hizo ningún trabajo. Asígnalo en una tarea eligiendo «Profesional»." />

        <div className="acciones">
          {confirmando ? (
            <div className="confirmar">
              <span>¿Borrar este contacto? Sus tareas se conservan.</span>
              <div className="confirmar-botones">
                <button className="boton" onClick={() => setConfirmando(false)}>Cancelar</button>
                <button className="boton peligro" onClick={async () => { await borrarContacto(id); nav.volver() }}>Borrar</button>
              </div>
            </div>
          ) : (
            <button className="boton-texto peligro-texto" onClick={() => setConfirmando(true)}>Borrar contacto</button>
          )}
        </div>
      </article>
    </main>
  )
}

export function FormContacto({ id, nav }) {
  const [c, setC] = useState(id ? null : { nombre: '', oficio: '', telefono: '', notas: '' })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) return
    db.contactos.get(id).then((x) => (x ? setC({ oficio: '', telefono: '', notas: '', ...x }) : nav.volver()))
  }, [id])
  if (!c) return <main className="pantalla"><BarraSuperior onVolver={nav.volver} /></main>
  const cambiar = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }))
  const guardar = async (e) => {
    e.preventDefault()
    if (!c.nombre.trim()) return setError('Escribe el nombre.')
    const fila = { nombre: c.nombre.trim(), oficio: c.oficio.trim(), telefono: c.telefono.trim(), notas: c.notas.trim() }
    if (id) { await db.contactos.update(id, fila); nav.volver() }
    else nav.reemplazar({ pantalla: 'contacto', id: await db.contactos.add({ ...fila, creado: Date.now() }) })
  }
  return (
    <main className="pantalla">
      <BarraSuperior titulo={id ? 'Editar contacto' : 'Nuevo contacto'} onVolver={nav.volver} />
      <form className="formulario" onSubmit={guardar} noValidate>
        <label className="campo">
          <span>Nombre</span>
          <input id="co-nombre" value={c.nombre} onChange={cambiar('nombre')} placeholder="Ej.: Carlos plomero" autoFocus={!id} />
        </label>
        <label className="campo">
          <span>Oficio</span>
          <input id="co-oficio" list="oficios" value={c.oficio} onChange={cambiar('oficio')} placeholder="Plomero, electricista…" />
          <datalist id="oficios">{OFICIOS.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
        <label className="campo">
          <span>Teléfono</span>
          <input id="co-telefono" type="tel" value={c.telefono} onChange={cambiar('telefono')} />
        </label>
        <label className="campo">
          <span>Notas</span>
          <textarea id="co-notas" rows={3} value={c.notas} onChange={cambiar('notas')} placeholder="Horarios, cómo cobra, quién lo recomendó…" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="barra-guardar">
          <button type="submit" className="boton primario ancho">Guardar contacto</button>
        </div>
      </form>
    </main>
  )
}
