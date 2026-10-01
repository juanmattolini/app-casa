// Compress a picked photo to a JPEG of at most `max` px on its longest side.
async function redimensionar(archivo, max, calidad) {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' }).catch(() => null)
  const fuente = bitmap ?? (await cargarImagen(archivo))
  const escala = Math.min(1, max / Math.max(fuente.width, fuente.height))
  const w = Math.round(fuente.width * escala)
  const h = Math.round(fuente.height * escala)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(fuente, 0, 0, w, h)
  bitmap?.close?.()
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', calidad))
}

function cargarImagen(archivo) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = URL.createObjectURL(archivo)
  })
}

export async function prepararFoto(archivo) {
  const [imagen, miniatura] = await Promise.all([
    redimensionar(archivo, 1600, 0.82),
    redimensionar(archivo, 320, 0.7),
  ])
  return { imagen, miniatura, fecha: Date.now() }
}
