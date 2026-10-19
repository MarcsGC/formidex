// Sugerencias de género y especie: los nombres que ya usas, una lista de géneros frecuentes
// (funciona sin conexión) y, con conexión, el catálogo de GBIF filtrado a la familia Formicidae.

const GBIF_SUGGEST = 'https://api.gbif.org/v1/species/suggest'
const GBIF_BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c'
const FORMICIDAE_KEY = '4342'

export const COMMON_GENERA = [
  'Acromyrmex',
  'Aphaenogaster',
  'Atta',
  'Bothriomyrmex',
  'Camponotus',
  'Cardiocondyla',
  'Cataglyphis',
  'Colobopsis',
  'Crematogaster',
  'Dolichoderus',
  'Formica',
  'Goniomma',
  'Hypoponera',
  'Iberoformica',
  'Lasius',
  'Lepisiota',
  'Leptothorax',
  'Linepithema',
  'Liometopum',
  'Messor',
  'Monomorium',
  'Myrmecina',
  'Myrmica',
  'Oecophylla',
  'Oxyopomyrmex',
  'Pheidole',
  'Plagiolepis',
  'Pogonomyrmex',
  'Polyergus',
  'Polyrhachis',
  'Ponera',
  'Proformica',
  'Rossomyrmex',
  'Solenopsis',
  'Stenamma',
  'Strongylognathus',
  'Tapinoma',
  'Temnothorax',
  'Tetramorium',
]

interface GbifSuggestion {
  canonicalName?: string
  rank?: string
  family?: string
}

/** Géneros que empiezan por lo escrito. */
export async function suggestGenera(query: string, known: string[], signal?: AbortSignal): Promise<string[]> {
  const q = query.trim()
  const local = filterPrefix(unique([...known, ...COMMON_GENERA]), q)
  if (q.length < 2) return local.slice(0, 20)
  const remote = await gbifSuggest(q, 'GENUS', signal)
  return unique([...local, ...remote]).slice(0, 20)
}

/** Epítetos de especie para un género, que empiezan por lo escrito. */
export async function suggestSpecies(genus: string, query: string, known: string[], signal?: AbortSignal): Promise<string[]> {
  const g = genus.trim()
  if (!g) return []
  const local = filterPrefix(unique(known), query.trim())
  const remote = (await gbifSuggest(`${g} ${query.trim()}`.trim(), 'SPECIES', signal))
    .filter((name) => name.toLowerCase().startsWith(`${g.toLowerCase()} `))
    .map((name) => name.split(' ')[1])
    .filter((epithet): epithet is string => Boolean(epithet))
  return unique([...local, ...remote]).slice(0, 30)
}

async function gbifSuggest(q: string, rank: 'GENUS' | 'SPECIES', signal?: AbortSignal): Promise<string[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return []
  const base = { q, rank, datasetKey: GBIF_BACKBONE, limit: '50' }
  // Primero se pide solo dentro de Formicidae; si GBIF no acepta ese filtro, se filtra aquí.
  for (const params of [{ ...base, higherTaxonKey: FORMICIDAE_KEY }, base]) {
    try {
      const response = await fetch(`${GBIF_SUGGEST}?${new URLSearchParams(params)}`, { signal })
      if (!response.ok) continue
      const results = (await response.json()) as GbifSuggestion[]
      return results
        .filter((r) => r.rank === rank && r.canonicalName && (r.family ? r.family === 'Formicidae' : 'higherTaxonKey' in params))
        .map((r) => r.canonicalName!)
    } catch {
      return []
    }
  }
  return []
}

function filterPrefix(names: string[], prefix: string): string[] {
  const p = prefix.toLowerCase()
  return names.filter((name) => name.toLowerCase().startsWith(p)).sort((a, b) => a.localeCompare(b))
}

function unique(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}
