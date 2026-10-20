import { useCallback, useEffect, useState } from 'react'
import { CareDetail } from './components/CareDetail'
import { CareForm, type CareFormTarget } from './components/CareForm'
import { CareView } from './components/CareView'
import { MapView } from './components/MapView'
import { ObservationForm, type FormTarget } from './components/ObservationForm'
import { ObservationList } from './components/ObservationList'
import { SettingsView } from './components/SettingsView'
import { SyncBadge } from './components/SyncBadge'
import { requestPersistentStorage } from './data'
import { useRoute, type Route } from './route'
import { startSyncService } from './sync/controller'

type Tab = Route['tab']

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: 'Mapa', icon: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14' },
  { id: 'list', label: 'Registros', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  // Un tubo de ensayo, donde empiezan muchas colonias.
  { id: 'care', label: 'Cría', icon: 'M8.5 3h7M10 3v14.5a2 2 0 0 0 4 0V3M10 12h4' },
  {
    id: 'settings',
    label: 'Ajustes',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  },
]

export default function App() {
  const [route, navigate, back] = useRoute()
  const tab = route.tab
  const [form, setForm] = useState<FormTarget | null>(null)
  const [careForm, setCareForm] = useState<CareFormTarget | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => {
    startSyncService()
    void requestPersistentStorage()
  }, [])

  const openNew = useCallback((preset?: { lat: number; lng: number }) => setForm({ mode: 'new', preset }), [])
  const openEdit = useCallback((id: string) => setForm({ mode: 'edit', id }), [])
  const closeForm = useCallback(() => setForm(null), [])
  const clearFocus = useCallback(() => setFocusId(null), [])
  const setTab = useCallback((next: Tab) => navigate({ tab: next }, { replace: true }), [navigate])
  const showOnMap = useCallback(
    (id: string) => {
      setFocusId(id)
      setTab('map')
    },
    [setTab],
  )
  const openSheet = useCallback((id: string) => navigate({ tab: 'care', sheetId: id }), [navigate])

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Formidex</span>
        </div>
        <SyncBadge onOpenSettings={() => setTab('settings')} />
      </header>

      <main className="app-main">
        {tab === 'map' && <MapView focusId={focusId} onFocusHandled={clearFocus} onNew={openNew} onEdit={openEdit} />}
        {tab === 'list' && <ObservationList onEdit={openEdit} onShowOnMap={showOnMap} onNew={() => openNew()} />}
        {route.tab === 'care' &&
          (route.sheetId ? (
            <CareDetail
              key={route.sheetId}
              id={route.sheetId}
              onBack={() => back({ tab: 'care' })}
              onOpen={openSheet}
              onEdit={(id) => setCareForm({ mode: 'edit', id })}
              onNew={setCareForm}
            />
          ) : (
            <CareView onOpen={openSheet} onNew={setCareForm} />
          ))}
        {tab === 'settings' && <SettingsView />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {careForm && (
        <CareForm
          key={careForm.mode === 'edit' ? careForm.id : 'new'}
          target={careForm}
          onClose={() => setCareForm(null)}
          onSaved={(id, created) => {
            setCareForm(null)
            if (created) openSheet(id)
          }}
          onDeleted={() => {
            setCareForm(null)
            back({ tab: 'care' })
          }}
          onOpenExisting={(id) => {
            setCareForm(null)
            openSheet(id)
          }}
        />
      )}

      {form && (
        <ObservationForm
          key={form.mode === 'edit' ? form.id : 'new'}
          target={form}
          onClose={closeForm}
          onSaved={(id) => {
            setForm(null)
            if (tab === 'map') setFocusId(id)
          }}
        />
      )}
    </div>
  )
}
