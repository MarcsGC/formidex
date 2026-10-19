export interface Position {
  lat: number
  lng: number
  accuracy?: number
}

export function getCurrentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador no permite obtener la ubicación'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (error) => {
        const messages: Record<number, string> = {
          1: 'No hay permiso para usar la ubicación. Actívalo en el navegador.',
          2: 'No se pudo saber dónde estás. Prueba en un sitio con mejor señal.',
          3: 'La ubicación tardó demasiado. Inténtalo otra vez.',
        }
        reject(new Error(messages[error.code] ?? 'No se pudo obtener la ubicación'))
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    )
  })
}

/** Acepta "40.4168, -3.7038" o "40.4168 -3.7038", como las que copia Google Maps. */
export function parseCoordinates(text: string): Position | null {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(text)
  if (!match) return null
  const lat = Number(match[1].replace(',', '.'))
  const lng = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
