import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  Canvas,
  Path,
  Skia,
  Group,
  vec,
  RadialGradient,
  LinearGradient,
  Circle,
} from '@shopify/react-native-skia'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path as SvgPath, Text as SvgText } from 'react-native-svg'
import { X } from 'lucide-react-native'

// ─── Constantes ───────────────────────────────────────────────────────────────
const TWO_PI = Math.PI * 2
const N_FAM  = 8
const GAP    = 0.07

export const FAMILY_NAMES = [
  'VOLUME', 'INTENSITÉ', 'STRUCTURE', 'RÉCUP',
  'PERF', 'RÉGULARITÉ', 'MUSCLES', 'TEMPS',
]

export const FAMILY_NAMES_SHORT = [
  'VOL.', 'INT.', 'STRUCT.', 'RÉCUP',
  'PERF', 'RÉGUL.', 'MUSCL.', 'TEMPS',
]

export const FAMILY_ICONS = ['⚡', '🔥', '🧩', '💧', '🏆', '📈', '💪', '⏱']

// Couleurs saturées mais pas fluo — vivantes, lisibles sur fond sombre.
export const SECTOR_COLORS_HEX = [
  '#e0713a', '#d44f4f', '#7f5ec4', '#1fa8c0',
  '#d4a84a', '#34a86a', '#c0527a', '#4080cc',
]

const DIM_NAMES = [
  ['Vol. total', 'Vol. sets', 'Vol./rep', 'Vol./set', 'Tendance', 'Densité'],
  ['RPE moy.', 'Facteur int.', 'RPE pic', 'Constance', 'Int. relative'],
  ['Nb exercices', 'Sets/exercice', 'Variété', 'Score struct.', 'Rég. repos'],
  ['Repos moy.', 'Var. repos', 'Complétion', 'Qualité repos', 'Récup. est.'],
  ['Nb PRs', 'Amp. PRs', 'Force rel.', 'Prog. 1RM', 'Constance perf.'],
  ['Fréquence', 'Streak', 'Var. séances', 'Planning', 'Régularité'],
  ['Pec clav.', 'Pec sternal', 'Delt ant.', 'Delt médial', 'Delt post.',
   'Grand dorsal', 'Trapèze', 'Grand rond', 'Rhomboïdes', 'Érecteurs',
   'Biceps', 'Triceps', 'Quadriceps', 'Ischio', 'Fessiers', 'Mollets', 'Core'],
  ['Durée', 'Tempo', 'Densité', 'Efficacité', 'Timing'],
]

const EMPTY_SESSION: number[][] = [
  [0,0,0,0,0,0], [0,0,0,0,0], [0,0,0,0,0], [0,0,0,0,0],
  [0,0,0,0,0], [0,0,0,0,0], new Array(17).fill(0), [0,0,0,0,0],
]

export const MOCK_SESSION: number[][] = [
  [0.92, 0.78, 0.85, 0.71, 0.88, 0.65],
  [0.70, 0.82, 0.61, 0.75, 0.68],
  [0.55, 0.63, 0.48, 0.72, 0.58],
  [0.45, 0.52, 0.38, 0.61, 0.49],
  [0.88, 0.94, 0.77, 0.82, 0.91],
  [0.60, 0.55, 0.68, 0.52, 0.63],
  [0.72, 0.65, 0.40, 0.58, 0.30, 0.55, 0.48, 0.20, 0.25, 0.35,
   0.70, 0.60, 0.45, 0.38, 0.52, 0.42, 0.35],
  [0.42, 0.38, 0.51, 0.46, 0.35],
]

const MOCK_AVERAGE: number[][] = [
  [0.72, 0.65, 0.70, 0.58, 0.75, 0.62],
  [0.58, 0.65, 0.52, 0.61, 0.55],
  [0.50, 0.55, 0.45, 0.60, 0.48],
  [0.58, 0.62, 0.48, 0.55, 0.52],
  [0.72, 0.78, 0.65, 0.70, 0.75],
  [0.48, 0.52, 0.55, 0.45, 0.50],
  [0.60, 0.55, 0.35, 0.48, 0.28, 0.48, 0.40, 0.18, 0.22, 0.30,
   0.58, 0.50, 0.40, 0.32, 0.45, 0.38, 0.30],
  [0.45, 0.42, 0.48, 0.50, 0.38],
]

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  sessionValues?: number[][]
  averageValues?: number[][]
  size?:           number
  selectedFamily?: number | null
  onFamilySelect?: (fi: number | null) => void
  showScore?:      boolean
  showLabels?:     boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

