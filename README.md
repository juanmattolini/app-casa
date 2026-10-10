# APP CASA

Web app instalable (PWA) para apuntar las tareas de la casa, con materiales y fotos.
Fase 1 (prototipo): lista agrupada (Vencidas, Hoy, Próximas, Sin fecha), detalle, crear/editar,
materiales con casillas, fotos comprimidas guardadas en el dispositivo (IndexedDB/Dexie),
lista de compras y habitaciones editables.

## Uso

```bash
npm install
npm run dev            # servidor local (con --host se abre desde el móvil en la misma wifi)
npm run build          # PWA instalable en dist/ (subir a GitHub Pages o Netlify)
npm run build:preview  # un único HTML en dist-preview/ para la vista previa compartible
```

Fase 2: recordatorio por tarea (día y hora) que se añade al calendario del móvil con un enlace de
Google Calendar o un archivo .ics, y comparación de presupuestos por tarea (proveedor, precio,
teléfono, notas; marca el más barato y el elegido). La moneda se cambia en Ajustes.

Además: tareas que se repiten (al marcarlas hechas se crea la siguiente), foto o PDF adjunto en cada
presupuesto, pestaña Gastos (gastado y por pagar según el presupuesto elegido, por mes y por
habitación), compartir la lista de compras y copia de seguridad en un archivo .json (Ajustes).

Los datos viven solo en el navegador del dispositivo; la copia de seguridad los guarda fuera.

## Visitas (Google Analytics)

La app cuenta las visitas con Google Analytics 4 si tiene un ID de medición. Solo se envía la visita
a la página, nunca tareas ni datos personales. Para activarlo, poner el ID `G-XXXXXXXXXX` en
`src/analitica.js` (o en la variable `VITE_GA_ID` al compilar). Sin ID no se carga nada.

## Mercado Libre (fase 1)

En Compras, cada material pendiente tiene un botón "Comprar" que muestra 3 opciones de Mercado Libre
(foto, precio y envío) con enlace de afiliado. En Gastos y en el detalle de cada tarea aparece el costo
sugerido de los materiales con el precio de referencia (mediana de los primeros resultados).

- La búsqueda la hace la Edge Function `supabase/functions/ml-buscar`: las credenciales quedan en el
  servidor y los resultados se guardan 24 h en la tabla `ml_cache` (migración `20261011000000_ml_cache.sql`).
- Secrets de la función: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_SITIO` (MLA por defecto) y
  `ML_AFILIADO` (parámetros de afiliado que se suman a cada enlace). Sin `ML_CLIENT_ID` devuelve datos simulados.
- Desplegar: `supabase functions deploy ml-buscar --no-verify-jwt` (la app la llama con la clave publicable).
- En la app se activa con `VITE_ML` al compilar: vacío = apagado, `prueba` = datos simulados en el
  dispositivo, `si` = usa la función, `enlace` = sin API: el botón abre la búsqueda en Mercado Libre con
  los parámetros de afiliado de `VITE_ML_AFILIADO` (sin precios ni presupuesto sugerido).
- Ojo (2026-10): Mercado Libre responde 403 "PolicyAgent" a `/sites/.../search` y `/products/search` con el
  token de aplicación, aunque las credenciales sean válidas. Hasta que habilite la búsqueda, usar `enlace`. También se puede probar abriendo la app con `?ml=prueba`
  (queda guardado en ese dispositivo; `?ml=no` lo apaga).
