// Preparación de fotos: lee la ubicación y la fecha del EXIF y guarda dos JPEG,
// uno grande para ver detalles y una miniatura para el mapa y las listas.

// Versión ligera de exifr: JPEG y HEIC con EXIF y GPS, que es todo lo que hace falta aquí.
import exifr from 'exifr/dist/lite.esm.mjs'
import { newId } from './model'

const FULL_MAX_SIDE = 2560
const FULL_QUALITY = 0.88
const THUMB_MAX_SIDE = 400
const THUMB_QUALITY = 0.75

export interface PhotoExif {
  lat?: number
  lng?: number
  takenAt?: string
}

export interface ProcessedPhoto {
  id: string
  full: Blob
  thumb: Blob
  width: number
  height: number
  exif: PhotoExif
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const exif = await readExif(file)
  const image = await decodeImage(file)
  try {
    const full = await resizeToJpeg(image.source, image.width, image.height, FULL_MAX_SIDE, FULL_QUALITY)
    const thumb = await resizeToJpeg(image.source, image.width, image.height, THUMB_MAX_SIDE, THUMB_QUALITY)
    return { id: newId(), full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, exif }
  } finally {
    image.close()
  }
}

export async function readExif(file: Blob): Promise<PhotoExif> {
  let data: { latitude?: number; longitude?: number; DateTimeOriginal?: Date; CreateDate?: Date } | undefined
  try {
    // La versión ligera no admite elegir etiquetas sueltas, así que se leen los bloques EXIF y GPS enteros.
    data = await exifr.parse(file, { tiff: true, ifd1: false, xmp: false })
  } catch {
    return {}
  }
  const result: PhotoExif = {}
  const { latitude, longitude } = data ?? {}
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  ) {
    result.lat = latitude
    result.lng = longitude
  }
  const date = data?.DateTimeOriginal ?? data?.CreateDate
  if (date instanceof Date && !Number.isNaN(date.getTime())) result.takenAt = date.toISOString()
  return result
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    // Algunos navegadores no aceptan opciones o el formato: se prueba con una <img>.
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('No se pudo abrir la imagen. Si es HEIC, conviértela a JPG o súbela desde el móvil.')
  }
}

async function resizeToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite procesar imágenes')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('No se pudo comprimir la imagen')
  return { blob, width: w, height: h }
}