// Centre angulaire d'un secteur (pour le zoom)
function sectorCenter(fi: number, score: number, maxR: number): { ax: number; ay: number } {
  const a = ((fi + 0.5) / N_FAM) * TWO_PI - Math.PI / 2
  const r = score * maxR * 0.55  // point au milieu radial du secteur
  return { ax: r * Math.cos(a), ay: r * Math.sin(a) }
}

// ─── Paths Skia ───────────────────────────────────────────────────────────────
const N_ARC = 48

function makeSectorPath(fi: number, score: number, cx: number, cy: number, maxR: number, nFam = N_FAM) {
  const startRad = (fi / nFam) * TWO_PI - Math.PI / 2 + GAP
  const endRad   = ((fi + 1) / nFam) * TWO_PI - Math.PI / 2 - GAP
  const r        = Math.max(score * maxR, 2)
  const path     = Skia.Path.Make()
  path.moveTo(cx, cy)
  for (let i = 0; i <= N_ARC; i++) {
    const a = startRad + (i / N_ARC) * (endRad - startRad)
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  path.close()
  return path
}


function makeGridRing(cx: number, cy: number, r: number) {
  const path = Skia.Path.Make()
  path.addCircle(cx, cy, r)
  return path
}

function makeSectorArc(fi: number, cx: number, cy: number, r: number, nFam = N_FAM) {
  const startRad = (fi / nFam) * TWO_PI - Math.PI / 2 + GAP * 0.4
  const endRad   = ((fi + 1) / nFam) * TWO_PI - Math.PI / 2 - GAP * 0.4
  const path     = Skia.Path.Make()
  path.moveTo(cx + r * Math.cos(startRad), cy + r * Math.sin(startRad))
  for (let i = 1; i <= 16; i++) {
    const a = startRad + (i / 16) * (endRad - startRad)
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return path
}

function makeAvgPath(scores: number[], cx: number, cy: number, maxR: number) {
  const N    = scores.length
  const path = Skia.Path.Make()
  let first  = true
  for (let fi = 0; fi < N; fi++) {
    const r        = scores[fi] * maxR
    const startRad = (fi / N) * TWO_PI - Math.PI / 2 + GAP
    const endRad   = ((fi + 1) / N) * TWO_PI - Math.PI / 2 - GAP
    for (let i = 0; i <= N_ARC; i++) {
      const a = startRad + (i / N_ARC) * (endRad - startRad)
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      if (first) { path.moveTo(x, y); first = false }
      else        path.lineTo(x, y)
    }
  }
  path.close()
  return path
}

function makeDivider(fi: number, cx: number, cy: number, maxR: number, nFam = N_FAM) {
  const a    = (fi / nFam) * TWO_PI - Math.PI / 2
  const path = Skia.Path.Make()
  path.moveTo(cx + 4 * Math.cos(a), cy + 4 * Math.sin(a))
  path.lineTo(cx + maxR * 1.04 * Math.cos(a), cy + maxR * 1.04 * Math.sin(a))
  return path
}

// ─── Score arc Skia — remplace SVG multi-segments (1 draw call GPU) ──────────

function buildArcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  const p = Skia.Path.Make()
  if (sweepDeg <= 0) return p
  const N = Math.max(4, Math.round(Math.abs(sweepDeg) / 4))
  const s = startDeg * (Math.PI / 180)
  const e = (startDeg + sweepDeg) * (Math.PI / 180)
  for (let i = 0; i <= N; i++) {
    const a = s + (i / N) * (e - s)
    if (i === 0) p.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    else p.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return p
}

// ─── Changement 1 : ScoreArc contextuel ──────────────────────────────────────
function ScoreArc({ score, size = 108, sw = 6, color = '#FFDD00', label }: {
  score: number; size?: number; sw?: number; color?: string; label?: string
}) {
  const cx     = size / 2
  const cy     = size / 2
  const r      = (size - sw * 3) / 2
  const START  = 150
  const TOTAL  = 240
  const filled = (score / 100) * TOTAL

  const toRad = (d: number) => d * (Math.PI / 180)
  // Gradient endpoints (matchent l'arc 150°→390°)
  const gStart = vec(cx + r * Math.cos(toRad(START)), cy + r * Math.sin(toRad(START)))
  const gEnd   = vec(cx + r * Math.cos(toRad(START + TOTAL)), cy + r * Math.sin(toRad(START + TOTAL)))

  // Gradient dynamique depuis la couleur fournie
  const [cr, cg, cb] = hexRgb(color)
  const colorMid  = `rgba(${cr},${cg},${cb},0.95)`
  const haloColor = `rgba(${cr},${cg},${cb},0.12)`

  const trackPath = useMemo(() => buildArcPath(cx, cy, r, START, TOTAL), [cx, cy, r])
  const arcSkPath = useMemo(() => buildArcPath(cx, cy, r, START, filled), [cx, cy, r, filled])

  const textColor = score === 0 ? '#4A4A5A' : color

  return (
    <View style={{ width: size, height: size * 0.72, alignSelf: 'center' }}>
      {/* Arcs GPU — un seul Canvas */}
      <Canvas style={{ width: size, height: size, position: 'absolute', top: 0 }}>
        {/* Track gris */}
        <Path path={trackPath} style="stroke" strokeWidth={sw} color="rgba(255,255,255,0.07)" strokeCap="round" />
        {/* Halo */}
        {filled > 1 && (
          <Path path={arcSkPath} style="stroke" strokeWidth={sw + 6} color={haloColor} strokeCap="round" />
        )}
        {/* Arc dégradé */}
        {filled > 1 && (
          <Path path={arcSkPath} style="stroke" strokeWidth={sw} strokeCap="round">
            <LinearGradient
              start={gStart}
              end={gEnd}
              colors={['#ffffff', colorMid, color]}
              positions={[0, 0.5, 1]}
            />
          </Path>
        )}
      </Canvas>
      {/* Texte — SVG pour rendu correct des polices */}
      <Svg
        width={size}
        height={size * 0.72}
        viewBox={`0 0 ${size} ${size}`}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0 }}
      >
        <SvgText x={cx} y={cy + 7} textAnchor="middle" fill={textColor} fontSize={size * 0.25} fontWeight="900">
          {String(score)}
        </SvgText>
        <SvgText x={cx} y={cy + size * 0.24} textAnchor="middle" fill="rgba(255,255,255,0.20)" fontSize={size * 0.08} fontWeight="700" letterSpacing={1.5}>
          {label ?? 'MYO'}
        </SvgText>
      </Svg>
    </View>
  )
}



