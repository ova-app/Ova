import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dimensions,
  ScrollView,
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
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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

const FAMILY_NAMES_SHORT = [
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

function makeSectorPath(fi: number, score: number, cx: number, cy: number, maxR: number) {
  const startRad = (fi / N_FAM) * TWO_PI - Math.PI / 2 + GAP
  const endRad   = ((fi + 1) / N_FAM) * TWO_PI - Math.PI / 2 - GAP
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

// Anneau-couche pour une dimension (arc plein entre innerR et r)
function makeDimArc(fi: number, score: number, cx: number, cy: number, maxR: number, innerR: number) {
  const startRad = (fi / N_FAM) * TWO_PI - Math.PI / 2 + GAP * 1.8
  const endRad   = ((fi + 1) / N_FAM) * TWO_PI - Math.PI / 2 - GAP * 1.8
  const r        = Math.max(score * maxR, 2)
  const path     = Skia.Path.Make()
  path.moveTo(cx + r * Math.cos(startRad), cy + r * Math.sin(startRad))
  for (let i = 1; i <= 16; i++) {
    const a = startRad + (i / 16) * (endRad - startRad)
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  for (let i = 16; i >= 0; i--) {
    const a = startRad + (i / 16) * (endRad - startRad)
    path.lineTo(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a))
  }
  path.close()
  return path
}

function makeGridRing(cx: number, cy: number, r: number) {
  const path = Skia.Path.Make()
  path.addCircle(cx, cy, r)
  return path
}

function makeSectorArc(fi: number, cx: number, cy: number, r: number) {
  const startRad = (fi / N_FAM) * TWO_PI - Math.PI / 2 + GAP * 0.4
  const endRad   = ((fi + 1) / N_FAM) * TWO_PI - Math.PI / 2 - GAP * 0.4
  const path     = Skia.Path.Make()
  path.moveTo(cx + r * Math.cos(startRad), cy + r * Math.sin(startRad))
  for (let i = 1; i <= 16; i++) {
    const a = startRad + (i / 16) * (endRad - startRad)
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return path
}

function makeAvgPath(scores: number[], cx: number, cy: number, maxR: number) {
  const path = Skia.Path.Make()
  let first  = true
  for (let fi = 0; fi < N_FAM; fi++) {
    const r        = scores[fi] * maxR
    const startRad = (fi / N_FAM) * TWO_PI - Math.PI / 2 + GAP
    const endRad   = ((fi + 1) / N_FAM) * TWO_PI - Math.PI / 2 - GAP
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

function makeDivider(fi: number, cx: number, cy: number, maxR: number) {
  const a    = (fi / N_FAM) * TWO_PI - Math.PI / 2
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

function ScoreArc({ score, size = 108, sw = 6 }: { score: number; size?: number; sw?: number }) {
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

  const trackPath = useMemo(() => buildArcPath(cx, cy, r, START, TOTAL), [cx, cy, r])
  const arcSkPath = useMemo(() => buildArcPath(cx, cy, r, START, filled), [cx, cy, r, filled])

  const textColor = score === 0 ? '#4A4A5A' : '#FFDD00'

  return (
    <View style={{ width: size, height: size * 0.72, alignSelf: 'center' }}>
      {/* Arcs GPU — un seul Canvas */}
      <Canvas style={{ width: size, height: size, position: 'absolute', top: 0 }}>
        {/* Track gris */}
        <Path path={trackPath} style="stroke" strokeWidth={sw} color="rgba(255,255,255,0.07)" strokeCap="round" />
        {/* Halo */}
        {filled > 1 && (
          <Path path={arcSkPath} style="stroke" strokeWidth={sw + 6} color="rgba(255,221,0,0.12)" strokeCap="round" />
        )}
        {/* Arc dégradé doré */}
        {filled > 1 && (
          <Path path={arcSkPath} style="stroke" strokeWidth={sw} strokeCap="round">
            <LinearGradient
              start={gStart}
              end={gEnd}
              colors={['#ffffff', '#ffe566', '#FFDD00']}
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
          MYO
        </SvgText>
      </Svg>
    </View>
  )
}

// ─── Barre animée RN ─────────────────────────────────────────────────────────
function AnimatedBar({ val, color, progress }: {
  val: number; color: string; progress: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => ({
    width: `${Math.round(val * 100 * progress.value)}%` as `${number}%`,
  }))
  return <Animated.View style={[styles.barFill, { backgroundColor: color }, style]} />
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
  // Paths des dimensions du secteur sélectionné
  const dimPaths = useMemo(() => {
    if (sel === null) return []
    const dims = sessionValues[sel] ?? []
    return dims.map((val, i) => {
      const outerR = Math.max(val * maxR, 2)
      const innerR = Math.max(0, outerR - (maxR / dims.length) * 0.5)
      return makeDimArc(sel, val, cx, cy, maxR, innerR)
    })
  }, [sel, sessionValues, cx, cy, maxR])

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

  // ─── ZOOM CAMÉRA — translation vers le centroïde du secteur ──────────────
  // Quand on sélectionne fi, on "avance" vers ce secteur en décalant
  // le canvas dans la direction opposée (comme si la caméra se rapprochait).
  // La caméra se déplace de ~28% du rayon vers le secteur + scale 1.55×.
  const ZOOM_SCALE     = 1.55
  const ZOOM_TRANSLATE = maxR * 0.42   // déplacement du centre vers le secteur

  const camScale = useSharedValue(1)
  const camTx    = useSharedValue(0)
  const camTy    = useSharedValue(0)

  const springCam = { damping: 30, stiffness: 300 }

  useEffect(() => {
    if (sel === null) {
      camScale.value = withSpring(1,    springCam)
      camTx.value    = withSpring(0,    springCam)
      camTy.value    = withSpring(0,    springCam)
    } else {
      // Centre angulaire du secteur sélectionné
      const a   = ((sel + 0.5) / N_FAM) * TWO_PI - Math.PI / 2
      // On translate dans la direction du secteur (avance = décale le contenu
      // dans la direction du secteur, ce qui revient à translater le canvas
      // de la même valeur — le viewport suit)
      const tx  = Math.cos(a) * ZOOM_TRANSLATE
      const ty  = Math.sin(a) * ZOOM_TRANSLATE
      camScale.value = withSpring(ZOOM_SCALE, springCam)
      camTx.value    = withSpring(tx,         springCam)
      camTy.value    = withSpring(ty,         springCam)
    }
  }, [sel])

  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -camTx.value },
      { translateY: -camTy.value },
      { scale: camScale.value },
      // Re-translate pour zoomer depuis le centroïde du secteur plutôt que
      // le coin supérieur gauche du canvas
      { translateX: camTx.value },
      { translateY: camTy.value },
    ],
  }))

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

  // ─── Panneau détail ───────────────────────────────────────────────────────
  const panelOpacity    = useSharedValue(0)
  const panelTranslateY = useSharedValue(14)
  const barProgress     = useSharedValue(0)
  const panelAnim       = useAnimatedStyle(() => ({
    opacity  : panelOpacity.value,
    transform: [{ translateY: panelTranslateY.value }],
  }))

  useEffect(() => {
    if (sel === null) {
      panelOpacity.value = withTiming(0, { duration: 160 })
      return
    }
    panelTranslateY.value = 14
    panelOpacity.value    = 0
    barProgress.value     = 0
    panelTranslateY.value = withSpring(0, { damping: 18, stiffness: 300 })
    panelOpacity.value    = withTiming(1, { duration: 220, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    barProgress.value     = withDelay(100, withTiming(1, { duration: 540, easing: Easing.bezier(0.16, 1, 0.3, 1) }))
  }, [sel])

  const accentHex = sel !== null ? SECTOR_COLORS_HEX[sel] : '#8a8a9a'
  const famScore  = sel !== null ? famScores[sel] : 0

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={{ width: S }}>

      {/* Zone de tap */}
      <TouchableOpacity activeOpacity={1} onPress={handleTap} style={{ width: S, height: S }}>
        {/*
          Wrapper clip fixe pour que le canvas zoomé ne déborde pas.
          Le canvas est plus grand que S pour absorber la translation.
        */}
        <View style={{ width: S, height: S, overflow: 'hidden' }}>
          <Animated.View style={[{ width: S, height: S }, canvasAnimStyle]}>
            <Canvas style={{ width: S, height: S }}>

              {/* Anneaux grille */}
              {gridRings.map((path, i) => (
                <Path
                  key={`gr${i}`}
                  path={path}
                  style="stroke"
                  strokeWidth={i === 3 ? 0.7 : 0.45}
                  color={i === 3 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'}
                />
              ))}

              {/* Ticks arc par secteur */}
              {sectorArcs.map((arcs, fi) =>
                arcs.map((path, li) => (
                  <Path
                    key={`sa${fi}_${li}`}
                    path={path}
                    style="stroke"
                    strokeWidth={sel === fi ? 0.9 : 0.4}
                    color={sel === fi
                      ? rgba(SECTOR_COLORS_HEX[fi], 0.38)
                      : 'rgba(255,255,255,0.04)'}
                  />
                ))
              )}

              {/* Diviseurs */}
              {divPaths.map((path, i) => (
                <Path key={`d${i}`} path={path} style="stroke" strokeWidth={0.65} color="rgba(255,255,255,0.06)" />
              ))}

              {/* Contour moyenne — visible */}
              <Path path={avgPath} style="stroke" strokeWidth={2.5} color="rgba(90,130,210,0.12)" strokeCap="round" />
              <Path path={avgPath} style="stroke" strokeWidth={1.2} color="rgba(110,155,230,0.55)" strokeCap="round" />

              {/* Secteurs */}
              {sectorPaths.map((path, fi) => {
                const isSelected = sel === fi
                const isDimmed   = sel !== null && !isSelected
                return (
                  <Group key={`s${fi}`} opacity={isDimmed ? 0.08 : isSelected ? 0.90 : 0.65}>
                    <Path path={path} style="fill">
                      <RadialGradient c={vec(cx, cy)} r={maxR} colors={gradColors[fi]} />
                    </Path>
                    {isSelected && (
                      <Path path={path} style="stroke" strokeWidth={1.2} color={rgba(SECTOR_COLORS_HEX[fi], 0.85)} />
                    )}
                  </Group>
                )
              })}

              {/* Variables dim dans le secteur (couches concentriques) */}
              {sel !== null && dimPaths.map((path, i) => {
                const val = sessionValues[sel]?.[i] ?? 0
                if (val < 0.04) return null
                return (
                  <Group key={`dim${i}`} opacity={0.40 + val * 0.45}>
                    <Path path={path} style="fill">
                      <RadialGradient
                        c={vec(cx, cy)}
                        r={maxR}
                        colors={[rgba(SECTOR_COLORS_HEX[sel], val * 0.95), rgba(SECTOR_COLORS_HEX[sel], 0)]}
                      />
                    </Path>
                  </Group>
                )
              })}

              {/* Rim extérieur par secteur */}
              {famScores.map((sc, fi) => {
                const startRad = (fi / N_FAM) * TWO_PI - Math.PI / 2 + GAP
                const endRad   = ((fi + 1) / N_FAM) * TWO_PI - Math.PI / 2 - GAP
                const rimR     = maxR + 4
                const rimPath  = Skia.Path.Make()
                rimPath.moveTo(cx + rimR * Math.cos(startRad), cy + rimR * Math.sin(startRad))
                for (let i = 1; i <= 20; i++) {
                  const a = startRad + (i / 20) * (endRad - startRad)
                  rimPath.lineTo(cx + rimR * Math.cos(a), cy + rimR * Math.sin(a))
                }
                const isDimmed = sel !== null && sel !== fi
                return (
                  <Path
                    key={`rim${fi}`}
                    path={rimPath}
                    style="stroke"
                    strokeWidth={sel === fi ? 2.5 : 1.8}
                    strokeCap="round"
                    color={isDimmed
                      ? rgba(SECTOR_COLORS_HEX[fi], 0.10)
                      : rgba(SECTOR_COLORS_HEX[fi], 0.52 + sc * 0.40)}
                  />
                )
              })}

              {/* Centre */}
              <Circle cx={cx} cy={cy} r={5} color="rgba(10,10,15,0.95)" />
              <Circle cx={cx} cy={cy} r={2.5} color="rgba(255,255,255,0.20)" />

            </Canvas>
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Labels — hors du clip, positionnés absolument sur le canvas réel */}
      {showLabels && (
        <View
          style={[StyleSheet.absoluteFill, { width: S, height: S }]}
          pointerEvents="none"
        >
          {labelPos.map((pos, fi) => {
            const isSelected = sel === fi
            const isDimmed   = sel !== null && !isSelected
            return (
              <View
                key={fi}
                style={[
                  styles.labelWrap,
                  {
                    left   : pos.x - LABEL_W / 2,
                    top    : pos.y - 12,
                    width  : LABEL_W,
                    opacity: isDimmed ? 0.12 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.labelName,
                    { color: isSelected ? '#d4d4d4' : 'rgba(255,255,255,0.42)' },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {FAMILY_NAMES_SHORT[fi]}
                </Text>
                {isSelected && (
                  <Text style={styles.labelScore}>
                    {Math.round(famScores[fi] * 100)}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}

      {/* Score arc */}
      {showScore && (
        <View style={styles.scoreRow}>
          <ScoreArc score={globalScore} size={108} sw={6} />
        </View>
      )}

      {/* Panneau détail */}
      {sel !== null && (
        <Animated.View
          style={[styles.panel, { borderColor: rgba(accentHex, 0.20) }, panelAnim]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.panelAccentBar, { backgroundColor: accentHex }]} />

          <View style={styles.panelHeader}>
            <View style={styles.panelTitleRow}>
              <Text style={styles.panelIcon}>{FAMILY_ICONS[sel]}</Text>
              <Text style={[styles.panelTitle, { color: '#d4d4d4' }]}>
                {FAMILY_NAMES[sel]}
              </Text>
            </View>
            <View style={styles.famScoreRow}>
              <View style={[styles.famScoreTrack, { backgroundColor: rgba(accentHex, 0.10) }]}>
                <AnimatedBar val={famScore} color={accentHex} progress={barProgress} />
              </View>
              <Text style={[styles.famScoreVal, { color: '#c8c8c8' }]}>
                {Math.round(famScore * 100)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setFamily(null)}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={14} color="rgba(255,255,255,0.40)" />
            </TouchableOpacity>
          </View>

          {/* Dims — layout adaptatif : 1 col si ≤6, 2 cols si >6 */}
          <ScrollView
            style={styles.dimsScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {sel !== null && DIM_NAMES[sel].length > 6 ? (
              // 2 colonnes pour les familles denses (muscles = 17 dims)
              <View style={styles.dimGrid}>
                {DIM_NAMES[sel].map((name, i) => {
                  const val    = sessionValues[sel]?.[i] ?? 0
                  const avgVal = averageValues[sel]?.[i] ?? 0
                  const delta  = val - avgVal
                  const above  = delta > 0.05
                  const below  = delta < -0.05
                  const barColor = val < 0.04 ? 'rgba(255,255,255,0.10)' : above ? '#3dbf7a' : below ? '#cc5555' : accentHex
                  return (
                    <View key={i} style={[styles.dimCell, val < 0.04 && { opacity: 0.32 }]}>
                      <Text style={styles.dimCellName} numberOfLines={1}>{name}</Text>
                      {/* Barre double : avg + session */}
                      <View style={styles.dimCellBarWrap}>
                        {/* Track moyenne */}
                        {avgVal > 0.02 && (
                          <View style={[styles.dimCellAvgFill, { width: `${avgVal * 100}%` as `${number}%` }]} />
                        )}
                        {/* Barre session animée */}
                        <View style={[styles.dimCellBarTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                          <AnimatedBar val={val} color={barColor} progress={barProgress} />
                        </View>
                      </View>
                      {/* Score + delta */}
                      <View style={styles.dimCellMeta}>
                        <Text style={[styles.dimCellVal, { color: val < 0.04 ? 'rgba(255,255,255,0.22)' : '#c8c8d0' }]}>
                          {Math.round(val * 100)}
                        </Text>
                        {(above || below) && (
                          <Text style={[styles.dimCellDelta, { color: above ? '#3dbf7a' : '#cc5555' }]}>
                            {above ? `+${Math.round(delta * 100)}` : `${Math.round(delta * 100)}`}
                          </Text>
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              // 1 colonne standard
              <View style={styles.dimsContainer}>
                {sel !== null && DIM_NAMES[sel].map((name, i) => {
                  const val    = sessionValues[sel]?.[i] ?? 0
                  const avgVal = averageValues[sel]?.[i] ?? 0
                  const delta  = val - avgVal
                  const above  = delta > 0.05
                  const below  = delta < -0.05
                  const barColor = val < 0.04 ? 'rgba(255,255,255,0.10)' : above ? '#3dbf7a' : below ? '#cc5555' : accentHex
                  return (
                    <View key={i} style={[styles.dimRow, val < 0.04 && styles.dimRowFaded]}>
                      <Text style={[styles.dimName, val < 0.04 && { color: 'rgba(255,255,255,0.18)' }]}>
                        {name}
                      </Text>
                      <View style={styles.dimBarWrap}>
                        {/* Track complet = repère visuel */}
                        <View style={[styles.dimBarTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                          {/* Fond moyenne */}
                          {avgVal > 0.02 && (
                            <View style={[styles.dimAvgFill, { width: `${avgVal * 100}%` as `${number}%` }]} />
                          )}
                          {/* Barre session */}
                          <AnimatedBar val={val} color={barColor} progress={barProgress} />
                        </View>
                        {/* Repère moyenne (ligne verticale) */}
                        {avgVal > 0.02 && (
                          <View style={[styles.dimAvgMark, { left: `${avgVal * 100}%` as `${number}%` }]} />
                        )}
                      </View>
                      <Text style={[styles.dimVal, { color: val < 0.04 ? 'rgba(255,255,255,0.18)' : '#b0b0b8' }]}>
                        {Math.round(val * 100)}
                      </Text>
                      {(above || below) ? (
                        <Text style={[styles.dimDelta, { color: above ? '#3dbf7a' : '#cc5555' }]}>
                          {above ? `+${Math.round(delta * 100)}` : `${Math.round(delta * 100)}`}
                        </Text>
                      ) : (
                        <Text style={[styles.dimDelta, { color: 'rgba(255,255,255,0.18)' }]}>{'='}</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </ScrollView>

          <View style={[styles.avgNote, { borderTopColor: 'rgba(255,255,255,0.07)' }]}>
            <View style={styles.avgLegendLine} />
            <Text style={styles.avgNoteText}>Ligne bleue = votre moyenne · Vert/rouge = écart</Text>
          </View>

        </Animated.View>
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
  scoreRow: {
    alignItems: 'center',
    marginTop : -18,
  },
  panel: {
    marginHorizontal: 4,
    marginTop       : 4,
    backgroundColor : 'rgba(8,8,14,0.97)',
    borderRadius    : 14,
    borderWidth     : 1,
    overflow        : 'hidden',
    paddingTop      : 18,
    paddingHorizontal: 14,
    paddingBottom   : 14,
  },
  panelAccentBar: {
    position    : 'absolute',
    top         : 0,
    left        : 0,
    right       : 0,
    height      : 2,
    opacity     : 0.65,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems   : 'center',
    marginBottom : 12,
    gap          : 8,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : 5,
    minWidth     : 90,
  },
  panelIcon: {
    fontSize: 13,
  },
  panelTitle: {
    fontSize     : 12,
    fontWeight   : '700',
    letterSpacing: 1.2,
  },
  famScoreRow: {
    flex         : 1,
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : 6,
  },
  famScoreTrack: {
    flex        : 1,
    height      : 3,
    borderRadius: 2,
    overflow    : 'hidden',
  },
  famScoreVal: {
    fontSize   : 12,
    fontWeight : '700',
    minWidth   : 26,
    textAlign  : 'right',
    fontVariant: ['tabular-nums'],
  },
  closeBtn: {
    width          : 22,
    height         : 22,
    alignItems     : 'center',
    justifyContent : 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius   : 11,
  },
  dimsScroll: {
    maxHeight: 220,
  },
  dimsContainer: {
    gap: 5,
  },
  // 2-col grid (famille muscles)
  dimGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dimCell: {
    width: '48%',
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 3,
  },
  dimCellName: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  dimCellBarWrap: {
    position: 'relative',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  dimCellAvgFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(110,155,230,0.20)',
    borderRadius: 2,
  },
  dimCellBarTrack: {
    ...StyleSheet.absoluteFillObject,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  dimCellMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dimCellVal: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dimCellDelta: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dimRow: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : 5,
  },
  dimRowFaded: {
    opacity: 0.38,
  },
  dimName: {
    color        : 'rgba(255,255,255,0.48)',
    fontSize     : 10,
    width        : 88,
    letterSpacing: 0.1,
  },
  dimBarWrap: {
    flex    : 1,
    position: 'relative',
  },
  dimBarTrack: {
    height      : 3,
    borderRadius: 2,
    overflow    : 'hidden',
  },
  dimAvgFill: {
    position       : 'absolute',
    top            : 0,
    left           : 0,
    height         : '100%',
    backgroundColor: 'rgba(110,155,230,0.22)',
    borderRadius   : 2,
    zIndex         : 0,
  },
  dimAvgMark: {
    position       : 'absolute',
    top            : -1,
    width          : 1.5,
    height         : 5,
    backgroundColor: 'rgba(110,155,230,0.85)',
    borderRadius   : 1,
    marginLeft     : -0.75,
    zIndex         : 2,
  },
  barFill: {
    height      : '100%',
    borderRadius: 2,
  },
  dimVal: {
    fontSize   : 10,
    fontWeight : '600',
    width      : 22,
    textAlign  : 'right',
    fontVariant: ['tabular-nums'],
  },
  dimDelta: {
    fontSize   : 9,
    fontWeight : '600',
    width      : 24,
    textAlign  : 'right',
    fontVariant: ['tabular-nums'],
  },
  avgNote: {
    flexDirection : 'row',
    alignItems    : 'center',
    gap           : 6,
    marginTop     : 10,
    paddingTop    : 8,
    borderTopWidth: 1,
  },
  avgLegendLine: {
    width          : 16,
    height         : 2,
    borderRadius   : 1,
    backgroundColor: 'rgba(110,155,230,0.70)',
  },
  avgNoteText: {
    fontSize     : 9,
    color        : 'rgba(255,255,255,0.28)',
    letterSpacing: 0.2,
  },
})
