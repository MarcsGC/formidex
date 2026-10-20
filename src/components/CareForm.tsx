import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AMOUNT_LABELS,
  CARB_SUGGESTIONS,
  describeDiapause,
  findTaxonSheet,
  FOUNDING_LABELS,
  parentsOf,
  PROTEIN_SUGGESTIONS,
  QUEENS_LABELS,
  resolveCare,
  sameName,
  sheetTitle,
  sourceLabel,
  type CareParams,
  type CareSheet,
  type Diapause,
  type FoodPreference,
  type SheetLevel,
} from '../care'
import { deleteSheet, saveSheet, type PhotoItem } from '../data'
import { db } from '../db'
import { formatDateTime, normalizeTaxon } from '../model'
import { DayMonthInput, FoodListField, InheritSelect, InheritText, type FoodRow } from './CareFields'
import { PhotoField } from './PhotoField'
import { TaxonFields } from './TaxonFields'

export type CareFormTarget = { mode: 'new'; level: SheetLevel; genus?: string; species?: string } | { mode: 'edit'; id: string }

interface CareFormProps {
  target: CareFormTarget
  onClose: () => void
  onSaved: (id: string, created: boolean) => void
  onDeleted: () => void
  /** Ya hay una ficha de ese género o especie: se abre en vez de crear otra. */
  onOpenExisting: (id: string) => void
}

type DiapauseMode = '' | 'period' | 'none'
type Period = { start?: string; end?: string; temperature?: string }

const toRows = (list: FoodPreference[] | undefined): FoodRow[] =>
  (list ?? []).map((f) => ({ key: crypto.randomUUID(), name: f.name, liking: f.liking, saved: f }))
const fromRows = (rows: FoodRow[]): FoodPreference[] => rows.map(({ name, liking, saved }) => ({ ...saved, name, liking }))

