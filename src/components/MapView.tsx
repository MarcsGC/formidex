import { useLiveQuery } from 'dexie-react-hooks'
import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, LayersControl, MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import { db, type LocalObservation } from '../db'
import { getCurrentPosition, type Position } from '../geo'
import { formatDate, isIdentified, taxonLabel } from '../model'
import { initialView, PIN_ICONS, readSavedView, saveView, TILE_LAYERS } from './mapShared'
import { PhotoThumb } from './PhotoThumb'

// Margen para que las fichas no queden debajo de los botones del mapa.
const POPUP_PADDING_TOP_LEFT = L.point(12, 64)
const POPUP_PADDING_BOTTOM_RIGHT = L.point(64, 96)

interface MapViewProps {
  focusId: string | null
  onFocusHandled: () => void
  onNew: (preset?: { lat: number; lng: number }) => void
  onEdit: (id: string) => void
}

export function MapView({ focusId, onFocusHandled, onNew, onEdit }: MapViewProps) {
  const observations = useLiveQuery(() => db.observations.filter((o) => !o.deleted).toArray(), [])
  const [map, setMap] = useState<L.Map | null>(null)
  const [me, setMe] = useState<Position | null>(null)
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const view = useMemo(() => initialView(), [])
  const fitted = useRef(false)

  // La primera vez, si no hay una vista guardada, se encuadran todos los registros.
  useEffect(() => {
    if (!map || !observations || fitted.current) return
    fitted.current = true
    if (readSavedView() || observations.length === 0) return
    const bounds = L.latLngBounds(observations.map((o) => [o.lat, o.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }, [map, observations])

  // Centrar un registro elegido desde la lista o recién guardado.
  useEffect(() => {
    if (!map || !focusId || !observations) return
    const target = observations.find((o) => o.id === focusId)
    // Un registro recién guardado puede tardar un instante en llegar de la base de datos.
    if (!target) return
    onFocusHandled()
    let opened = false
    const open = () => {
      if (opened) return
      opened = true
      markers.current.get(target.id)?.openPopup()
    }
    map.once('moveend', open)
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })
    // Por si el mapa ya estaba ahí y no llega a moverse. Sin limpieza: al marcar el foco como
    // atendido el efecto se vuelve a ejecutar y no debe cancelar la apertura.
    setTimeout(open, 1200)
  }, [map, focusId, observations, onFocusHandled])

  async function locate() {
    setLocating(true)
    setNotice(null)
    try {
      const position = await getCurrentPosition()
      setMe(position)
      map?.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="map-view">
      <MapContainer ref={setMap} center={view.center} zoom={view.zoom} className="map" zoomControl={false} worldCopyJump>
        <LayersControl position="topright">
          {Object.entries(TILE_LAYERS).map(([key, layer], index) => (
            <LayersControl.BaseLayer key={key} name={layer.name} checked={index === 0}>
              <TileLayer url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} />
            </LayersControl.BaseLayer>
          ))}
        </LayersControl>
        <MapEvents onLongPress={(lat, lng) => onNew({ lat, lng })} />
        {me && (
          <>
            {me.accuracy && me.accuracy < 2000 && (
              <Circle center={[me.lat, me.lng]} radius={me.accuracy} pathOptions={{ className: 'me-accuracy' }} />
            )}
            <CircleMarker center={[me.lat, me.lng]} radius={8} pathOptions={{ className: 'me-dot' }} />
          </>
        )}
        {observations?.map((o) => (
          <Marker
            key={o.id}
            position={[o.lat, o.lng]}
            icon={o.dirty ? PIN_ICONS.pending : isIdentified(o) ? PIN_ICONS.known : PIN_ICONS.unknown}
            ref={(marker) => {
              if (marker) markers.current.set(o.id, marker)
              else markers.current.delete(o.id)
            }}
            eventHandlers={{ popupopen: refitPopup }}
          >
            <Popup minWidth={200} maxWidth={260} autoPanPaddingTopLeft={POPUP_PADDING_TOP_LEFT} autoPanPaddingBottomRight={POPUP_PADDING_BOTTOM_RIGHT}>
              <ObservationPopup observation={o} onEdit={() => onEdit(o.id)} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-tools">
        <button type="button" className="round-button" onClick={() => map?.zoomIn()} aria-label="Acercar">
          +
        </button>
        <button type="button" className="round-button" onClick={() => map?.zoomOut()} aria-label="Alejar">
          −
        </button>
        <button type="button" className="round-button" onClick={locate} disabled={locating} aria-label="Ir a mi ubicación">
          {locating ? <span className="spinner" /> : <LocateIcon />}
        </button>
      </div>

      {notice && (
        <div className="map-notice" role="status">
          {notice}
          <button type="button" className="link-button" onClick={() => setNotice(null)}>
            Cerrar
          </button>
        </div>
      )}

      {observations && observations.length === 0 && (
        <div className="map-hint">Pulsa «Nuevo registro» o mantén pulsado el mapa para guardar una hormiga en ese punto.</div>
      )}

      <button type="button" className="fab" onClick={() => onNew()}>
        <span aria-hidden="true">＋</span> Nuevo registro
      </button>
    </div>
  )
}

// React pinta el contenido de la ficha justo después de que Leaflet la abra; se vuelve a
// medir para que el mapa se desplace y la ficha entera quede a la vista.
function refitPopup(event: L.PopupEvent) {
  const popup = event.popup
  requestAnimationFrame(() => requestAnimationFrame(() => popup.isOpen() && popup.update()))
}

function MapEvents({ onLongPress }: { onLongPress: (lat: number, lng: number) => void }) {
  const map = useMapEvents({
    contextmenu(event) {
      onLongPress(event.latlng.lat, event.latlng.lng)
    },
    moveend() {
      const center = map.getCenter()
      saveView({ center: [center.lat, center.lng], zoom: map.getZoom() })
    },
  })
  return null
}

function ObservationPopup({ observation, onEdit }: { observation: LocalObservation; onEdit: () => void }) {
  const first = observation.photos[0]
  return (
    <div className="popup">
      {first && <PhotoThumb photoId={first.id} className="popup-photo" alt={taxonLabel(observation)} />}
      <div className={`popup-title ${isIdentified(observation) ? 'taxon' : ''}`}>{taxonLabel(observation)}</div>
      <div className="popup-meta">
        {formatDate(observation.observedAt)}
        {observation.photos.length > 1 && ` · ${observation.photos.length} fotos`}
        {observation.dirty === 1 && ' · pendiente de subir'}
      </div>
      {observation.notes && <p className="popup-notes">{observation.notes}</p>}
      <button type="button" className="button button-small" onClick={onEdit}>
        Ver o editar
      </button>
    </div>
  )
}

export function LocateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  )
}
