import L from 'leaflet'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { formatCoordinates, getCurrentPosition, parseCoordinates } from '../geo'
import type { LocationSource } from '../model'
import { DRAFT_ICON, initialView, TILE_LAYERS } from './mapShared'
import { LocateIcon } from './MapView'

export interface PickedLocation {
  lat: number
  lng: number
  source: LocationSource
  accuracy?: number
}

interface LocationPickerProps {
  value: PickedLocation | null
  onChange: (location: PickedLocation) => void
  /** Ubicación que traía la foto, si la había. */
  photoLocation: { lat: number; lng: number } | null
}

const SOURCE_LABELS: Record<LocationSource, string> = {
  gps: 'Tu ubicación actual',
  exif: 'Sacada de la foto',
  map: 'Elegida en el mapa',
}

export function LocationPicker({ value, onChange, photoLocation }: LocationPickerProps) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [satellite, setSatellite] = useState(false)
  const [start] = useState(() => (value ? { center: [value.lat, value.lng] as [number, number], zoom: 15 } : initialView()))
  const layer = satellite ? TILE_LAYERS.satellite : TILE_LAYERS.map

  async function useMyLocation() {
    setLocating(true)
    setError(null)
    try {
      const position = await getCurrentPosition()
      onChange({ lat: position.lat, lng: position.lng, accuracy: position.accuracy, source: 'gps' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocating(false)
    }
  }

  function applyPasted() {
    const parsed = parseCoordinates(pasted)
    if (!parsed) {
      setError('No entiendo esas coordenadas. Usa el formato 40.4168, -3.7038')
      return
    }
    setError(null)
    setPasted('')
    onChange({ ...parsed, source: 'map' })
  }

  return (
    <div className="location-picker">
      <div className="picker-map-wrap">
        <MapContainer center={start.center} zoom={start.zoom} className="picker-map" attributionControl={false}>
          <TileLayer key={layer.url} url={layer.url} maxZoom={layer.maxZoom} />
          <PickerEvents value={value} onPick={(lat, lng) => onChange({ lat, lng, source: 'map' })} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={DRAFT_ICON}
              draggable
              eventHandlers={{
                dragend(event) {
                  const { lat, lng } = (event.target as L.Marker).getLatLng()
                  onChange({ lat, lng, source: 'map' })
                },
              }}
            />
          )}
        </MapContainer>
        <button type="button" className="picker-layer" onClick={() => setSatellite((s) => !s)}>
          {satellite ? 'Mapa' : 'Satélite'}
        </button>
      </div>

      <div className="picker-status">
        {value ? (
          <>
            <strong>{SOURCE_LABELS[value.source]}</strong>
            <span className="muted">
              {formatCoordinates(value.lat, value.lng)}
              {value.accuracy ? ` · ±${Math.round(value.accuracy)} m` : ''}
            </span>
          </>
        ) : (
          <span className="muted">Toca el mapa para marcar dónde la viste, o usa uno de los botones.</span>
        )}
      </div>

      <div className="button-row">
        <button type="button" className="button button-secondary" onClick={useMyLocation} disabled={locating}>
          {locating ? <span className="spinner" /> : <LocateIcon />} Mi ubicación
        </button>
        {photoLocation && (
          <button type="button" className="button button-secondary" onClick={() => onChange({ ...photoLocation, source: 'exif' })}>
            📷 La de la foto
          </button>
        )}
      </div>

      <div className="paste-row">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Pegar coordenadas (40.4168, -3.7038)"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyPasted()
            }
          }}
          aria-label="Coordenadas"
        />
        <button type="button" className="button button-secondary" onClick={applyPasted} disabled={!pasted.trim()}>
          Usar
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

function PickerEvents({ value, onPick }: { value: PickedLocation | null; onPick: (lat: number, lng: number) => void }) {
  const map = useMap()
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  // Si la ubicación llega de la foto, del GPS o de unas coordenadas, se centra el mapa en ella.
  useEffect(() => {
    if (!value || (value.source === 'map' && map.getBounds().contains([value.lat, value.lng]))) return
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15))
  }, [map, value])
  return null
}
