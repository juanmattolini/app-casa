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

Los datos viven solo en el navegador del dispositivo. La copia de seguridad y los recordatorios por
calendario (.ics) llegan en la fase 2.