// ─── FamilyRadar — radar des sous-dimensions d'une famille ───────────────────
function FamilyRadar({
  familyIndex, sessionVals, avgVals, color, size,
}: {
  familyIndex: number; sessionVals: number[]; avgVals: number[]
  color: string; size: number
}) {
  const N = sessionVals.length
  if (N < 2) return null
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.33
  const LABEL_R = maxR * 1.28
  const LABEL_W = 56
  const dimNames = DIM_NAMES[familyIndex] ?? []

  const gradColors = useMemo(
    () => sessionVals.map(() => [rgba(color, 0), rgba(color, 0.80)] as [string, string]),
    [color, N],
  )
  const sectorPaths = useMemo(
    () => sessionVals.map((val, i) => makeSectorPath(i, val, cx, cy, maxR, N)),
    [sessionVals, cx, cy, maxR, N],
  )
  const avgPath = useMemo(
    () => makeAvgPath(avgVals, cx, cy, maxR),
    [avgVals, cx, cy, maxR],
  )
  const gridRings = useMemo(
    () => [0.25, 0.5, 0.75, 1.0].map(t => makeGridRing(cx, cy, t * maxR)),
    [cx, cy, maxR],
  )
  const divPaths = useMemo(
    () => Array.from({ length: N }, (_, i) => makeDivider(i, cx, cy, maxR, N)),
    [N, cx, cy, maxR],
  )
  const sectorArcs = useMemo(
    () => Array.from({ length: N }, (_, i) =>
      [0.25, 0.5, 0.75].map(t => makeSectorArc(i, cx, cy, t * maxR, N))
    ),
    [N, cx, cy, maxR],
  )
  const labelPos = useMemo(
    () => Array.from({ length: N }, (_, i) => {
      const a = ((i + 0.5) / N) * TWO_PI - Math.PI / 2
      return { x: cx + LABEL_R * Math.cos(a), y: cy + LABEL_R * Math.sin(a) }
    }),
    [N, cx, cy, LABEL_R],
  )

  return (
    <View style={{ width: size }}>
      <Canvas style={{ width: size, height: size }}>
        {gridRings.map((path, i) => (
          <Path key={`fgr${i}`} path={path} style="stroke"
            strokeWidth={i === 3 ? 0.7 : 0.45}
            color={i === 3 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'} />
        ))}
        {sectorArcs.map((arcs, i) => arcs.map((path, li) => (
          <Path key={`fsa${i}_${li}`} path={path} style="stroke" strokeWidth={0.4} color="rgba(255,255,255,0.04)" />
        )))}
        {divPaths.map((path, i) => (
          <Path key={`fd${i}`} path={path} style="stroke" strokeWidth={0.65} color="rgba(255,255,255,0.06)" />
        ))}
        <Path path={avgPath} style="stroke" strokeWidth={2.5} color="rgba(90,130,210,0.12)" strokeCap="round" />
        <Path path={avgPath} style="stroke" strokeWidth={1.2} color="rgba(110,155,230,0.55)" strokeCap="round" />
        {sectorPaths.map((path, i) => (
          <Group key={`fs${i}`} opacity={0.78}>
            <Path path={path} style="fill">
              <RadialGradient c={vec(cx, cy)} r={maxR} colors={gradColors[i]} />
            </Path>
          </Group>
        ))}
        {sessionVals.map((val, i) => {
          const startRad = (i / N) * TWO_PI - Math.PI / 2 + GAP
          const endRad   = ((i + 1) / N) * TWO_PI - Math.PI / 2 - GAP
          const rimR = maxR + 4
          const rimPath = Skia.Path.Make()
          rimPath.moveTo(cx + rimR * Math.cos(startRad), cy + rimR * Math.sin(startRad))
          for (let j = 1; j <= 20; j++) {
            const a = startRad + (j / 20) * (endRad - startRad)
            rimPath.lineTo(cx + rimR * Math.cos(a), cy + rimR * Math.sin(a))
          }
          return (
            <Path key={`frim${i}`} path={rimPath} style="stroke" strokeWidth={1.8} strokeCap="round"
              color={rgba(color, 0.52 + val * 0.40)} />
          )
        })}
        <Circle cx={cx} cy={cy} r={5} color="rgba(10,10,15,0.95)" />
        <Circle cx={cx} cy={cy} r={2.5} color="rgba(255,255,255,0.20)" />
      </Canvas>
      <View style={[StyleSheet.absoluteFill, { width: size, height: size }]} pointerEvents="none">
        {labelPos.map((pos, i) => {
          const delta = Math.round((sessionVals[i] - avgVals[i]) * 100)
          const deltaColor = delta > 0 ? '#2da866' : delta < 0 ? '#b04040' : 'rgba(255,255,255,0.28)'
          return (
            <View key={i} style={[styles.labelWrap, { left: pos.x - LABEL_W / 2, top: pos.y - 12, width: LABEL_W }]}>
              <Text
                style={[styles.labelName, { color: 'rgba(255,255,255,0.55)', fontSize: 8 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {dimNames[i] ?? `D${i}`}
              </Text>
              <Text style={[styles.labelScore, { fontSize: 10 }]}>
                {Math.round(sessionVals[i] * 100)}
              </Text>
              {delta !== 0 && (
                <Text style={[styles.labelDelta, { color: deltaColor }]}>
                  {delta > 0 ? `+${delta}` : `${delta}`}
                </Text>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function MyoChart({
  sessionValues  = EMPTY_SESSION,
  averageValues  = MOCK_AVERAGE,
  size,
  selectedFamily: ext,
  onFamilySelect,
  showScore  = true,
  showLabels = true,
}: Props) {
  const { width } = Dimensions.get('window')
  const S    = size ?? width - 24
  const cx   = S / 2
  const cy   = S / 2
  const maxR = S * 0.33

  const isControlled = ext !== undefined
  const [internal, setInternal] = useState<number | null>(null)
  const sel = isControlled ? (ext ?? null) : internal

  const setFamily = useCallback((fi: number | null) => {
    if (!isControlled) setInternal(fi)
    onFamilySelect?.(fi)
  }, [isControlled, onFamilySelect])

  // ─── Scores ───────────────────────────────────────────────────────────────
  const famScores = useMemo(() =>
    sessionValues.map(f => f.length > 0 ? f.reduce((s, v) => s + v, 0) / f.length : 0),
    [sessionValues],
  )
  const avgScores = useMemo(() =>
    averageValues.map(f => f.length > 0 ? f.reduce((s, v) => s + v, 0) / f.length : 0),
    [averageValues],
  )
  const globalScore = useMemo(() =>
    Math.round(famScores.reduce((s, v) => s + v, 0) / famScores.length * 100),
    [famScores],
  )

  // ─── Paths ────────────────────────────────────────────────────────────────
  const sectorPaths = useMemo(() =>
    famScores.map((sc, fi) => makeSectorPath(fi, sc, cx, cy, maxR)),
    [famScores, cx, cy, maxR],
  )
  const avgPath = useMemo(() =>
    makeAvgPath(avgScores, cx, cy, maxR),
    [avgScores, cx, cy, maxR],
  )
  const gridRings = useMemo(() =>
    [0.25, 0.5, 0.75, 1.0].map(t => makeGridRing(cx, cy, t * maxR)),
    [cx, cy, maxR],
  )
  const sectorArcs = useMemo(() =>
    Array.from({ length: N_FAM }, (_, fi) =>
      [0.25, 0.5, 0.75].map(t => makeSectorArc(fi, cx, cy, t * maxR))
    ),
    [cx, cy, maxR],
  )
  const divPaths = useMemo(() =>
    Array.from({ length: N_FAM }, (_, fi) => makeDivider(fi, cx, cy, maxR)),
    [cx, cy, maxR],
  )
  // Gradient fill des secteurs — opacité modérée
  const gradColors = useMemo(() =>
    SECTOR_COLORS_HEX.map(h => [rgba(h, 0), rgba(h, 0.78)] as [string, string]),
    [],
  )

  // ─── Positions étiquettes ─────────────────────────────────────────────────
  const LABEL_R   = maxR * 1.30
  const LABEL_W   = 62
  const labelPos = useMemo(() =>
    Array.from({ length: N_FAM }, (_, fi) => {
      const a = ((fi + 0.5) / N_FAM) * TWO_PI - Math.PI / 2
      return { x: cx + LABEL_R * Math.cos(a), y: cy + LABEL_R * Math.sin(a) }
    }),
    [cx, cy, LABEL_R],
  )


  // ─── Tap ──────────────────────────────────────────────────────────────────
  const handleTap = useCallback((evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    const { locationX: lx, locationY: ly } = evt.nativeEvent
    const dx = lx - cx
    const dy = ly - cy
    const r  = Math.sqrt(dx * dx + dy * dy)
    if (r < 8 || r > maxR * 1.18) { setFamily(null); return }
    let a = Math.atan2(dy, dx) + Math.PI / 2
    if (a < 0) a += TWO_PI
    const fi = Math.floor(a / (TWO_PI / N_FAM)) % N_FAM
    setFamily(sel === fi ? null : fi)
  }, [cx, cy, maxR, sel, setFamily])

  const accentHex = sel !== null ? SECTOR_COLORS_HEX[sel] : '#8a8a9a'
  const famScore  = sel !== null ? famScores[sel] : 0

  // ─── Animation zoom in-place ──────────────────────────────────────────────
  const mainOpacity = useSharedValue(1)
  const mainScale   = useSharedValue(1)
  const famOpacity  = useSharedValue(0)
  const famScale    = useSharedValue(0.84)
  const famTy       = useSharedValue(16)
  const hdrOpacity  = useSharedValue(0)
  const hdrTy       = useSharedValue(10)

  // Spring légèrement élastique pour un ressenti premium
  const sSnappy  = { damping: 20, stiffness: 320 }  // sortie du main — vif
  const sElegant = { damping: 16, stiffness: 240 }  // entrée du family — légèrement rebondissant

  useEffect(() => {
    if (sel === null) {
      // Retour : fam disparaît vite, main revient avec léger rebond
      famOpacity.value  = withTiming(0,    { duration: 150 })
      famScale.value    = withSpring(0.84, sSnappy)
      famTy.value       = withSpring(16,   sSnappy)
      hdrOpacity.value  = withTiming(0,    { duration: 120 })
      hdrTy.value       = withSpring(10,   sSnappy)
      // Main arrive après un court délai (laisse le fam disparaître d'abord)
      mainOpacity.value = withTiming(1,    { duration: 240 })
      mainScale.value   = withSpring(1,    sElegant)
    } else {
      // Sélection : main part vite, fam entre avec élégance
      mainOpacity.value = withTiming(0,    { duration: 160 })
      mainScale.value   = withSpring(1.14, sSnappy)
      // Fam entre légèrement après (16ms) pour que le main soit déjà parti
      famOpacity.value  = withTiming(1,    { duration: 300 })
      famScale.value    = withSpring(1,    sElegant)
      famTy.value       = withSpring(0,    sElegant)
      hdrOpacity.value  = withTiming(1,    { duration: 260 })
      hdrTy.value       = withSpring(0,    sElegant)
    }
  }, [sel])

  const mainAnimStyle = useAnimatedStyle(() => ({
    opacity  : mainOpacity.value,
    transform: [{ scale: mainScale.value }],
  }))
  const famAnimStyle = useAnimatedStyle(() => ({
    opacity  : famOpacity.value,
    transform: [
      { scale: famScale.value },
      { translateY: famTy.value },
    ],
  }))
  const hdrAnimStyle = useAnimatedStyle(() => ({
    opacity  : hdrOpacity.value,
    transform: [{ translateY: hdrTy.value }],
  }))

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={{ width: S }}>

      {/* Zone radar — superposition main + family, même empreinte S×S */}
      <View style={{ width: S, height: S }}>

        {/* Radar 8 familles — zoom-fade OUT quand famille sélectionnée */}
        <Animated.View style={[{ width: S, height: S }, mainAnimStyle]}>
          <TouchableOpacity activeOpacity={1} onPress={handleTap} style={{ width: S, height: S }}>
            <Canvas style={{ width: S, height: S }}>
              {gridRings.map((path, i) => (
                <Path key={`gr${i}`} path={path} style="stroke"
                  strokeWidth={i === 3 ? 0.7 : 0.45}
                  color={i === 3 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'} />
              ))}
              {sectorArcs.map((arcs, fi) =>
                arcs.map((path, li) => (
                  <Path key={`sa${fi}_${li}`} path={path} style="stroke" strokeWidth={0.4}
                    color="rgba(255,255,255,0.04)" />
                ))
              )}
              {divPaths.map((path, i) => (
                <Path key={`d${i}`} path={path} style="stroke" strokeWidth={0.65} color="rgba(255,255,255,0.06)" />
              ))}
              <Path path={avgPath} style="stroke" strokeWidth={2.5} color="rgba(90,130,210,0.12)" strokeCap="round" />
              <Path path={avgPath} style="stroke" strokeWidth={1.2} color="rgba(110,155,230,0.55)" strokeCap="round" />
              {sectorPaths.map((path, fi) => (
                <Group key={`s${fi}`} opacity={0.65}>
                  <Path path={path} style="fill">
                    <RadialGradient c={vec(cx, cy)} r={maxR} colors={gradColors[fi]} />
                  </Path>
                </Group>
              ))}
              {famScores.map((sc, fi) => {
                const startRad = (fi / N_FAM) * TWO_PI - Math.PI / 2 + GAP
                const endRad   = ((fi + 1) / N_FAM) * TWO_PI - Math.PI / 2 - GAP
                const rimR = maxR + 4
                const rimPath = Skia.Path.Make()
                rimPath.moveTo(cx + rimR * Math.cos(startRad), cy + rimR * Math.sin(startRad))
                for (let i = 1; i <= 20; i++) {
                  const a = startRad + (i / 20) * (endRad - startRad)
                  rimPath.lineTo(cx + rimR * Math.cos(a), cy + rimR * Math.sin(a))
                }
                return (
                  <Path key={`rim${fi}`} path={rimPath} style="stroke" strokeWidth={1.8} strokeCap="round"
                    color={rgba(SECTOR_COLORS_HEX[fi], 0.52 + sc * 0.40)} />
                )
              })}
              <Circle cx={cx} cy={cy} r={5} color="rgba(10,10,15,0.95)" />
              <Circle cx={cx} cy={cy} r={2.5} color="rgba(255,255,255,0.20)" />
            </Canvas>
          </TouchableOpacity>

          {/* Labels familles avec delta vs moyenne */}
          {showLabels && (
            <View style={[StyleSheet.absoluteFill, { width: S, height: S }]} pointerEvents="none">
              {labelPos.map((pos, fi) => {
                const delta      = Math.round((famScores[fi] - avgScores[fi]) * 100)
                const deltaColor = delta > 0 ? '#2da866' : delta < 0 ? '#b04040' : 'rgba(255,255,255,0.28)'
                return (
                  <View key={fi} style={[styles.labelWrap, { left: pos.x - LABEL_W / 2, top: pos.y - 12, width: LABEL_W }]}>
                    <Text style={[styles.labelName, { color: 'rgba(255,255,255,0.42)' }]}
                      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {FAMILY_NAMES_SHORT[fi]}
                    </Text>
                    <Text style={[styles.labelDelta, { color: deltaColor }]}>
                      {delta > 0 ? `+${delta}` : `${delta}`}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </Animated.View>

        {/* Radar sous-dimensions — zoom-fade IN depuis même empreinte */}
        <Animated.View
          style={[StyleSheet.absoluteFill, famAnimStyle]}
          pointerEvents={sel !== null ? 'auto' : 'none'}
        >
          {sel !== null && (
            <TouchableOpacity activeOpacity={1} onPress={() => setFamily(null)} style={{ width: S, height: S }}>
              <FamilyRadar
                familyIndex={sel}
                sessionVals={sessionValues[sel] ?? []}
                avgVals={averageValues[sel] ?? []}
                color={accentHex}
                size={S}
              />
            </TouchableOpacity>
          )}
        </Animated.View>

      </View>

      {/* Bandeau famille actuelle — slide-in sous le radar */}
      <Animated.View style={[styles.famHeader, hdrAnimStyle]} pointerEvents="none">
        {sel !== null && (
          <View style={styles.famHeaderInner}>
            <Text style={[styles.famHeaderIcon]}>{FAMILY_ICONS[sel]}</Text>
            <Text style={[styles.famHeaderName, { color: accentHex }]}>{FAMILY_NAMES[sel]}</Text>
            <Text style={styles.famHeaderHint}>· tap pour revenir</Text>
          </View>
        )}
      </Animated.View>

      {/* Score arc contextuel */}
      {showScore && (
        <View style={styles.scoreRow}>
          <ScoreArc
            score={sel !== null ? Math.round(famScores[sel] * 100) : globalScore}
            size={108}
            sw={6}
            color={sel !== null ? SECTOR_COLORS_HEX[sel] : '#FFDD00'}
            label={sel !== null ? 'FAM.' : undefined}
          />
        </View>
      )}

    </View>
  )
}

const styles = StyleSheet.create({
  labelWrap: {
    position  : 'absolute',
    alignItems: 'center',
  },
  labelName: {
    fontSize     : 9,
    fontWeight   : '600',
    letterSpacing: 0.8,
    textAlign    : 'center',
    textTransform: 'uppercase',
  },
  labelScore: {
    fontSize     : 11,
    fontWeight   : '800',
    letterSpacing: -0.3,
    fontVariant  : ['tabular-nums'],
    color        : 'rgba(255,255,255,0.75)',
    marginTop    : 1,
  },
  labelDelta: {
    fontSize     : 8,
    fontWeight   : '700',
    fontVariant  : ['tabular-nums'],
    letterSpacing: -0.2,
    textAlign    : 'center',
    marginTop    : 1,
  },
  scoreRow: {
    alignItems: 'center',
    marginTop : -18,
  },
  famHeader: {
    height         : 28,
    alignItems     : 'center',
    justifyContent : 'center',
    marginTop      : 2,
  },
  famHeaderInner: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : 5,
  },
  famHeaderIcon: {
    fontSize: 11,
  },
  famHeaderName: {
    fontSize     : 10,
    fontWeight   : '700',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  famHeaderHint: {
    fontSize     : 9,
    color        : 'rgba(255,255,255,0.28)',
    letterSpacing: 0.3,
  },
  barFill: {
    height      : '100%',
    borderRadius: 2,
  },
})
