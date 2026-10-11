import { PERFIL_ML, RECOMENDADOS } from './recomendados.js'

// "Recomendados por Juan": productos elegidos a mano, con enlace de afiliado (se dice, igual que "Auspiciado").
export default function Recomendados() {
  if (!PERFIL_ML && RECOMENDADOS.length === 0) return null
  return (
    <section className="bloque ofertas recomendados" aria-label="Recomendados por Juan en Mercado Libre">
      <h2>Recomendados por Juan <span className="aus">Enlace de afiliado</span></h2>
      {RECOMENDADOS.length > 0 && (
        <ul className="lista-ofertas">
          {RECOMENDADOS.map((r) => (
            <li key={r.enlace}>
              <a className="oferta-tarjeta" href={r.enlace} target="_blank" rel="noopener sponsored">
                <span className="oferta-cuerpo">
                  <span className="oferta-titulo">{r.titulo}</span>
                  {r.nota && <span className="oferta-meta">{r.nota}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {PERFIL_ML && (
        <a className="boton ancho" href={PERFIL_ML} target="_blank" rel="noopener sponsored">
          {RECOMENDADOS.length > 0 ? 'Ver todos en Mercado Libre' : 'Ver mis recomendados en Mercado Libre'}
        </a>
      )}
    </section>
  )
}
