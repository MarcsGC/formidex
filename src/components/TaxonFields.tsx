import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { db } from '../db'
import { suggestGenera, suggestSpecies } from '../taxa'

interface TaxonFieldsProps {
  genus: string
  species: string
  onChange: (genus: string, species: string) => void
  /** Hasta dónde es obligatorio (en las fichas de género y de especie). */
  required?: 'genus' | 'species'
  /** Las fichas de género no llevan especie. */
  genusOnly?: boolean
}

interface KnownNames {
  genera: string[]
  species: Map<string, string[]>
}

export function TaxonFields({ genus, species, onChange, required, genusOnly = false }: TaxonFieldsProps) {
  const genusListId = useId()
  const speciesListId = useId()
  const known = useLiveQuery(loadKnownNames, [])
  const [genusOptions, setGenusOptions] = useState<string[]>([])
  const [speciesOptions, setSpeciesOptions] = useState<string[]>([])
  const hasGenus = genus.trim() !== ''

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void suggestGenera(genus, known?.genera ?? [], controller.signal).then((options) => {
        if (!controller.signal.aborted) setGenusOptions(options)
      })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [genus, known])

  useEffect(() => {
    const g = genus.trim()
    if (!g) return
    const controller = new AbortController()
    const knownSpecies = known?.species.get(g.toLowerCase()) ?? []
    const timer = setTimeout(() => {
      void suggestSpecies(g, species, knownSpecies, controller.signal).then((options) => {
        if (!controller.signal.aborted) setSpeciesOptions(options)
      })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [genus, species, known])

  // Si se escribe el nombre completo en el campo del género, se separa en los dos campos.
  function splitBinomial() {
    const parts = genus.trim().split(/\s+/)
    if (!genusOnly && parts.length >= 2 && !species.trim()) onChange(parts[0], parts.slice(1).join(' '))
  }

  return (
    <div className={`taxon-fields ${genusOnly ? 'taxon-fields-single' : ''}`}>
      <label className="field">
        <span className="field-label">Género</span>
        <input
          list={genusListId}
          value={genus}
          onChange={(e) => onChange(e.target.value, e.target.value.trim() ? species : '')}
          onBlur={splitBinomial}
          placeholder={required ? 'p. ej. Messor' : 'Opcional, p. ej. Messor'}
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
        />
        <datalist id={genusListId}>
          {genusOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      {!genusOnly && (
        <label className="field">
          <span className="field-label">Especie</span>
          <input
            list={speciesListId}
            value={species}
            onChange={(e) => onChange(genus, e.target.value)}
            disabled={!hasGenus}
            placeholder={hasGenus ? (required === 'species' ? 'p. ej. barbarus' : 'Opcional, p. ej. barbarus') : 'Primero el género'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
          />
          <datalist id={speciesListId}>
            {(hasGenus ? speciesOptions : []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      )}
    </div>
  )
}

// Nombres ya usados en registros y fichas de cría.
async function loadKnownNames(): Promise<KnownNames> {
  const genera = new Set<string>()
  const species = new Map<string, string[]>()
  const add = (t: { genus?: string; species?: string; deleted?: boolean }) => {
    if (t.deleted || !t.genus) return
    genera.add(t.genus)
    if (!t.species) return
    const key = t.genus.toLowerCase()
    const list = species.get(key) ?? []
    if (!list.includes(t.species)) list.push(t.species)
    species.set(key, list)
  }
  await db.observations.each(add)
  await db.sheets.each(add)
  return { genera: [...genera], species }
}
