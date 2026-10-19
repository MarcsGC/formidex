import L from 'leaflet'
import { DEFAULT_MAP_VIEW } from '../config'

export const TILE_LAYERS = {
  map: {
    name: 'Mapa',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    name: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
} as const

function pin(kind: 'known' | 'unknown' | 'pending'): L.DivIcon {
  return L.divIcon({
    className: 'pin',
    html: `<span class="pin-body pin-${kind}"><span class="pin-dot"></span></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  })
}

export const PIN_ICONS = {
  known: pin('known'),
  unknown: pin('unknown'),
  pending: pin('pending'),
}

export const DRAFT_ICON = L.divIcon({
  className: 'pin',
  html: '<span class="pin-body pin-draft"><span class="pin-dot"></span></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
})

const VIEW_KEY = 'formidex.mapView'

export interface SavedView {
  center: [number, number]
  zoom: number
}

export function readSavedView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (!raw) return null
    const view = JSON.parse(raw) as SavedView
    if (!Array.isArray(view.center) || typeof view.zoom !== 'number') return null
    return view
  } catch {
    return null
  }
}

export function saveView(view: SavedView): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view))
  } catch {
    // No es imprescindible recordar la vista.
  }
}

export function initialView(): SavedView {
  return readSavedView() ?? { center: DEFAULT_MAP_VIEW.center, zoom: DEFAULT_MAP_VIEW.zoom }
}
