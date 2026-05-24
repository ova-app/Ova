// ─── Formatage volume avec espace milliers (fr-FR style) ──────────────────────
// Source: dupliqué depuis feed.tsx / history.tsx pour testabilité

export function formatVolume(kg: number | null): string {
  if (kg == null) return '—'
  const rounded = Math.round(kg)
  if (rounded >= 1000) {
    const thousands = Math.floor(rounded / 1000)
    const rest = rounded % 1000
    return `${thousands} ${rest.toString().padStart(3, '0')}`
  }
  return `${rounded}`
}
