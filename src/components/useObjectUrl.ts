import { useEffect, useState } from 'react'

/** URL temporal para mostrar un Blob en un <img>; se libera al cambiar o desmontar. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    // La URL es un recurso del navegador que hay que liberar, por eso se crea aquí y no al renderizar.
    // oxlint-disable-next-line react/set-state-in-effect
    setEntry({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return entry && entry.blob === blob ? entry.url : undefined
}
