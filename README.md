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
