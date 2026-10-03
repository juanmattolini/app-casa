import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, PRIORIDADES, QUIEN, REPETICIONES, alternarHecha, borrarEjemplos, borrarTarea, elegirPresupuesto, guardarTarea, hoyISO } from './db.js'
import { abrirIcs, archivoIcs, enlaceGoogle } from './calendario.js'
import { exportar, leerCopia, restaurar } from './respaldo.js'
import { prepararFoto } from './imagenes.js'
import Nube from './Nube.jsx'
import { Casa, DetalleAparato, DetalleContacto, FormAparato, FormContacto, mismoNombre } from './Casa.jsx'
import { aNumero, cantidadTexto, diasDeRetraso, dinero, fechaCorta, grupoDe, recordatorioTexto, useBlobUrl } from './util.js'

const GRUPOS = [
  { clave: 'vencidas', titulo: 'Vencidas' },
  { clave: 'hoy', titulo: 'Hoy' },
  { clave: 'proximas', titulo: 'Próximas' },
  { clave: 'sinFecha', titulo: 'Sin fecha' },
]

// Navigation is a small stack kept in memory. When installed (not inside a preview frame),
// each screen also gets a history entry so Android's back button pops it.
const usarHistorial = (() => {
  try { return window.self === window.top } catch { return false }
})()

