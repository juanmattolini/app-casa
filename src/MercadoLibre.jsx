import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { buscarML, enlaceBusqueda, estimar, mlActivo, mlEnlace, mlPrecios, mlPrueba, useReferencias } from './mercadolibre.js'
import { dinero } from './util.js'

// Botón "Mercado Libre" junto a cada material por comprar, y la hoja con 3 opciones.
// Los enlaces son de afiliado: siempre se dice, igual que las ofertas dicen "Auspiciado".
export function BotonML({ material, moneda }) {
  const [abierta, setAbierta] = useState(false)
  if (!mlActivo) return null
  if (mlEnlace) {
    return (
      <a className="boton-ml" href={enlaceBusqueda(material.nombre)} target="_blank" rel="noopener sponsored"
        aria-label={`Buscar ${material.nombre} en Mercado Libre (enlace de afiliado)`}>
        <IconoBolsa /> Comprar
      </a>
    )
  }
  return (
    <>
      <button type="button" className="boton-ml" onClick={() => setAbierta(true)} aria-label={`Ver ${material.nombre} en Mercado Libre`}>
        <IconoBolsa /> Comprar
      </button>
      {/* Portal: the button lives inside the materials list, whose styles would leak into the sheet. */}
      {abierta && createPortal(<HojaML material={material} moneda={moneda} onCerrar={() => setAbierta(false)} />, document.body)}
    </>
  )
}

function HojaML({ material, moneda, onCerrar }) {
  const [estado, setEstado] = useState({ cargando: true })

  useEffect(() => {
    let vivo = true
    buscarML(material.nombre)
      .then((datos) => vivo && setEstado({ datos }))
      .catch(() => vivo && setEstado({ error: true }))
    return () => { vivo = false }
  }, [material.nombre])

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const opciones = estado.datos?.opciones ?? []
  const buscarTodo = enlaceBusqueda(material.nombre)

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={`${material.nombre} en Mercado Libre`} onClick={(e) => e.stopPropagation()}>
        <div className="hoja-asa" aria-hidden="true" />
        <span className="aus">Enlace de afiliado</span>
        <h3>{material.nombre}</h3>
        {estado.cargando && <p className="tenue">Buscando en Mercado Libre…</p>}
        {estado.error && <p className="tenue">No se pudo consultar Mercado Libre. Probá de nuevo con conexión.</p>}
        {estado.datos && opciones.length === 0 && <p className="tenue">No encontramos opciones para este material.</p>}
        {opciones.length > 0 && (
          <ul className="lista-ml">
            {opciones.map((o) => (
              <li key={o.id}>
                <a className="ml-opcion" href={o.enlace} target="_blank" rel="noopener sponsored">
                  {o.foto ? <img src={o.foto} alt="" loading="lazy" /> : <span className="ml-foto-vacia" aria-hidden="true"><IconoBolsa /></span>}
                  <span className="ml-cuerpo">
                    <span className="ml-titulo">{o.titulo}</span>
                    <strong className="ml-precio">{dinero(o.precio, moneda)}</strong>
                    <span className={o.envioGratis ? 'ml-envio gratis' : 'ml-envio'}>{o.envioGratis ? 'Envío gratis' : 'Envío a cargo del comprador'}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {estado.datos?.referencia != null && (
          <p className="tenue">Precio de referencia ≈ {dinero(estado.datos.referencia, moneda)}</p>
        )}
        {mlPrueba && <p className="tenue">Modo de prueba: precios y productos simulados.</p>}
        <a className="boton ancho" href={buscarTodo} target="_blank" rel="noopener sponsored">Ver en Mercado Libre · enlace de afiliado</a>
      </div>
    </div>
  )
}

// Línea en el detalle de la tarea: "Materiales ≈ $ 58.000".
export function EstimadoMateriales({ materiales, moneda }) {
  const pendientes = useMemo(() => materiales.filter((m) => !m.comprado), [materiales])
  const refs = useReferencias(pendientes.map((m) => m.nombre))
  if (!mlPrecios || pendientes.length === 0) return null
  const { total, faltan } = estimar(pendientes, refs)
  if (total === 0) return null
  return (
    <p className="tenue estimado-ml">
      Materiales por comprar ≈ <strong>{dinero(total, moneda)}</strong>
      {faltan > 0 ? ` (sin contar ${faltan})` : ''} · referencia de Mercado Libre
    </p>
  )
}

// Bloque de Gastos: costo sugerido de los materiales de cada tarea pendiente.
export function PresupuestoSugerido({ grupos, moneda, onAbrir }) {
  const refs = useReferencias(grupos.flatMap((g) => g.materiales.map((m) => m.nombre)))
  const filas = useMemo(
    () => grupos.map((g) => ({ ...g, ...estimar(g.materiales, refs) })).filter((f) => f.total > 0),
    [grupos, refs],
  )
  if (!mlPrecios || filas.length === 0) return null
  const total = filas.reduce((n, f) => n + f.total, 0)
  return (
    <section className="bloque sugerido-ml">
      <h2>Materiales por comprar <span className="aus">Mercado Libre</span></h2>
      <ul className="materiales">
        {filas.map(({ tarea, total, faltan }) => (
          <li key={tarea.id}>
            <button className="fila-gasto" onClick={() => onAbrir(tarea.id)}>
              <span className="mat-nombre">{tarea.titulo}{faltan > 0 && <span className="tenue"> · faltan {faltan}</span>}</span>
              <span className="mat-cant">≈ {dinero(total, moneda)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="tenue pie">
        Total ≈ {dinero(total, moneda)}. Sugerido con el precio de referencia de Mercado Libre; no se suma a lo gastado.
      </p>
    </section>
  )
}

const IconoBolsa = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
)
