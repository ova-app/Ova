import { getDB } from '@/lib/db'

export interface Prediction {
  exerciseId: string
  exerciseName: string
  predictedPR: number   // kg
  daysUntilPR: number
  confidence: number    // 0-1
  delta: number         // kg au-dessus du record actuel
}

interface RawSet {
  weight_kg: number
  reps: number
  logged_at: number     // UNIX ms
}

function epley1RM(weight_kg: number, reps: number): number {
  return reps === 1 ? weight_kg : weight_kg * (1 + reps / 30)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MIN_POINTS = 4
const MIN_CONFIDENCE = 0.6
const MAX_EXTRAPOLATION_DAYS = 120

// Pondération : 1.0 aujourd'hui → 0.3 à 180j, plancher 0.1 au-delà (décroissance linéaire puis plancher)
function weight(loggedAt: number, now: number): number {
  const ageDays = (now - loggedAt) / MS_PER_DAY
  if (ageDays <= 180) return Math.max(0.3, 1.0 - (0.7 * ageDays) / 180)
  return 0.1
}

// Régression linéaire pondérée : y = slope × x + intercept
// x = jours depuis now (valeurs négatives), y = weight_kg
function weightedLinearRegression(
  xs: number[],
  ys: number[],
  ws: number[],
): { slope: number; intercept: number } | null {
  const sw = ws.reduce((a, b) => a + b, 0)
  if (sw === 0) return null

  const swx = xs.reduce((a, x, i) => a + ws[i] * x, 0)
  const swy = ys.reduce((a, y, i) => a + ws[i] * y, 0)
  const swxx = xs.reduce((a, x, i) => a + ws[i] * x * x, 0)
  const swxy = xs.reduce((a, x, i) => a + ws[i] * x * ys[i], 0)

  const denom = sw * swxx - swx * swx
  if (Math.abs(denom) < 1e-10) return null

  const slope = (sw * swxy - swx * swy) / denom
  const intercept = (swy - slope * swx) / sw
  return { slope, intercept }
}

// R² pondéré — mesure la qualité du fit
function weightedR2(
  xs: number[],
  ys: number[],
  ws: number[],
  slope: number,
  intercept: number,
): number {
  const sw = ws.reduce((a, b) => a + b, 0)
  const meanY = ys.reduce((a, y, i) => a + ws[i] * y, 0) / sw
  const ssTot = ys.reduce((a, y, i) => a + ws[i] * (y - meanY) ** 2, 0)
  if (ssTot < 1e-10) return 0
  const ssRes = xs.reduce((a, x, i) => a + ws[i] * (ys[i] - (slope * x + intercept)) ** 2, 0)
  return Math.max(0, 1 - ssRes / ssTot)
}

// Confiance composée : R² × facteur fréquence × facteur points
function computeConfidence(
  r2: number,
  nPoints: number,
  recentSessionCount: number,
  fatigueFactor: number,
): number {
  const pointsFactor = Math.min(1, nPoints / 15)
  const freqFactor = Math.min(1, recentSessionCount / 4)
  return r2 * 0.55 * pointsFactor * 0.25 * freqFactor * 0.20 * fatigueFactor
}

export async function computePrediction(
  exerciseId: string,
  exerciseName: string,
): Promise<Prediction | null> {
  try {
    const db = getDB()
    const now = Date.now()
    const cutoff7d = now - 7 * MS_PER_DAY

    const rows = await db.getAllAsync<RawSet>(
      `SELECT weight_kg, reps, logged_at
       FROM local_sets
       WHERE exercise_id = ? AND weight_kg > 0 AND reps > 0
       ORDER BY logged_at ASC`,
      exerciseId,
    )

    if (rows.length < MIN_POINTS) return null

    // Dédupliquer par jour — garder le meilleur 1RM Epley du jour
    const byDay = new Map<number, number>()
    for (const r of rows) {
      const dayKey = Math.floor(r.logged_at / MS_PER_DAY)
      const rm = epley1RM(r.weight_kg, r.reps)
      byDay.set(dayKey, Math.max(byDay.get(dayKey) ?? 0, rm))
    }
    const points = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0])

    if (points.length < MIN_POINTS) return null

    const todayDay = Math.floor(now / MS_PER_DAY)
    const xs = points.map(([d]) => d - todayDay)  // jours relatifs (≤ 0)
    const ys = points.map(([, rm]) => rm)          // 1RM Epley estimé
    const ws = points.map(([d]) => weight(d * MS_PER_DAY, now))

    const reg = weightedLinearRegression(xs, ys, ws)
    if (!reg || reg.slope <= 0) return null  // pas de progression → pas de prédiction

    const r2 = weightedR2(xs, ys, ws, reg.slope, reg.intercept)

    // Record actuel = meilleur 1RM Epley historique
    const currentMax1RM = Math.max(...ys)

    // Jours à extrapoler pour dépasser le 1RM actuel
    const daysUntilPR = Math.ceil((currentMax1RM - reg.intercept) / reg.slope)
    if (daysUntilPR <= 0 || daysUntilPR > MAX_EXTRAPOLATION_DAYS) return null

    // 1RM prédit → convertir en poids réel pour 1 rep (le PR affiché = le 1RM lui-même)
    const predicted1RM = reg.slope * daysUntilPR + reg.intercept

    // Fréquence récente (sessions distinctes sur 7j)
    const recent7d = await db.getAllAsync<{ cnt: number }>(
      `SELECT COUNT(DISTINCT session_id) as cnt
       FROM local_sets
       WHERE exercise_id = ? AND logged_at >= ?`,
      exerciseId,
      cutoff7d,
    )
    const recentSessionCount = recent7d[0]?.cnt ?? 0

    // Volume 7j vs volume 30j normalisé (indicateur fatigue)
    const vol7d = await db.getAllAsync<{ v: number }>(
      `SELECT SUM(volume) as v FROM local_sets WHERE exercise_id = ? AND logged_at >= ?`,
      exerciseId, cutoff7d,
    )
    const vol30d = await db.getAllAsync<{ v: number }>(
      `SELECT SUM(volume) as v FROM local_sets WHERE exercise_id = ? AND logged_at >= ?`,
      exerciseId, now - 30 * MS_PER_DAY,
    )
    const v7 = vol7d[0]?.v ?? 0
    const v30 = vol30d[0]?.v ?? 1
    // Fatigue : surcharge récente → confiance réduite
    const fatigueFactor = v30 > 0 ? Math.max(0.5, 1 - Math.max(0, (v7 / (v30 / 4)) - 1) * 0.3) : 1

    const confidence = computeConfidence(r2, points.length, recentSessionCount, fatigueFactor)
    if (confidence < MIN_CONFIDENCE) return null

    return {
      exerciseId,
      exerciseName,
      predictedPR: Math.round(predicted1RM * 4) / 4,  // arrondi 0.25 kg — affiché comme 1RM estimé
      daysUntilPR,
      confidence: Math.min(1, confidence),
      delta: Math.round((predicted1RM - currentMax1RM) * 10) / 10,
    }
  } catch {
    return null
  }
}