function useNavegacion() {
  const [pila, setPila] = useState([{ pantalla: 'inicio' }])
  const pop = () => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p))
  useEffect(() => {
    if (!usarHistorial) return
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  const ir = (destino) => {
    if (usarHistorial) history.pushState(null, '')
    setPila((p) => [...p, destino])
  }
  const volver = () => (usarHistorial && pila.length > 1 ? history.back() : pop())
  const reemplazar = (destino) => setPila((p) => [...p.slice(0, -1), destino])
  const raiz = (pantalla) => {
    if (usarHistorial && pila.length > 1) history.go(-(pila.length - 1))
    setPila([{ pantalla }])
  }
  return { actual: pila[pila.length - 1], ir, volver, reemplazar, raiz }
}

export default function App() {
  const nav = useNavegacion()
  const { actual } = nav
  const habitaciones = useLiveQuery(() => db.habitaciones.orderBy('nombre').toArray(), [], [])
  const nombreHab = useMemo(() => Object.fromEntries(habitaciones.map((h) => [h.id, h.nombre])), [habitaciones])
  const pestaña = ['inicio', 'casa', 'compras', 'gastos', 'ajustes'].includes(actual.pantalla) ? actual.pantalla : null

  return (
    <div className="app">
      {actual.pantalla === 'inicio' && <Inicio nav={nav} nombreHab={nombreHab} habitaciones={habitaciones} />}
      {actual.pantalla === 'detalle' && <Detalle id={actual.id} nav={nav} nombreHab={nombreHab} />}
      {actual.pantalla === 'formulario' && <Formulario id={actual.id} preset={actual} nav={nav} habitaciones={habitaciones} />}
      {actual.pantalla === 'casa' && <Casa nav={nav} nombreHab={nombreHab} />}
      {actual.pantalla === 'aparato' && <DetalleAparato id={actual.id} nav={nav} nombreHab={nombreHab} />}
      {actual.pantalla === 'aparatoForm' && <FormAparato id={actual.id} nav={nav} habitaciones={habitaciones} />}
      {actual.pantalla === 'contacto' && <DetalleContacto id={actual.id} nav={nav} />}
      {actual.pantalla === 'contactoForm' && <FormContacto id={actual.id} nav={nav} />}
      {actual.pantalla === 'compras' && <Compras nav={nav} />}
      {actual.pantalla === 'gastos' && <Gastos nav={nav} nombreHab={nombreHab} />}
      {actual.pantalla === 'ajustes' && <Ajustes habitaciones={habitaciones} />}
      {pestaña && (
        <nav className="pestanas" aria-label="Secciones">
          {[
            ['inicio', 'Tareas', IconoLista],
            ['casa', 'Casa', IconoCasa],
            ['compras', 'Compras', IconoCarro],
            ['gastos', 'Gastos', IconoGastos],
            ['ajustes', 'Ajustes', IconoAjustes],
          ].map(([clave, texto, Icono]) => (
            <button key={clave} className={pestaña === clave ? 'activa' : ''} onClick={() => nav.raiz(clave)}>
              <Icono />
              <span>{texto}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

/* ---------- Inicio ---------- */

function Inicio({ nav, nombreHab, habitaciones }) {
  const tareas = useLiveQuery(() => db.tareas.toArray(), [], null)
  const materiales = useLiveQuery(() => db.materiales.toArray(), [], [])
  const portadas = useLiveQuery(async () => {
    const fotos = await db.fotos.toArray()
    const m = {}
    for (const f of fotos) if (!m[f.tareaId]) m[f.tareaId] = f.miniatura
    return m
  }, [], {})
  const [busqueda, setBusqueda] = useState('')
  const [habFiltro, setHabFiltro] = useState('')
  const [prioFiltro, setPrioFiltro] = useState('')
  const [verHechas, setVerHechas] = useState(false)

  const pendientesPorTarea = useMemo(() => {
    const m = {}
    for (const x of materiales) if (!x.comprado) m[x.tareaId] = (m[x.tareaId] ?? 0) + 1
    return m
  }, [materiales])

  const grupos = useMemo(() => {
    const g = { vencidas: [], hoy: [], proximas: [], sinFecha: [], hechas: [] }
    const q = busqueda.trim().toLowerCase()
    for (const t of tareas ?? []) {
      if (habFiltro && String(t.habitacionId) !== habFiltro) continue
      if (prioFiltro && t.prioridad !== prioFiltro) continue
      if (q && !`${t.titulo} ${t.notas}`.toLowerCase().includes(q)) continue
      g[grupoDe(t)].push(t)
    }
    const peso = { alta: 0, media: 1, baja: 2 }
    for (const k of ['vencidas', 'hoy', 'proximas'])
      g[k].sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite) || peso[a.prioridad] - peso[b.prioridad])
    g.sinFecha.sort((a, b) => peso[a.prioridad] - peso[b.prioridad] || b.creada - a.creada)
    g.hechas.sort((a, b) => b.completada - a.completada)
    return g
  }, [tareas, busqueda, habFiltro, prioFiltro])

  const pendientes = (tareas ?? []).filter((t) => t.estado !== 'hecha').length
  const hayEjemplos = (tareas ?? []).some((t) => t.ejemplo)
  const filtrando = busqueda || habFiltro || prioFiltro

  return (
    <main className="pantalla con-pestanas">
      <header className="cabecera-inicio">
        <div className="cabecera-textos">
          <p className="sobretitulo">{fechaLarga()}</p>
          <h1>{saludo()}</h1>
          <p className="resumen">
            {pendientes === 0 ? 'Todo al día en casa' : `${pendientes} ${pendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'}`}
          </p>
        </div>
        <div className="cifras">
          <div className={`cifra ${grupos.vencidas.length ? 'alerta' : ''}`}><strong>{grupos.vencidas.length}</strong><span>Vencidas</span></div>
          <div className="cifra"><strong>{grupos.hoy.length}</strong><span>Hoy</span></div>
          <div className="cifra"><strong>{grupos.proximas.length + grupos.sinFecha.length}</strong><span>Después</span></div>
        </div>
      </header>

      <div className="filtros">
        <input
          id="busqueda" type="search" placeholder="Buscar tarea" value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar tarea"
        />
        <div className="chips" role="group" aria-label="Filtrar por habitación">
          <button className={`chip ${habFiltro === '' ? 'activo' : ''}`} aria-pressed={habFiltro === ''} onClick={() => setHabFiltro('')}>Todas</button>
          {habitaciones.map((h) => (
            <button key={h.id} className={`chip ${habFiltro === String(h.id) ? 'activo' : ''}`} aria-pressed={habFiltro === String(h.id)}
              onClick={() => setHabFiltro(habFiltro === String(h.id) ? '' : String(h.id))}>{h.nombre}</button>
          ))}
          <span className="chips-separador" aria-hidden="true" />
          {PRIORIDADES.map((p) => (
            <button key={p.valor} className={`chip prio-${p.valor} ${prioFiltro === p.valor ? 'activo' : ''}`} aria-pressed={prioFiltro === p.valor}
              onClick={() => setPrioFiltro(prioFiltro === p.valor ? '' : p.valor)}>
              <span className="punto" aria-hidden="true" />{p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {hayEjemplos && !filtrando && (
        <div className="aviso">
          <p>Estas tareas son ejemplos para que veas cómo funciona.</p>
          <button className="enlace" onClick={borrarEjemplos}>Quitar ejemplos</button>
        </div>
      )}

      {tareas && pendientes === 0 && !filtrando && (
        <div className="vacio">
          <p className="vacio-titulo">No hay nada pendiente.</p>
          <p>Toca + para apuntar la próxima tarea de la casa.</p>
        </div>
      )}

      {GRUPOS.map(({ clave, titulo }) =>
        grupos[clave].length > 0 && (
          <section key={clave} className={`grupo grupo-${clave}`}>
            <h2>{titulo} <span className="contador">{grupos[clave].length}</span></h2>
            <ul className="lista">
              {grupos[clave].map((t) => (
                <FilaTarea
                  key={t.id} tarea={t} habitacion={nombreHab[t.habitacionId]} miniatura={portadas[t.id]}
                  materialesPendientes={pendientesPorTarea[t.id]} onAbrir={() => nav.ir({ pantalla: 'detalle', id: t.id })}
                />
              ))}
            </ul>
          </section>
        )
      )}

      {filtrando && tareas && GRUPOS.every(({ clave }) => grupos[clave].length === 0) && (
        <div className="vacio"><p>Ninguna tarea coincide con el filtro.</p></div>
      )}

      {grupos.hechas.length > 0 && (
        <section className="grupo grupo-hechas">
          <button className="enlace" onClick={() => setVerHechas((v) => !v)} aria-expanded={verHechas}>
            {verHechas ? 'Ocultar' : 'Ver'} hechas ({grupos.hechas.length})
          </button>
          {verHechas && (
            <ul className="lista">
              {grupos.hechas.map((t) => (
                <FilaTarea key={t.id} tarea={t} habitacion={nombreHab[t.habitacionId]} miniatura={portadas[t.id]}
                  onAbrir={() => nav.ir({ pantalla: 'detalle', id: t.id })} />
              ))}
            </ul>
          )}
        </section>
      )}

      <button className="fab" onClick={() => nav.ir({ pantalla: 'formulario' })} aria-label="Nueva tarea">
        <IconoMas />
      </button>
    </main>
  )
}

function saludo() {
  const h = new Date().getHours()
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

function fechaLarga() {
  const texto = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function FilaTarea({ tarea, habitacion, miniatura, materialesPendientes, onAbrir }) {
  const url = useBlobUrl(miniatura)
  const hecha = tarea.estado === 'hecha'
  const grupo = grupoDe(tarea)
  return (
    <li className={`fila prio-${tarea.prioridad} ${hecha ? 'hecha' : ''}`}>
      <button className="check" onClick={() => alternarHecha(tarea)} aria-label={hecha ? 'Marcar pendiente' : 'Marcar hecha'} aria-pressed={hecha}>
        <IconoCheck />
      </button>
      <button className="fila-cuerpo" onClick={onAbrir}>
        <span className="fila-titulo">{tarea.titulo}</span>
        <span className="fila-meta">
          {tarea.fechaLimite && (
            <span className={grupo === 'vencidas' ? 'tarde' : ''}>
              {grupo === 'vencidas' ? `Hace ${diasDeRetraso(tarea.fechaLimite)} d` : fechaCorta(tarea.fechaLimite)}
            </span>
          )}
          {habitacion && <span className="etiqueta-hab">{habitacion}</span>}
          {tarea.repetir && !hecha && <span className="con-icono"><IconoRepetir /> {etiquetaRepetir(tarea.repetir)}</span>}
          {tarea.recordatorio && !hecha && <span className="con-icono"><IconoCampana /> {recordatorioTexto(tarea.recordatorio)}</span>}
          {tarea.quien === 'pro' && !hecha && <span>Profesional</span>}
          {materialesPendientes > 0 && <span>{materialesPendientes} por comprar</span>}
          {tarea.ejemplo && <span className="etiqueta-ejemplo">ejemplo</span>}
        </span>
      </button>
      {url && <img className="miniatura" src={url} alt="" onClick={onAbrir} />}
    </li>
  )
}

/* ---------- Detalle ---------- */

function Detalle({ id, nav, nombreHab }) {
  const tarea = useLiveQuery(() => db.tareas.get(id), [id], null)
  const materiales = useLiveQuery(() => db.materiales.where('tareaId').equals(id).toArray(), [id], [])
  const fotos = useLiveQuery(() => db.fotos.where('tareaId').equals(id).toArray(), [id], [])
  const aparato = useLiveQuery(async () => (tarea?.aparatoId ? db.aparatos.get(tarea.aparatoId) : null), [tarea?.aparatoId], null)
  const contacto = useLiveQuery(async () => (tarea?.contactoId ? db.contactos.get(tarea.contactoId) : null), [tarea?.contactoId], null)
  const moneda = useMoneda()
  const [visor, setVisor] = useState(null)
  const [confirmando, setConfirmando] = useState(false)

  if (!tarea) return <main className="pantalla"><BarraSuperior titulo="" onVolver={nav.volver} /></main>
  const hecha = tarea.estado === 'hecha'
  const prio = PRIORIDADES.find((p) => p.valor === tarea.prioridad)

  return (
    <main className="pantalla">
      <BarraSuperior onVolver={nav.volver} accion={
        <button className="boton-texto" onClick={() => nav.ir({ pantalla: 'formulario', id })}>Editar</button>
      } />
      <article className="detalle">
        <h1 className={hecha ? 'tachado' : ''}>{tarea.titulo}</h1>
        <dl className="datos">
          <div><dt>Habitación</dt><dd>{nombreHab[tarea.habitacionId] ?? 'Sin asignar'}</dd></div>
          <div><dt>Prioridad</dt><dd><span className={`pastilla prio-${tarea.prioridad}`}>{prio?.etiqueta}</span></dd></div>
          <div><dt>Fecha límite</dt><dd className={grupoDe(tarea) === 'vencidas' ? 'tarde' : ''}>{tarea.fechaLimite ? fechaCorta(tarea.fechaLimite) : 'Sin fecha'}</dd></div>
          <div><dt>Estado</dt><dd>{hecha ? 'Hecha' : 'Pendiente'}</dd></div>
          {aparato && <div className="ancho"><dt>Aparato</dt><dd><button className="enlace" onClick={() => nav.ir({ pantalla: 'aparato', id: aparato.id })}>{aparato.nombre}</button></dd></div>}
          {tarea.quien && <div><dt>Quién lo hace</dt><dd>{QUIEN.find((q) => q.valor === tarea.quien)?.etiqueta}</dd></div>}
          {tarea.tiempo && <div><dt>Tiempo estimado</dt><dd>{tarea.tiempo}</dd></div>}
          {tarea.costoEstimado != null && <div><dt>Costo estimado</dt><dd>{dinero(tarea.costoEstimado, moneda)}</dd></div>}
          {tarea.repetir && <div className="ancho"><dt>Se repite</dt><dd>{etiquetaRepetir(tarea.repetir)}{hecha && tarea.siguienteId ? ' · ya se creó la siguiente' : ''}</dd></div>}
        </dl>

        {tarea.notas && <p className="notas">{tarea.notas}</p>}

        {contacto && (
          <section className="bloque">
            <h2>Profesional</h2>
            <div className="contacto-tarea">
              <button className="fila-cuerpo" onClick={() => nav.ir({ pantalla: 'contacto', id: contacto.id })}>
                <span className="fila-titulo">{contacto.nombre}</span>
                {contacto.oficio && <span className="tenue">{contacto.oficio}</span>}
              </button>
              {contacto.telefono && <a className="llamar" href={`tel:${contacto.telefono.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${contacto.nombre}`}><IconoTelefono /></a>}
            </div>
          </section>
        )}

        {!hecha && <BloqueRecordatorio tarea={tarea} materiales={materiales} onEditar={() => nav.ir({ pantalla: 'formulario', id })} />}

        <section className="bloque">
          <h2>Materiales</h2>
          {materiales.length === 0 ? <p className="tenue">Sin materiales.</p> : (
            <ul className="materiales">
              {materiales.map((m) => (
                <li key={m.id}>
                  <label className={m.comprado ? 'comprado' : ''}>
                    <input id={`mat-${m.id}`} type="checkbox" checked={m.comprado} onChange={() => db.materiales.update(m.id, { comprado: !m.comprado })} />
                    <span className="mat-nombre">{m.nombre}</span>
                    <span className="mat-cant">{cantidadTexto(m)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <BloquePresupuestos tareaId={id} contactoPreferido={contacto} />

        <section className="bloque">
          <h2>Fotos</h2>
          {fotos.length === 0 ? <p className="tenue">Sin fotos. Añádelas desde Editar.</p> : (
            <div className="galeria">
              {fotos.map((f) => <Miniatura key={f.id} blob={f.miniatura} onClick={() => setVisor(f)} />)}
            </div>
          )}
        </section>

        <div className="acciones">
          <button className="boton primario" onClick={() => alternarHecha(tarea)}>
            {hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
          </button>
          {confirmando ? (
            <div className="confirmar">
              <span>¿Borrar esta tarea con sus materiales y fotos?</span>
              <div className="confirmar-botones">
                <button className="boton" onClick={() => setConfirmando(false)}>Cancelar</button>
                <button className="boton peligro" onClick={async () => { await borrarTarea(id); nav.volver() }}>Borrar</button>
              </div>
            </div>
          ) : (
            <button className="boton-texto peligro-texto" onClick={() => setConfirmando(true)}>Borrar tarea</button>
          )}
        </div>
      </article>
      {visor && <Visor blob={visor.imagen} onCerrar={() => setVisor(null)} />}
    </main>
  )
}

function Miniatura({ blob, onClick, children }) {
  const url = useBlobUrl(blob)
  return (
    <div className="mini">
      <button className="mini-boton" onClick={onClick} aria-label="Ver foto">
        {url && <img src={url} alt="" />}
      </button>
      {children}
    </div>
  )
}

export function Visor({ blob, onCerrar }) {
  const url = useBlobUrl(blob)
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])
  return (
    <div className="visor" role="dialog" aria-label="Foto" onClick={onCerrar}>
      {url && <img src={url} alt="" />}
      <button className="visor-cerrar" aria-label="Cerrar"><IconoX /></button>
    </div>
  )
}

/* ---------- Formulario ---------- */

const UNIDADES = ['ud', 'L', 'kg', 'm', 'm²', 'rollo', 'caja', 'cartucho', 'bolsa']

function Formulario({ id, preset, nav, habitaciones }) {
  const [cargado, setCargado] = useState(!id)
  const [t, setT] = useState({
    titulo: '', notas: '', habitacionId: preset?.habitacionId ?? '', prioridad: 'media', fechaLimite: '', recFecha: '', recHora: '', repetir: '',
    aparatoId: preset?.aparatoId ?? '', quien: '', contactoId: '', tiempo: '', costo: '',
  })
  const aparatos = useLiveQuery(() => db.aparatos.orderBy('nombre').toArray(), [], [])
  const contactos = useLiveQuery(() => db.contactos.orderBy('nombre').toArray(), [], [])
  const [materiales, setMateriales] = useState([])
  const [fotos, setFotos] = useState([]) // existing {id, miniatura} and new {clave, imagen, miniatura}
  const [borradas, setBorradas] = useState([])
  const [nuevoMat, setNuevoMat] = useState({ nombre: '', cantidad: '', unidad: 'ud' })
  const [procesando, setProcesando] = useState(0)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const tarea = await db.tareas.get(id)
      if (!tarea) return nav.volver()
      setT({
        ...tarea, habitacionId: tarea.habitacionId ?? '', fechaLimite: tarea.fechaLimite ?? '',
        recFecha: tarea.recordatorio?.fecha ?? '', recHora: tarea.recordatorio?.hora ?? '',
        repetir: tarea.repetir ? `${tarea.repetir.cada}-${tarea.repetir.unidad}` : '',
        aparatoId: tarea.aparatoId ?? '', quien: tarea.quien ?? '', contactoId: tarea.contactoId ?? '', tiempo: tarea.tiempo ?? '',
        costo: tarea.costoEstimado == null ? '' : String(tarea.costoEstimado).replace('.', ','),
      })
      setMateriales(await db.materiales.where('tareaId').equals(id).toArray())
      setFotos(await db.fotos.where('tareaId').equals(id).toArray())
      setCargado(true)
    })()
  }, [id])

  const cambiar = (campo) => (e) => setT((x) => ({ ...x, [campo]: e.target.value }))

  const añadirMaterial = () => {
    const nombre = nuevoMat.nombre.trim()
    if (!nombre) return
    const cantidad = nuevoMat.cantidad === '' ? null : Number(String(nuevoMat.cantidad).replace(',', '.'))
    setMateriales((ms) => [...ms, { clave: crypto.randomUUID?.() ?? String(Math.random()), nombre, cantidad, unidad: nuevoMat.unidad, comprado: false }])
    setNuevoMat({ nombre: '', cantidad: '', unidad: nuevoMat.unidad })
  }

  const elegirFotos = async (e) => {
    const archivos = [...e.target.files]
    e.target.value = ''
    setProcesando((n) => n + archivos.length)
    for (const a of archivos) {
      try {
        const f = await prepararFoto(a)
        setFotos((fs) => [...fs, { ...f, clave: crypto.randomUUID?.() ?? String(Math.random()) }])
      } catch {
        setError('No se pudo leer una de las fotos. Prueba con otra imagen.')
      } finally {
        setProcesando((n) => n - 1)
      }
    }
  }

  const quitarFoto = (f) => {
    if (f.id) setBorradas((b) => [...b, f.id])
    setFotos((fs) => fs.filter((x) => x !== f))
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!t.titulo.trim()) return setError('Escribe un título para la tarea.')
    const costoEstimado = aNumero(t.costo)
    if (t.costo.trim() && costoEstimado == null) return setError('El costo estimado no es un número válido.')
    setGuardando(true)
    try {
      const pendienteMat = nuevoMat.nombre.trim()
        ? [{ nombre: nuevoMat.nombre.trim(), cantidad: nuevoMat.cantidad === '' ? null : Number(String(nuevoMat.cantidad).replace(',', '.')), unidad: nuevoMat.unidad, comprado: false }]
        : []
      const recordatorio = t.recFecha ? { fecha: t.recFecha, hora: t.recHora || '09:00' } : null
      const [cada, unidad] = t.repetir.split('-')
      const datos = {
        ...(id ? { id } : {}),
        recordatorio,
        repetir: t.repetir ? { cada: Number(cada), unidad } : null,
        titulo: t.titulo.trim(),
        notas: t.notas.trim(),
        habitacionId: t.habitacionId === '' ? null : Number(t.habitacionId),
        prioridad: t.prioridad,
        fechaLimite: t.fechaLimite || null,
        aparatoId: t.aparatoId === '' ? null : Number(t.aparatoId),
        quien: t.quien || null,
        contactoId: t.quien === 'pro' && t.contactoId !== '' ? Number(t.contactoId) : null,
        tiempo: t.tiempo.trim(),
        costoEstimado,
        ejemplo: false,
      }
      const nuevas = fotos.filter((f) => !f.id).map(({ imagen, miniatura, fecha }) => ({ imagen, miniatura, fecha }))
      const tareaId = await guardarTarea(datos, [...materiales, ...pendienteMat], nuevas, borradas)
      if (id) nav.volver()
      else nav.reemplazar({ pantalla: 'detalle', id: tareaId })
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar. Comprueba que el móvil tiene espacio libre.')
      setGuardando(false)
    }
  }

  if (!cargado) return <main className="pantalla"><BarraSuperior onVolver={nav.volver} /></main>

  return (
    <main className="pantalla">
      <BarraSuperior titulo={id ? 'Editar tarea' : 'Nueva tarea'} onVolver={nav.volver} />
      <form className="formulario" onSubmit={guardar} noValidate>
        <label className="campo">
          <span>Título</span>
          <input id="titulo" value={t.titulo} onChange={cambiar('titulo')} placeholder="Ej.: Cambiar bombilla del pasillo" autoFocus={!id} required />
        </label>

        <div className="campos-fila">
          <label className="campo">
            <span>Habitación</span>
            <select id="habitacion" value={String(t.habitacionId)} onChange={cambiar('habitacionId')}>
              <option value="">Sin asignar</option>
              {habitaciones.map((h) => <option key={h.id} value={String(h.id)}>{h.nombre}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Fecha límite</span>
            <input id="fecha" type="date" value={t.fechaLimite} onChange={cambiar('fechaLimite')} />
          </label>
        </div>

        {aparatos.length > 0 && (
          <label className="campo">
            <span>Aparato</span>
            <select id="aparato" value={String(t.aparatoId)} onChange={(e) => {
              const ap = aparatos.find((a) => String(a.id) === e.target.value)
              setT((x) => ({ ...x, aparatoId: e.target.value, habitacionId: x.habitacionId === '' && ap?.habitacionId != null ? ap.habitacionId : x.habitacionId }))
            }}>
              <option value="">Ninguno</option>
              {aparatos.map((a) => <option key={a.id} value={String(a.id)}>{a.nombre}</option>)}
            </select>
          </label>
        )}

        <fieldset className="campo">
          <legend>¿Quién lo hace?</legend>
          <div className="segmentado dos">
            {QUIEN.map((q) => (
              <button type="button" key={q.valor} className={`seg ${t.quien === q.valor ? 'activo' : ''}`} aria-pressed={t.quien === q.valor}
                onClick={() => setT((x) => ({ ...x, quien: x.quien === q.valor ? '' : q.valor }))}>{q.etiqueta}</button>
            ))}
          </div>
          {t.quien === 'pro' && (contactos.length > 0 ? (
            <select id="contacto" value={String(t.contactoId)} onChange={cambiar('contactoId')} aria-label="Profesional" className="separado">
              <option value="">Sin elegir todavía</option>
              {contactos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}{c.oficio ? ` · ${c.oficio}` : ''}</option>)}
            </select>
          ) : <p className="tenue pie">Guarda a tus profesionales en la pestaña Casa para elegirlos aquí.</p>)}
        </fieldset>

        <div className="campos-fila">
          <label className="campo">
            <span>Tiempo estimado</span>
            <input id="tiempo" value={t.tiempo} onChange={cambiar('tiempo')} placeholder="Ej.: 2 h" />
          </label>
          <label className="campo">
            <span>Costo estimado</span>
            <input id="costo" inputMode="decimal" value={t.costo} onChange={cambiar('costo')} placeholder="Opcional" />
          </label>
        </div>

        <fieldset className="campo">
          <legend>Recordatorio</legend>
          {t.recFecha ? (
            <div className="campos-fila recordatorio-campos">
              <input id="rec-fecha" type="date" value={t.recFecha} onChange={cambiar('recFecha')} aria-label="Día del recordatorio" />
              <div className="hora-quitar">
                <input id="rec-hora" type="time" value={t.recHora} onChange={cambiar('recHora')} aria-label="Hora del recordatorio" />
                <button type="button" className="quitar" aria-label="Quitar recordatorio" onClick={() => setT((x) => ({ ...x, recFecha: '', recHora: '' }))}><IconoX /></button>
              </div>
            </div>
          ) : (
            <button type="button" className="boton" onClick={() => setT((x) => ({ ...x, recFecha: x.fechaLimite && x.fechaLimite >= hoyISO() ? x.fechaLimite : hoyISO(1), recHora: '09:00' }))}>
              <IconoCampana /> Poner recordatorio
            </button>
          )}
          {t.recFecha && <p className="tenue pie">Después de guardar, añádelo a tu calendario desde la tarea para que el móvil te avise.</p>}
        </fieldset>

        <label className="campo">
          <span>Se repite</span>
          <select id="repetir" value={t.repetir} onChange={cambiar('repetir')}>
            <option value="">No se repite</option>
            {REPETICIONES.map((r) => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}
          </select>
          {t.repetir && <p className="tenue pie">Al marcarla como hecha se crea la siguiente con los mismos materiales.</p>}
        </label>

        <fieldset className="campo">
          <legend>Prioridad</legend>
          <div className="segmentado">
            {PRIORIDADES.map((p) => (
              <label key={p.valor} className={`seg prio-${p.valor} ${t.prioridad === p.valor ? 'activo' : ''}`}>
                <input id={`prio-${p.valor}`} type="radio" name="prioridad" value={p.valor} checked={t.prioridad === p.valor} onChange={cambiar('prioridad')} />
                {p.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="campo">
          <span>Notas</span>
          <textarea id="notas" rows={3} value={t.notas} onChange={cambiar('notas')} placeholder="Medidas, modelo, pasos a seguir…" />
        </label>

        <fieldset className="campo">
          <legend>Materiales</legend>
          {materiales.length > 0 && (
            <ul className="materiales editables">
              {materiales.map((m) => (
                <li key={m.id ?? m.clave}>
                  <span className="mat-nombre">{m.nombre}</span>
                  <span className="mat-cant">{cantidadTexto(m)}</span>
                  <button type="button" className="quitar" aria-label={`Quitar ${m.nombre}`} onClick={() => setMateriales((ms) => ms.filter((x) => x !== m))}><IconoX /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="nuevo-material">
            <input id="mat-nombre" placeholder="Material" value={nuevoMat.nombre} onChange={(e) => setNuevoMat((x) => ({ ...x, nombre: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); añadirMaterial() } }} aria-label="Nombre del material" />
            <input id="mat-cant" inputMode="decimal" placeholder="Cant." value={nuevoMat.cantidad} onChange={(e) => setNuevoMat((x) => ({ ...x, cantidad: e.target.value }))} aria-label="Cantidad" />
            <select id="mat-unidad" value={nuevoMat.unidad} onChange={(e) => setNuevoMat((x) => ({ ...x, unidad: e.target.value }))} aria-label="Unidad">
              {UNIDADES.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button type="button" className="boton pequeño" onClick={añadirMaterial}>Añadir</button>
          </div>
        </fieldset>

        <fieldset className="campo">
          <legend>Fotos</legend>
          <div className="galeria">
            {fotos.map((f) => (
              <Miniatura key={f.id ?? f.clave} blob={f.miniatura}>
                <button type="button" className="quitar-foto" aria-label="Quitar foto" onClick={() => quitarFoto(f)}><IconoX /></button>
              </Miniatura>
            ))}
            {Array.from({ length: procesando }, (_, i) => <div key={`p${i}`} className="mini cargando" />)}
          </div>
          <div className="botones-foto">
            <label className="boton">
              <IconoCamara /> Hacer foto
              <input id="foto-camara" type="file" accept="image/*" capture="environment" onChange={elegirFotos} hidden />
            </label>
            <label className="boton">
              <IconoImagen /> Elegir de la galería
              <input id="foto-galeria" type="file" accept="image/*" multiple onChange={elegirFotos} hidden />
            </label>
          </div>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="barra-guardar">
          <button type="submit" className="boton primario ancho" disabled={guardando || procesando > 0}>
            {procesando > 0 ? 'Preparando fotos…' : guardando ? 'Guardando…' : 'Guardar tarea'}
          </button>
        </div>
      </form>
    </main>
  )
}

/* ---------- Compras ---------- */

function Compras({ nav }) {
  const datos = useLiveQuery(async () => {
    const mats = await db.materiales.toArray()
    const tareas = await db.tareas.toArray()
    const porId = Object.fromEntries(tareas.map((t) => [t.id, t]))
    const grupos = new Map()
    for (const m of mats) {
      const t = porId[m.tareaId]
      if (!t || t.estado === 'hecha') continue
      if (!grupos.has(t.id)) grupos.set(t.id, { tarea: t, materiales: [] })
      grupos.get(t.id).materiales.push(m)
    }
    return [...grupos.values()].filter((g) => g.materiales.some((m) => !m.comprado))
  }, [], null)
  const total = (datos ?? []).reduce((n, g) => n + g.materiales.filter((m) => !m.comprado).length, 0)
  const compartir = async () => {
    const texto = ['🛒 Lista de compras', ...(datos ?? []).flatMap(({ tarea, materiales }) => [
      '', `*${tarea.titulo}*`,
      ...materiales.filter((m) => !m.comprado).map((m) => `• ${m.nombre}${cantidadTexto(m) ? ` (${cantidadTexto(m)})` : ''}`),
    ])].join('\n')
    if (navigator.share) {
      try { return await navigator.share({ text: texto }) } catch (e) { if (e.name === 'AbortError') return }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  return (
    <main className="pantalla con-pestanas">
      <header className="cabecera-simple">
        <h1>Compras</h1>
        <p className="tenue">{total === 1 ? '1 material por comprar' : `${total} materiales por comprar`}</p>
        {total > 0 && <button className="boton compartir" onClick={compartir}><IconoCompartir /> Compartir lista</button>}
      </header>
      {datos && datos.length === 0 && (
        <div className="vacio">
          <p className="vacio-titulo">Lista vacía.</p>
          <p>Los materiales que añadas a tus tareas aparecerán aquí.</p>
        </div>
      )}
      {(datos ?? []).map(({ tarea, materiales }) => (
        <section key={tarea.id} className="bloque compra">
          <button className="compra-tarea" onClick={() => nav.ir({ pantalla: 'detalle', id: tarea.id })}>{tarea.titulo}</button>
          <ul className="materiales">
            {materiales.map((m) => (
              <li key={m.id}>
                <label className={m.comprado ? 'comprado' : ''}>
                  <input id={`compra-${m.id}`} type="checkbox" checked={m.comprado} onChange={() => db.materiales.update(m.id, { comprado: !m.comprado })} />
                  <span className="mat-nombre">{m.nombre}</span>
                  <span className="mat-cant">{cantidadTexto(m)}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}

/* ---------- Ajustes ---------- */

function Ajustes({ habitaciones }) {
  const [nueva, setNueva] = useState('')
  const [editando, setEditando] = useState(null)
  const enUso = useLiveQuery(async () => new Set([...(await db.tareas.toArray()), ...(await db.aparatos.toArray())].map((x) => x.habitacionId)), [], new Set())
  const monedaGuardada = useMoneda()
  const ultimaCopia = useLiveQuery(async () => (await db.meta.get('ultimaCopia'))?.valor, [], null)
  const [copiaPendiente, setCopiaPendiente] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const hacerCopia = async () => {
    setOcupado(true); setMensaje(null)
    try {
      await db.meta.put({ clave: 'ultimaCopia', valor: Date.now() })
      await exportar()
    } catch (err) {
      console.error(err)
      setMensaje({ error: true, texto: 'No se pudo crear la copia.' })
    } finally { setOcupado(false) }
  }
  const elegirCopia = async (e) => {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    setMensaje(null)
    try { setCopiaPendiente(await leerCopia(archivo)) } catch (err) { setMensaje({ error: true, texto: err.message }) }
  }
  const confirmarRestaurar = async () => {
    setOcupado(true)
    try {
      await restaurar(copiaPendiente)
      setMensaje({ texto: 'Copia restaurada.' })
    } catch (err) {
      console.error(err)
      setMensaje({ error: true, texto: 'No se pudo restaurar la copia. No se cambió nada.' })
    } finally { setCopiaPendiente(null); setOcupado(false) }
  }
  const [moneda, setMoneda] = useState(null)
  const guardarMoneda = async (e) => {
    e.preventDefault()
    await db.meta.put({ clave: 'moneda', valor: (moneda ?? monedaGuardada).trim() })
    setMoneda(null)
  }

  const añadir = async (e) => {
    e.preventDefault()
    const nombre = nueva.trim()
    if (!nombre) return
    await db.habitaciones.add({ nombre })
    setNueva('')
  }
  const renombrar = async (e) => {
    e.preventDefault()
    const nombre = editando.nombre.trim()
    if (nombre) await db.habitaciones.update(editando.id, { nombre })
    setEditando(null)
  }

  return (
    <main className="pantalla con-pestanas">
      <header className="cabecera-simple"><h1>Ajustes</h1></header>
      <Nube />
      <section className="bloque">
        <h2>Habitaciones</h2>
        <ul className="habitaciones">
          {habitaciones.map((h) => (
            <li key={h.id}>
              {editando?.id === h.id ? (
                <form className="fila-form" onSubmit={renombrar}>
                  <input id={`hab-${h.id}`} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus aria-label="Nombre de la habitación" />
                  <button className="boton pequeño">Guardar</button>
                </form>
              ) : (
                <>
                  <span>{h.nombre}</span>
                  <span className="hab-acciones">
                    <button className="boton-texto" onClick={() => setEditando({ id: h.id, nombre: h.nombre })}>Renombrar</button>
                    {!enUso.has(h.id) && <button className="boton-texto peligro-texto" onClick={() => db.habitaciones.delete(h.id)}>Quitar</button>}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="fila-form" onSubmit={añadir}>
          <input id="hab-nueva" placeholder="Nueva habitación" value={nueva} onChange={(e) => setNueva(e.target.value)} aria-label="Nueva habitación" />
          <button className="boton pequeño">Añadir</button>
        </form>
        <p className="tenue pie">Solo puedes quitar habitaciones que no usa ninguna tarea ni aparato.</p>
      </section>
      <section className="bloque">
        <h2>Moneda</h2>
        <form className="fila-form" onSubmit={guardarMoneda}>
          <input id="moneda" value={moneda ?? monedaGuardada} onChange={(e) => setMoneda(e.target.value)} maxLength={5} aria-label="Símbolo de moneda" />
          <button className="boton pequeño">Guardar</button>
        </form>
        <p className="tenue pie">Se usa en los presupuestos. Ejemplos: $, €, US$.</p>
      </section>
      <section className="bloque">
        <h2>Copia de seguridad</h2>
        <p className="tenue">Además de la nube, puedes guardar una copia en un archivo y mandarla a Drive o WhatsApp.</p>
        {ultimaCopia && <p className="tenue pie">Última copia: {new Date(ultimaCopia).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        <div className="botones-foto">
          <button className="boton primario" disabled={ocupado} onClick={hacerCopia}><IconoDescargar /> Guardar copia</button>
          <label className="boton">
            Restaurar copia
            <input id="restaurar" type="file" accept="application/json,.json" onChange={elegirCopia} hidden />
          </label>
        </div>
        {copiaPendiente && (
          <div className="confirmar">
            <span>¿Reemplazar todo lo que hay ahora por la copia del {new Date(copiaPendiente.fecha).toLocaleDateString('es', { day: 'numeric', month: 'long' })} ({copiaPendiente.tablas.tareas?.length ?? 0} tareas)?</span>
            <div className="confirmar-botones">
              <button className="boton" onClick={() => setCopiaPendiente(null)}>Cancelar</button>
              <button className="boton peligro" disabled={ocupado} onClick={confirmarRestaurar}>Reemplazar</button>
            </div>
          </div>
        )}
        {mensaje && <p className={mensaje.error ? 'error' : 'tenue'} role="status">{mensaje.texto}</p>}
      </section>
    </main>
  )
}

/* ---------- Recordatorio ---------- */

function BloqueRecordatorio({ tarea, materiales, onEditar }) {
  const r = tarea.recordatorio
  const marcar = () => db.tareas.update(tarea.id, { enCalendario: `${r.fecha} ${r.hora}` })
  const yaAñadido = r && tarea.enCalendario === `${r.fecha} ${r.hora}`
  return (
    <section className="bloque">
      <h2>Recordatorio</h2>
      {!r ? (
        <p className="tenue">Sin recordatorio. <button className="enlace" onClick={onEditar}>Poner uno</button></p>
      ) : (
        <div className="tarjeta recordatorio">
          <p className="rec-cuando"><IconoCampana /> {recordatorioTexto(r)}</p>
          {yaAñadido && <p className="tenue">Ya lo añadiste al calendario.</p>}
          <div className="botones-foto">
            <a className="boton primario" href={enlaceGoogle(tarea, materiales)} target="_blank" rel="noopener" onClick={marcar}>
              <IconoCalendario /> Añadir a Google Calendar
            </a>
            <button className="boton" onClick={async () => { await abrirIcs(archivoIcs(tarea, materiales)); marcar() }}>
              Otro calendario (.ics)
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------- Presupuestos ---------- */

export function useMoneda() {
  return useLiveQuery(async () => (await db.meta.get('moneda'))?.valor ?? '$', [], '$')
}

const PRESUPUESTO_VACIO = { proveedor: '', precio: '', telefono: '', notas: '', adjunto: null }
const MAX_PDF = 15 * 1024 * 1024

function BloquePresupuestos({ tareaId, contactoPreferido }) {
  const lista = useLiveQuery(() => db.presupuestos.where('tareaId').equals(tareaId).toArray(), [tareaId], [])
  const contactos = useLiveQuery(() => db.contactos.orderBy('nombre').toArray(), [], [])
  const moneda = useMoneda()
  const [form, setForm] = useState(null) // null = closed; {id?} = adding or editing
  const [error, setError] = useState('')
  const [visor, setVisor] = useState(null)
  const [cargandoAdjunto, setCargandoAdjunto] = useState(false)

  const elegirAdjunto = async (e) => {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    if (archivo.type === 'application/pdf') {
      if (archivo.size > MAX_PDF) return setError('El PDF es muy grande (máximo 15 MB).')
      return setForm((f) => ({ ...f, adjunto: archivo, adjuntoNombre: archivo.name }))
    }
    setCargandoAdjunto(true)
    try {
      const { imagen } = await prepararFoto(archivo)
      setForm((f) => ({ ...f, adjunto: imagen, adjuntoNombre: archivo.name }))
    } catch {
      setError('No se pudo leer el archivo. Prueba con una foto o un PDF.')
    } finally { setCargandoAdjunto(false) }
  }

  const ordenados = [...lista].sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity))
  const precios = ordenados.map((p) => p.precio).filter((n) => n != null)
  const minimo = precios.length ? Math.min(...precios) : null
  const maximo = precios.length ? Math.max(...precios) : null
  const elegido = lista.find((p) => p.elegido)

  const guardar = async (e) => {
    e.preventDefault()
    const proveedor = form.proveedor.trim()
    const precio = aNumero(form.precio)
    if (!proveedor) return setError('Escribe quién te pasó el presupuesto.')
    if (form.precio.trim() && precio == null) return setError('El precio no es un número válido.')
    const fila = { proveedor, precio, telefono: form.telefono.trim(), notas: form.notas.trim(), adjunto: form.adjunto ?? null, adjuntoNombre: form.adjunto ? form.adjuntoNombre ?? '' : '' }
    if (form.id) await db.presupuestos.update(form.id, fila)
    else await db.presupuestos.add({ ...fila, tareaId, elegido: false, creado: Date.now() })
    setForm(null)
    setError('')
  }
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // Typing a saved contact's name fills in their phone.
  const cambiarProveedor = (e) => {
    const proveedor = e.target.value
    const c = contactos.find((x) => mismoNombre(x.nombre, proveedor))
    setForm((f) => ({ ...f, proveedor, telefono: c?.telefono && !f.telefono ? c.telefono : f.telefono }))
  }

  return (
    <section className="bloque">
      <h2>Presupuestos {lista.length > 0 && <span className="contador">{lista.length}</span>}</h2>

      {lista.length >= 2 && minimo != null && (
        <p className="tenue">
          {elegido?.precio != null && maximo > elegido.precio
            ? `Con ${elegido.proveedor} ahorras ${dinero(maximo - elegido.precio, moneda)} frente al más caro.`
            : maximo > minimo ? `Diferencia entre el más barato y el más caro: ${dinero(maximo - minimo, moneda)}.` : 'Todos cuestan lo mismo.'}
        </p>
      )}

      {lista.length === 0 && !form && <p className="tenue">Apunta los presupuestos que te pasen para compararlos.</p>}

      {ordenados.length > 0 && (
        <ul className="presupuestos">
          {ordenados.map((p) => (
            <li key={p.id} className={p.elegido ? 'elegido' : ''}>
              <div className="pres-cabeza">
                <span className="pres-proveedor">{p.proveedor}</span>
                <span className="pres-precio">{p.precio == null ? 'Sin precio' : dinero(p.precio, moneda)}</span>
              </div>
              {(p.elegido || (lista.length >= 2 && p.precio != null && p.precio === minimo && minimo !== maximo)) && (
                <div className="pres-marcas">
                  {p.elegido && <span className="pastilla elegido">Elegido</span>}
                  {lista.length >= 2 && p.precio === minimo && minimo !== maximo && <span className="pastilla">Más barato</span>}
                </div>
              )}
              {p.notas && <p className="pres-notas">{p.notas}</p>}
              {p.adjunto && <Adjunto blob={p.adjunto} nombre={p.adjuntoNombre} onVerFoto={() => setVisor(p.adjunto)} />}
              <div className="pres-acciones">
                <button className="boton-texto" onClick={() => elegirPresupuesto(p)}>{p.elegido ? 'Quitar elección' : 'Elegir'}</button>
                {p.telefono && <a className="boton-texto" href={`tel:${p.telefono.replace(/[^\d+]/g, '')}`}>Llamar</a>}
                <button className="boton-texto" onClick={() => setForm({ id: p.id, proveedor: p.proveedor, precio: p.precio == null ? '' : String(p.precio).replace('.', ','), telefono: p.telefono ?? '', notas: p.notas ?? '', adjunto: p.adjunto ?? null, adjuntoNombre: p.adjuntoNombre ?? '' })}>Editar</button>
                <button className="boton-texto peligro-texto" onClick={() => db.presupuestos.delete(p.id)}>Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <form className="tarjeta form-presupuesto" onSubmit={guardar} noValidate>
          <div className="campos-fila">
            <input id="pres-proveedor" list="pres-contactos" placeholder="Proveedor o persona" value={form.proveedor} onChange={cambiarProveedor} autoFocus aria-label="Proveedor" />
            <datalist id="pres-contactos">{contactos.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
            <input id="pres-precio" inputMode="decimal" placeholder={`Precio (${moneda})`} value={form.precio} onChange={campo('precio')} aria-label="Precio" />
          </div>
          <input id="pres-telefono" type="tel" placeholder="Teléfono (opcional)" value={form.telefono} onChange={campo('telefono')} aria-label="Teléfono" />
          <textarea id="pres-notas" rows={2} placeholder="Qué incluye, plazo, garantía…" value={form.notas} onChange={campo('notas')} aria-label="Notas del presupuesto" />
          {form.adjunto ? (
            <div className="adjunto-form">
              <Adjunto blob={form.adjunto} nombre={form.adjuntoNombre} onVerFoto={() => setVisor(form.adjunto)} />
              <button type="button" className="boton-texto peligro-texto" onClick={() => setForm((f) => ({ ...f, adjunto: null, adjuntoNombre: '' }))}>Quitar</button>
            </div>
          ) : (
            <div className="botones-foto">
              <label className="boton">
                <IconoCamara /> {cargandoAdjunto ? 'Preparando…' : 'Foto del presupuesto'}
                <input id="pres-foto" type="file" accept="image/*" capture="environment" onChange={elegirAdjunto} hidden />
              </label>
              <label className="boton">
                <IconoClip /> Foto o PDF guardado
                <input id="pres-archivo" type="file" accept="image/*,application/pdf" onChange={elegirAdjunto} hidden />
              </label>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="confirmar-botones">
            <button type="button" className="boton" onClick={() => { setForm(null); setError('') }}>Cancelar</button>
            <button className="boton primario" disabled={cargandoAdjunto}>{form.id ? 'Guardar' : 'Añadir'}</button>
          </div>
        </form>
      ) : (
        <button className="boton" onClick={() => setForm({ ...PRESUPUESTO_VACIO, ...(contactoPreferido && !lista.some((p) => mismoNombre(p.proveedor, contactoPreferido.nombre)) ? { proveedor: contactoPreferido.nombre, telefono: contactoPreferido.telefono ?? '' } : {}) })}><IconoMas2 /> Añadir presupuesto</button>
      )}
      {visor && <Visor blob={visor} onCerrar={() => setVisor(null)} />}
    </section>
  )
}

export function Adjunto({ blob, nombre, onVerFoto }) {
  const url = useBlobUrl(blob)
  if (!url) return null
  if (blob.type === 'application/pdf')
    return (
      <a className="adjunto-pdf" href={url} download={nombre || 'presupuesto.pdf'}>
        <IconoClip /> <span>{nombre || 'Presupuesto.pdf'}</span>
      </a>
    )
  return (
    <button className="adjunto-foto" onClick={onVerFoto} aria-label="Ver foto del presupuesto" type="button">
      <img src={url} alt="" />
    </button>
  )
}

/* ---------- Gastos ---------- */

const fmtMes = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })

function Gastos({ nav, nombreHab }) {
  const moneda = useMoneda()
  const datos = useLiveQuery(async () => {
    const tareas = Object.fromEntries((await db.tareas.toArray()).map((t) => [t.id, t]))
    const elegidos = (await db.presupuestos.toArray()).filter((p) => p.elegido && p.precio != null && tareas[p.tareaId])
    return elegidos.map((p) => ({ presupuesto: p, tarea: tareas[p.tareaId] }))
  }, [], null)

  const r = useMemo(() => {
    const gastado = [], previsto = []
    for (const x of datos ?? []) (x.tarea.estado === 'hecha' ? gastado : previsto).push(x)
    const suma = (xs) => xs.reduce((n, x) => n + x.presupuesto.precio, 0)
    const agrupar = (xs, clave) => {
      const m = new Map()
      for (const x of xs) { const k = clave(x); m.set(k, (m.get(k) ?? 0) + x.presupuesto.precio) }
      return [...m.entries()]
    }
    const porMes = agrupar(gastado, (x) => {
      const d = new Date(x.tarea.completada)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }).sort((a, b) => b[0].localeCompare(a[0]))
    const porHab = agrupar([...gastado, ...previsto], (x) => nombreHab[x.tarea.habitacionId] ?? 'Sin habitación').sort((a, b) => b[1] - a[1])
    previsto.sort((a, b) => (a.tarea.fechaLimite ?? '9999').localeCompare(b.tarea.fechaLimite ?? '9999'))
    return { gastado: suma(gastado), previsto: suma(previsto), porMes, porHab, listaPrevista: previsto }
  }, [datos, nombreHab])

  const mesTexto = (k) => {
    const [y, m] = k.split('-').map(Number)
    const t = fmtMes.format(new Date(y, m - 1, 1))
    return t.charAt(0).toUpperCase() + t.slice(1)
  }

  return (
    <main className="pantalla con-pestanas">
      <header className="cabecera-simple"><h1>Gastos</h1></header>
      {datos && datos.length === 0 ? (
        <div className="vacio">
          <p className="vacio-titulo">Todavía no hay gastos.</p>
          <p>Cuando elijas un presupuesto en una tarea, su precio aparece aquí.</p>
        </div>
      ) : (
        <>
          <div className="totales">
            <div><span className="tenue">Gastado</span><strong>{dinero(r.gastado, moneda)}</strong></div>
            <div><span className="tenue">Por pagar</span><strong>{dinero(r.previsto, moneda)}</strong></div>
          </div>
          <p className="tenue pie">Cuenta el presupuesto elegido de cada tarea. Gastado son las tareas hechas.</p>

          {r.porMes.length > 0 && (
            <section className="bloque">
              <h2>Por mes</h2>
              <Barras filas={r.porMes.map(([k, v]) => [mesTexto(k), v])} moneda={moneda} />
            </section>
          )}
          {r.porHab.length > 0 && (
            <section className="bloque">
              <h2>Por habitación</h2>
              <Barras filas={r.porHab} moneda={moneda} />
            </section>
          )}
          {r.listaPrevista.length > 0 && (
            <section className="bloque">
              <h2>Por pagar</h2>
              <ul className="materiales">
                {r.listaPrevista.map(({ tarea, presupuesto }) => (
                  <li key={presupuesto.id}>
                    <button className="fila-gasto" onClick={() => nav.ir({ pantalla: 'detalle', id: tarea.id })}>
                      <span className="mat-nombre">{tarea.titulo}<span className="tenue"> · {presupuesto.proveedor}</span></span>
                      <span className="mat-cant">{dinero(presupuesto.precio, moneda)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function Barras({ filas, moneda }) {
  const max = Math.max(...filas.map(([, v]) => v), 1)
  return (
    <ul className="barras">
      {filas.map(([etiqueta, valor]) => (
        <li key={etiqueta}>
          <div className="barra-texto"><span>{etiqueta}</span><span className="barra-valor">{dinero(valor, moneda)}</span></div>
          <div className="barra-pista"><div className="barra-relleno" style={{ width: `${Math.max(2, (valor / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

function etiquetaRepetir(r) {
  return REPETICIONES.find((x) => x.clave === `${r.cada}-${r.unidad}`)?.etiqueta ?? `Cada ${r.cada} ${r.unidad}`
}

/* ---------- Piezas comunes ---------- */

export function BarraSuperior({ titulo, onVolver, accion }) {
  return (
    <div className="barra-superior">
      <button className="volver" onClick={onVolver} aria-label="Volver"><IconoAtras /></button>
      {titulo && <span className="barra-titulo">{titulo}</span>}
      <span className="barra-accion">{accion}</span>
    </div>
  )
}

const svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
export const IconoMas = () => <svg {...svg} width={28} height={28}><path d="M12 5v14M5 12h14" /></svg>
const IconoCheck = () => <svg {...svg} width={16} height={16} strokeWidth={3}><path d="m5 12 5 5 9-10" /></svg>
const IconoX = () => <svg {...svg} width={16} height={16}><path d="M6 6l12 12M18 6 6 18" /></svg>
const IconoAtras = () => <svg {...svg}><path d="M15 5l-7 7 7 7" /></svg>
const IconoLista = () => <svg {...svg}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></svg>
const IconoCarro = () => <svg {...svg}><path d="M3 4h2l2.4 11h10.8L20 8H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>
const IconoAjustes = () => <svg {...svg}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
export const IconoCamara = () => <svg {...svg} width={18} height={18}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
export const IconoImagen = () => <svg {...svg} width={18} height={18}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-5 4 4 3-3 4 4" /></svg>
const IconoMas2 = () => <svg {...svg} width={18} height={18}><path d="M12 5v14M5 12h14" /></svg>
const IconoCampana = () => <svg {...svg} width={15} height={15}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
const IconoCalendario = () => <svg {...svg} width={18} height={18}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
const IconoGastos = () => <svg {...svg}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
const IconoRepetir = () => <svg {...svg} width={14} height={14}><path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" /></svg>
const IconoCompartir = () => <svg {...svg} width={18} height={18}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></svg>
const IconoDescargar = () => <svg {...svg} width={18} height={18}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
export const IconoClip = () => <svg {...svg} width={18} height={18}><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4L14.5 7" /></svg>
export const IconoTelefono = () => <svg {...svg} width={18} height={18}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
const IconoCasa = () => <svg {...svg}><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></svg>
