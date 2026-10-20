// Campos del formulario de fichas de cría. Cuando un campo está vacío se muestra en gris el valor
// que hereda de la ficha de la especie o del género.

import { useId, useState } from 'react'
import {
  foodKey,
  LIKING_LABELS,
  MONTH_NAMES,
  parseDayMonth,
  sourceLabel,
  toDayMonth,
  type FoodPreference,
  type Inherited,
  type Liking,
  type ResolvedFood,
} from '../care'

export interface FoodRow {
  key: string
  name: string
  liking: Liking
  /** El alimento tal como estaba guardado, con lo que pueda añadir una versión más nueva de la app. */
  saved?: FoodPreference
}

const LIKINGS: Liking[] = ['nada', 'poco', 'mucho']

export function LikingPicker({ value, onChange, label }: { value: Liking; onChange: (liking: Liking) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {LIKINGS.map((liking) => (
        <button
          key={liking}
          type="button"
          className={`segment segment-${liking}`}
          aria-pressed={value === liking}
          onClick={() => onChange(liking)}
        >
          {LIKING_LABELS[liking]}
        </button>
      ))}
    </div>
  )
}

interface FoodListFieldProps {
  label: string
  rows: FoodRow[]
  inherited: ResolvedFood[]
  suggestions: string[]
  onChange: (rows: FoodRow[]) => void
}

/**
 * Lista de alimentos con cuánto les gustan. Los heredados aparecen debajo; al tocar cuánto les
 * gusta uno, pasa a ser propio de esta ficha con ese valor.
 */
export function FoodListField({ label, rows, inherited, suggestions, onChange }: FoodListFieldProps) {
  const listId = useId()
  const own = new Set(rows.map((row) => foodKey(row.name)))
  const fromParents = inherited.filter((item) => !own.has(foodKey(item.name)))
  const update = (key: string, patch: Partial<FoodRow>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const add = (name: string, liking: Liking) => onChange([...rows, { key: crypto.randomUUID(), name, liking }])

  return (
    <div className="food-field">
      <span className="field-label">{label}</span>
      {rows.length + fromParents.length > 0 && (
        <ul className="food-list">
          {rows.map((row) => (
            <li key={row.key} className="food-row">
              <input
                className="food-name-input"
                list={listId}
                value={row.name}
                onChange={(e) => update(row.key, { name: e.target.value })}
                placeholder="Alimento"
                aria-label="Alimento"
                autoComplete="off"
              />
              <LikingPicker value={row.liking} onChange={(liking) => update(row.key, { liking })} label={`Cuánto les gusta ${row.name}`} />
              <button
                type="button"
                className="food-remove"
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                aria-label={`Quitar ${row.name || 'alimento'}`}
              >
                ×
              </button>
            </li>
          ))}
          {fromParents.map((item) => (
            <li key={`heredado-${foodKey(item.name)}`} className="food-row food-inherited">
              <span className="food-name">
                {item.name}
                <span className="from">de {sourceLabel(item.from)}</span>
              </span>
              <LikingPicker value={item.liking} onChange={(liking) => add(item.name, liking)} label={`Cuánto les gusta ${item.name}`} />
              <span className="food-remove-placeholder" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link-button" onClick={() => add('', 'mucho')}>
        ＋ Añadir alimento
      </button>
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}

interface DayMonthInputProps {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}

/** Día y mes de un periodo que se repite cada año (la diapausa). */
export function DayMonthInput({ label, value, onChange }: DayMonthInputProps) {
  const initial = parseDayMonth(value)
  const [day, setDay] = useState(initial?.day ?? 0)
  const [month, setMonth] = useState(initial?.month ?? 0)
  const daysInMonth = month ? new Date(2001, month, 0).getDate() : 31

  function change(nextDay: number, nextMonth: number) {
    const maxDay = nextMonth ? new Date(2001, nextMonth, 0).getDate() : 31
    const fixedDay = Math.min(nextDay, maxDay)
    setDay(fixedDay)
    setMonth(nextMonth)
    onChange(fixedDay && nextMonth ? toDayMonth(fixedDay, nextMonth) : undefined)
  }

  return (
    <fieldset className="field day-month">
      <legend className="field-label">{label}</legend>
      <div className="day-month-inputs">
        <select value={day} onChange={(e) => change(Number(e.target.value), month)} aria-label={`${label}: día`}>
          <option value={0}>Día</option>
          {Array.from({ length: daysInMonth }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => change(day, Number(e.target.value))} aria-label={`${label}: mes`}>
          <option value={0}>Mes</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}

interface InheritSelectProps<T extends string> {
  label: string
  value: T | undefined
  options: Record<T, string>
  inherited: Inherited<T> | undefined
  onChange: (value: T | undefined) => void
}

export function InheritSelect<T extends string>({ label, value, options, inherited, onChange }: InheritSelectProps<T>) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className={value ? '' : 'is-empty'}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      >
        <option value="">{inherited ? `${options[inherited.value]} (de ${sourceLabel(inherited.from)})` : 'Sin indicar'}</option>
        {(Object.keys(options) as T[]).map((key) => (
          <option key={key} value={key}>
            {options[key]}
          </option>
        ))}
      </select>
    </label>
  )
}

interface InheritTextProps {
  label: string
  value: string | undefined
  inherited: Inherited<string> | undefined
  example: string
  onChange: (value: string) => void
}

export function InheritText({ label, value, inherited, example, onChange }: InheritTextProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={inherited ? `${inherited.value} (de ${sourceLabel(inherited.from)})` : example}
      />
    </label>
  )
}