export function CareForm({ target, onClose, onSaved, onDeleted, onOpenExisting }: CareFormProps) {
  const editingId = target.mode === 'edit' ? target.id : undefined
  const sheets = useLiveQuery(() => db.sheets.filter((s) => !s.deleted).toArray(), [])

  const [loading, setLoading] = useState(Boolean(editingId))
  const [level, setLevel] = useState<SheetLevel>(target.mode === 'new' ? target.level : 'colony')
  const [genus, setGenus] = useState(target.mode === 'new' ? (target.genus ?? '') : '')
  const [species, setSpecies] = useState(target.mode === 'new' ? (target.species ?? '') : '')
  const [name, setName] = useState('')
  const [startedAt, setStartedAt] = useState('')
  const [origin, setOrigin] = useState('')
  const [archived, setArchived] = useState(false)
  const [params, setParams] = useState<CareParams>({})
  const [diapauseMode, setDiapauseMode] = useState<DiapauseMode>('')
  const [period, setPeriod] = useState<Period>({})
  // Diapausa de un tipo que esta versión no conoce: se conserva mientras no se cambie aquí.
  const [otherDiapause, setOtherDiapause] = useState<Diapause | undefined>()
  const [carbs, setCarbs] = useState<FoodRow[]>([])
  const [proteins, setProteins] = useState<FoodRow[]>([])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<PhotoItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<CareSheet | null>(null)
  const [meta, setMeta] = useState<{ createdAt: string; pending: boolean } | null>(null)
  const changed = useRef(false)

  useEffect(() => {
    if (!editingId) return
    let cancelled = false
    void db.sheets.get(editingId).then((s) => {
      if (cancelled) return
      if (!s || s.deleted) {
        setError('Esta ficha ya no existe. Puede que se borrara desde otro dispositivo.')
        return
      }
      const { diapause, carbs: carbList, proteins: proteinList, ...rest } = s.params
      setLevel(s.level)
      setGenus(s.genus ?? '')
      setSpecies(s.species ?? '')
      setName(s.name ?? '')
      setStartedAt(s.startedAt ?? '')
      setOrigin(s.origin ?? '')
      setArchived(Boolean(s.archived))
      setParams(rest)
      if (diapause?.kind === 'none' || diapause?.kind === 'period') setDiapauseMode(diapause.kind)
      else setOtherDiapause(diapause)
      setPeriod(diapause?.kind === 'period' ? { start: diapause.start, end: diapause.end, temperature: diapause.temperature } : {})
      setCarbs(toRows(carbList))
      setProteins(toRows(proteinList))
      setNotes(s.notes ?? '')
      setItems(s.photos.map((ref) => ({ kind: 'existing', ref })))
      setMeta({ createdAt: s.createdAt, pending: s.dirty === 1 })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [editingId])

  const taxon = normalizeTaxon(genus, level === 'genus' ? '' : species)
  const parents = useMemo(
    () => (sheets ? parentsOf({ level, genus: taxon.genus, species: taxon.species, id: editingId }, sheets) : []),
    [sheets, level, taxon.genus, taxon.species, editingId],
  )
  const inherited = useMemo(() => resolveCare(parents), [parents])

  const suggestedName = useMemo(() => {
    if (level !== 'colony') return ''
    const base = taxon.genus ? (taxon.species ? `${taxon.genus.charAt(0)}. ${taxon.species}` : taxon.genus) : 'Colonia'
    const used = new Set((sheets ?? []).filter((s) => s.level === 'colony' && s.id !== editingId).map((s) => (s.name ?? '').toLowerCase()))
    let n = 1
    while (used.has(`${base} ${n}`.toLowerCase())) n++
    return `${base} ${n}`
  }, [level, taxon.genus, taxon.species, sheets, editingId])

  const foodSuggestions = useMemo(() => {
    const used = (key: 'carbs' | 'proteins') => (sheets ?? []).flatMap((s) => (s.params[key] ?? []).map((f) => f.name))
    const unique = (names: string[]) => [...new Map(names.map((n) => [n.toLowerCase(), n])).values()]
    return { carbs: unique([...used('carbs'), ...CARB_SUGGESTIONS]), proteins: unique([...used('proteins'), ...PROTEIN_SUGGESTIONS]) }
  }, [sheets])

  function touch() {
    changed.current = true
  }

  function setParam<K extends keyof CareParams>(key: K, value: CareParams[K]) {
    touch()
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  function close() {
    if (changed.current && !window.confirm('¿Salir sin guardar los cambios?')) return
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function save() {
    setExisting(null)
    if (level !== 'colony' && !taxon.genus) {
      setError('Escribe el género.')
      return
    }
    if (level === 'species' && !taxon.species) {
      setError('Escribe la especie.')
      return
    }
    const duplicate = level !== 'colony' && sheets ? findTaxonSheet(sheets, level, taxon.genus, taxon.species, editingId) : undefined
    if (duplicate) {
      setExisting(duplicate)
      setError(`Ya tienes una ficha de ${sheetTitle(duplicate)}.`)
      return
    }
    // Al cambiar el género, sus fichas de especie pasan al nuevo: no puede haber allí otra igual.
    const before = editingId && level === 'genus' ? sheets?.find((s) => s.id === editingId) : undefined
    if (before && sheets && !sameName(before.genus, taxon.genus)) {
      for (const moving of sheets.filter((s) => s.level === 'species' && sameName(s.genus, before.genus))) {
        const clash = findTaxonSheet(sheets, 'species', taxon.genus, moving.species)
        if (clash) {
          setExisting(clash)
          setError(
            `Ya tienes una ficha de ${sheetTitle(clash)} y la de ${sheetTitle(moving)} pasaría a llamarse igual. Borra o corrige una de las dos antes de cambiar el género.`,
          )
          return
        }
      }
    }

    setSaving(true)
    setError(null)
    const diapause: Diapause | undefined =
      diapauseMode === 'none' ? { kind: 'none' } : diapauseMode === 'period' ? { kind: 'period', ...period } : otherDiapause
    try {
      const id = await saveSheet(
        editingId,
        {
          level,
          ...taxon,
          name: name.trim() || suggestedName,
          startedAt,
          origin,
          archived,
          params: { ...params, diapause, carbs: fromRows(carbs), proteins: fromRows(proteins) },
          notes,
        },
        items,
      )
      changed.current = false
      onSaved(id, !editingId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  async function remove() {
    if (!editingId) return
    const all = sheets ?? []
    const heirs = all.filter((s) => s.id !== editingId && parentsOf(s, all).some((p) => p.id === editingId)).length
    const message =
      level === 'colony'
        ? '¿Borrar esta colonia y sus fotos? También se borrará de Google Drive.'
        : heirs > 0
          ? `¿Borrar esta ficha? ${heirs === 1 ? 'Hay 1 ficha que hereda de ella y dejará' : `Hay ${heirs} fichas que heredan de ella y dejarán`} de hacerlo.`
          : '¿Borrar esta ficha y sus fotos? También se borrará de Google Drive.'
    if (!window.confirm(message)) return
    await deleteSheet(editingId)
    changed.current = false
    onDeleted()
  }

  const title = editingId ? (level === 'colony' ? 'Editar colonia' : 'Editar ficha') : level === 'colony' ? 'Nueva colonia' : 'Nueva ficha'
  const parentNames = parents.map(sourceLabel)

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="care-form-title">
        <header className="sheet-header">
          <button type="button" className="link-button" onClick={close}>
            Cancelar
          </button>
          <h2 id="care-form-title">{title}</h2>
          <button type="button" className="button button-small" onClick={save} disabled={saving || processing || loading}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </header>

        {loading ? (
          <div className="sheet-body sheet-loading">
            {error ? <p className="form-error">{error}</p> : <span className="spinner spinner-large" />}
          </div>
        ) : (
          <div className="sheet-body">
            {target.mode === 'new' && level !== 'colony' && (
              <div className="segmented segmented-wide" role="group" aria-label="Tipo de ficha">
                {(['species', 'genus'] as const).map((l) => (
                  <button key={l} type="button" className="segment" aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l === 'species' ? 'Ficha de especie' : 'Ficha de género'}
                  </button>
                ))}
              </div>
            )}

            <section className="form-section">
              <h3>{level === 'colony' ? 'Colonia' : 'Identificación'}</h3>
              {level === 'colony' && (
                <label className="field">
                  <span className="field-label">Nombre</span>
                  <input
                    value={name}
                    onChange={(e) => {
                      touch()
                      setName(e.target.value)
                    }}
                    placeholder={suggestedName}
                  />
                </label>
              )}
              <TaxonFields
                genus={genus}
                species={species}
                onChange={(g, s) => {
                  touch()
                  setGenus(g)
                  setSpecies(s)
                }}
                required={level === 'colony' ? undefined : level}
                genusOnly={level === 'genus'}
              />
              {level === 'colony' && (
                <div className="field-pair">
                  <label className="field">
                    <span className="field-label">Desde</span>
                    <input
                      type="date"
                      value={startedAt}
                      onChange={(e) => {
                        touch()
                        setStartedAt(e.target.value)
                      }}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Origen</span>
                    <input
                      value={origin}
                      onChange={(e) => {
                        touch()
                        setOrigin(e.target.value)
                      }}
                      placeholder="Vuelo nupcial, tienda…"
                    />
                  </label>
                </div>
              )}
              {parentNames.length > 0 && (
                <p className="hint">
                  Lo que dejes vacío lo hereda de {parentNames.length === 1 ? 'la ficha' : 'las fichas'} de {parentNames.join(' y ')}, y se ve en
                  gris.
                </p>
              )}
            </section>

            <section className="form-section">
              <h3>Fotos</h3>
              <PhotoField items={items} setItems={setItems} onChanged={touch} onError={setError} onBusyChange={setProcessing} />
            </section>

            <section className="form-section">
              <h3>Diapausa</h3>
              <label className="field">
                <span className="field-label">¿Hace diapausa?</span>
                <select
                  className={diapauseMode ? '' : 'is-empty'}
                  value={diapauseMode}
                  onChange={(e) => {
                    touch()
                    setDiapauseMode(e.target.value as DiapauseMode)
                    setOtherDiapause(undefined)
                  }}
                >
                  <option value="">
                    {inherited.diapause
                      ? `${describeDiapause(inherited.diapause.value)} (de ${sourceLabel(inherited.diapause.from)})`
                      : 'Sin indicar'}
                  </option>
                  <option value="period">Sí</option>
                  <option value="none">No necesita</option>
                </select>
              </label>
              {diapauseMode === 'period' && (
                <>
                  <div className="field-pair">
                    <DayMonthInput
                      label="Empieza"
                      value={period.start}
                      onChange={(start) => {
                        touch()
                        setPeriod((p) => ({ ...p, start }))
                      }}
                    />
                    <DayMonthInput
                      label="Termina"
                      value={period.end}
                      onChange={(end) => {
                        touch()
                        setPeriod((p) => ({ ...p, end }))
                      }}
                    />
                  </div>
                  <label className="field">
                    <span className="field-label">Temperatura en diapausa</span>
                    <input
                      value={period.temperature ?? ''}
                      onChange={(e) => {
                        touch()
                        setPeriod((p) => ({ ...p, temperature: e.target.value }))
                      }}
                      placeholder="p. ej. 8–12 °C"
                    />
                  </label>
                </>
              )}
            </section>

            <section className="form-section">
              <h3>Alimentación</h3>
              <FoodListField
                label="Carbohidratos"
                rows={carbs}
                inherited={inherited.carbs}
                suggestions={foodSuggestions.carbs}
                onChange={(rows) => {
                  touch()
                  setCarbs(rows)
                }}
              />
              <FoodListField
                label="Proteínas"
                rows={proteins}
                inherited={inherited.proteins}
                suggestions={foodSuggestions.proteins}
                onChange={(rows) => {
                  touch()
                  setProteins(rows)
                }}
              />
            </section>

            <section className="form-section">
              <h3>Cuidados</h3>
              <InheritSelect
                label="Capacidad de escape"
                value={params.escape}
                options={AMOUNT_LABELS}
                inherited={inherited.escape}
                onChange={(v) => setParam('escape', v)}
              />
              <div className="field-pair">
                <InheritText
                  label="Temperatura"
                  value={params.temperature}
                  inherited={inherited.temperature}
                  example="p. ej. 24–28 °C"
                  onChange={(v) => setParam('temperature', v)}
                />
                <InheritSelect
                  label="Humedad"
                  value={params.humidity}
                  options={AMOUNT_LABELS}
                  inherited={inherited.humidity}
                  onChange={(v) => setParam('humidity', v)}
                />
              </div>
              <InheritText
                label="Nido"
                value={params.nest}
                inherited={inherited.nest}
                example="p. ej. yeso, acrílico o tierra"
                onChange={(v) => setParam('nest', v)}
              />
            </section>

            <section className="form-section">
              <h3>Biología</h3>
              <div className="field-pair">
                <InheritText
                  label="Tamaño de la reina"
                  value={params.queenSize}
                  inherited={inherited.queenSize}
                  example="p. ej. 12–14 mm"
                  onChange={(v) => setParam('queenSize', v)}
                />
                <InheritText
                  label="Tamaño de las obreras"
                  value={params.workerSize}
                  inherited={inherited.workerSize}
                  example="p. ej. 3–12 mm"
                  onChange={(v) => setParam('workerSize', v)}
                />
              </div>
              <div className="field-pair">
                <InheritSelect
                  label="Fundación"
                  value={params.founding}
                  options={FOUNDING_LABELS}
                  inherited={inherited.founding}
                  onChange={(v) => setParam('founding', v)}
                />
                <InheritSelect
                  label="Reinas"
                  value={params.queens}
                  options={QUEENS_LABELS}
                  inherited={inherited.queens}
                  onChange={(v) => setParam('queens', v)}
                />
              </div>
            </section>

            <section className="form-section">
              <h3>Notas</h3>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => {
                  touch()
                  setNotes(e.target.value)
                }}
                aria-label="Notas"
                placeholder={level === 'colony' ? 'Población, puesta, cambios de nido…' : 'Consejos de cría, comportamiento…'}
              />
            </section>

            {error && (
              <div className="form-error" role="alert">
                {error}
                {existing && (
                  <button type="button" className="link-button" onClick={() => onOpenExisting(existing.id)}>
                    Abrir esa ficha
                  </button>
                )}
              </div>
            )}

            {editingId && (
              <section className="form-section form-footer">
                {level === 'colony' && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={archived}
                      onChange={(e) => {
                        touch()
                        setArchived(e.target.checked)
                      }}
                    />
                    Archivada: ya no la tengo
                  </label>
                )}
                {meta && (
                  <p className="muted">
                    Creada el {formatDateTime(meta.createdAt)} · {meta.pending ? 'pendiente de subir a Drive' : 'guardada en Drive'}
                  </p>
                )}
                <button type="button" className="button button-danger" onClick={remove}>
                  {level === 'colony' ? 'Borrar colonia' : 'Borrar ficha'}
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
