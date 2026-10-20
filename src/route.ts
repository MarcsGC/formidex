// Navegación con el hash de la URL (#/cria/<id>), para que el botón «atrás» del móvil vuelva a
// la pantalla anterior en vez de cerrar la app. Funciona en GitHub Pages sin configurar nada.

import { useCallback, useEffect, useState } from 'react'

export type Route = { tab: 'map' } | { tab: 'list' } | { tab: 'care'; sheetId?: string } | { tab: 'settings' }

export function parseHash(hash: string): Route {
  const [section, id] = hash.replace(/^#\/?/, '').split('/')
  switch (section) {
    case 'registros':
      return { tab: 'list' }
    case 'cria':
      return id ? { tab: 'care', sheetId: decodeURIComponent(id) } : { tab: 'care' }
    case 'ajustes':
      return { tab: 'settings' }
    default:
      return { tab: 'map' }
  }
}

export function routeUrl(route: Route): string {
  switch (route.tab) {
    case 'list':
      return '#/registros'
    case 'care':
      return route.sheetId ? `#/cria/${encodeURIComponent(route.sheetId)}` : '#/cria'
    case 'settings':
      return '#/ajustes'
    default:
      return location.pathname + location.search
  }
}

export function useRoute(): [Route, (route: Route, options?: { replace?: boolean }) => void, (fallback: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(location.hash))

  useEffect(() => {
    const sync = () => setRoute(parseHash(location.hash))
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  const navigate = useCallback((next: Route, { replace = false } = {}) => {
    if (replace) history.replaceState(null, '', routeUrl(next))
    else history.pushState({ formidex: true }, '', routeUrl(next))
    setRoute(next)
  }, [])

  // Vuelve a la pantalla anterior si la abrió la propia app; si se entró con un enlace, a fallback.
  const back = useCallback(
    (fallback: Route) => {
      if ((history.state as { formidex?: boolean } | null)?.formidex) history.back()
      else navigate(fallback, { replace: true })
    },
    [navigate],
  )

  return [route, navigate, back]
}
