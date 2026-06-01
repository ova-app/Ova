import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl'
import * as THREE from 'three'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import Animated, { useSharedValue, withTiming, withSpring, withDelay, Easing, useAnimatedStyle, SharedValue } from 'react-native-reanimated'
import { X } from 'lucide-react-native'

// ─── Props ─────────────────────────────────────────────────────────────────
interface Props {
  /** 8 familles × ~5 sous-variables = 41 dims, valeurs normalisées [0,1].
   *  Ordre familles : volume · intensité · structure · récup · perf · régularité · muscles · temps */
  sessionValues?: number[][]
  averageValues?: number[][]
  size?: number
  /** Contrôle externe : index famille sélectionnée (0-7) ou null */
  selectedFamily?: number | null
  /** Callback quand l'utilisateur tape sur l'orb pour changer la sélection */
  onFamilySelect?: (fi: number | null) => void
  /** Couleur de fond du canvas GL (hex, default '#0A0A0F') */
  bgColor?: string
  /** Afficher le badge score arc en coin haut-droit (default true) */
  showScore?: boolean
  /** Afficher les étiquettes de famille flottantes (default true) */
  showLabels?: boolean
}

// ─── Config géométrique ────────────────────────────────────────────────────
const TWO_PI     = Math.PI * 2
const N_SECTORS  = 8
const SECTOR_ANG = TWO_PI / N_SECTORS
const N_RINGS    = 42
const N_SEGS     = 140
const N_SPOKES   = 26
const MAX_R      = 1.8
const H_TOP      = 1.3
const H_BOT      = 0.28

// ─── Familles ──────────────────────────────────────────────────────────────
const FAMILY_NAMES = [
  'VOLUME', 'INTENSITÉ', 'STRUCTURE', 'RÉCUP',
  'PERF', 'RÉGULARITÉ', 'MUSCLES', 'TEMPS',
]

const DIM_NAMES = [
  ['Vol. total', 'Vol. sets', 'Vol./rep', 'Vol./set', 'Tendance', 'Densité'],
  ['RPE moy.', 'Facteur int.', 'RPE pic', 'Constance', 'Int. relative'],
  ['Nb exercices', 'Sets/exercice', 'Variété', 'Score struct.', 'Rég. repos'],
  ['Repos moy.', 'Var. repos', 'Complétion', 'Qualité repos', 'Récup. est.'],
  ['Nb PRs', 'Amp. PRs', 'Force rel.', 'Prog. 1RM', 'Constance perf.'],
  ['Fréquence', 'Streak', 'Var. séances', 'Planning', 'Régularité'],
  ['Pec clav.', 'Pec sternal', 'Delt ant.', 'Delt médial', 'Delt post.', 'Grand dorsal', 'Trapèze', 'Grand rond', 'Rhomboïdes', 'Érecteurs', 'Biceps', 'Triceps', 'Quadriceps', 'Ischio', 'Fessiers', 'Mollets', 'Core'],
  ['Durée', 'Tempo', 'Densité', 'Efficacité', 'Timing'],
]

const SECTOR_COLORS_HEX = [
  '#f97316', '#ef4444', '#8b5cf6', '#06b6d4',
  '#fac775', '#22c55e', '#ec4899', '#3b82f6',
]

export { FAMILY_NAMES, SECTOR_COLORS_HEX, MOCK_SESSION }

const SECTOR_COLORS: readonly number[] = [
  0xf97316, 0xef4444, 0x8b5cf6, 0x06b6d4,
  0xfac775, 0x22c55e, 0xec4899, 0x3b82f6,
]

// ─── Mapping 41 dimensions ─────────────────────────────────────────────────
const N_DIMS_PER_FAM = [6, 5, 5, 5, 5, 5, 17, 5] as const

const EMPTY_SESSION: number[][] = [
  [0,0,0,0,0,0], [0,0,0,0,0], [0,0,0,0,0], [0,0,0,0,0],
  [0,0,0,0,0], [0,0,0,0,0], new Array(17).fill(0), [0,0,0,0,0],
]

// ─── Mock data (référence design uniquement — ne pas utiliser en prod) ──────
const MOCK_SESSION: number[][] = [
  [0.92, 0.78, 0.85, 0.71, 0.88, 0.65],
  [0.70, 0.82, 0.61, 0.75, 0.68],
  [0.55, 0.63, 0.48, 0.72, 0.58],
  [0.45, 0.52, 0.38, 0.61, 0.49],
  [0.88, 0.94, 0.77, 0.82, 0.91],
  [0.60, 0.55, 0.68, 0.52, 0.63],
  [0.72, 0.65, 0.40, 0.58, 0.30, 0.55, 0.48, 0.20, 0.25, 0.35, 0.70, 0.60, 0.45, 0.38, 0.52, 0.42, 0.35],
  [0.42, 0.38, 0.51, 0.46, 0.35],
]

const MOCK_AVERAGE: number[][] = [
  [0.72, 0.65, 0.70, 0.58, 0.75, 0.62],
  [0.58, 0.65, 0.52, 0.61, 0.55],
  [0.50, 0.55, 0.45, 0.60, 0.48],
  [0.58, 0.62, 0.48, 0.55, 0.52],
  [0.72, 0.78, 0.65, 0.70, 0.75],
  [0.48, 0.52, 0.55, 0.45, 0.50],
  [0.60, 0.55, 0.35, 0.48, 0.28, 0.48, 0.40, 0.18, 0.22, 0.30, 0.58, 0.50, 0.40, 0.32, 0.45, 0.38, 0.30],
  [0.45, 0.42, 0.48, 0.50, 0.38],
]

// ─── DimConfig + précalcul ─────────────────────────────────────────────────
interface DimConfig {
  fi: number
  vi: number
  angCenter: number
  angSigma: number
  rPeak: number
  rWidth: number
  harmN: number
}

const DIM_CONFIGS: readonly DimConfig[] = (() => {
  const configs: DimConfig[] = []
  const PHI = 0.618033988749895
  let gIdx = 0
  for (let fi = 0; fi < N_SECTORS; fi++) {
    const nv   = N_DIMS_PER_FAM[fi]
    const subW = SECTOR_ANG / nv
    for (let vi = 0; vi < nv; vi++) {
      configs.push({
        fi, vi,
        angCenter : (fi + (vi + 0.5) / nv) * SECTOR_ANG,
        angSigma  : subW * 0.62,
        rPeak     : 0.13 + ((gIdx * PHI) % 1) * 0.70,
        rWidth    : 0.085 + vi * 0.010,
        harmN     : 6 + vi * 3,
      })
      gIdx++
    }
  }
  return configs
})()

// ─── Helpers ───────────────────────────────────────────────────────────────
const ss = (t: number): number => t * t * (3 - 2 * t)

function sectorBlend(theta: number): { s0: number; s1: number; t: number } {
  const a  = ((theta % TWO_PI) + TWO_PI) % TWO_PI
  const sf = a / SECTOR_ANG
  const s0 = Math.floor(sf) % N_SECTORS
  return { s0, s1: (s0 + 1) % N_SECTORS, t: ss(sf - Math.floor(sf)) }
}

function getH(r: number, theta: number, data: number[][], maxH: number): number {
  const rn   = r / MAX_R
  const edge = Math.min(rn / 0.10, 1.0) * Math.min((1 - rn) / 0.08, 1.0)
  if (edge === 0) return 0

  let h = 0
  for (const cfg of DIM_CONFIGS) {
    const val = data[cfg.fi][cfg.vi]
    if (val < 0.02) continue

    let da = theta - cfg.angCenter
    da = ((da % TWO_PI) + TWO_PI) % TWO_PI
    if (da > Math.PI) da -= TWO_PI

    const angGauss = Math.exp(-(da * da) / (2 * cfg.angSigma * cfg.angSigma))
    if (angGauss < 0.003) continue

    const ripple = 1 + 0.38 * Math.cos(cfg.harmN * theta)
    const ang    = angGauss * ripple

    const rDist = Math.abs(rn - cfg.rPeak) / cfg.rWidth
    if (rDist >= 1) continue

    const rad = Math.pow(1 - rDist, 2.5)
    h += val * ang * rad
  }

  return h * maxH * edge
}

function getC(theta: number): [number, number, number] {
  const { s0, s1, t } = sectorBlend(theta)
  const h0 = SECTOR_COLORS[s0]
  const h1 = SECTOR_COLORS[s1]
  return [
    (((h0 >> 16) & 0xff) * (1 - t) + ((h1 >> 16) & 0xff) * t) / 255,
    (((h0 >>  8) & 0xff) * (1 - t) + ((h1 >>  8) & 0xff) * t) / 255,
    (( h0        & 0xff) * (1 - t) + ( h1        & 0xff) * t) / 255,
  ]
}

// ─── Helper SVG arc ────────────────────────────────────────────────────────
function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  if (sweepDeg <= 0) return ''
  const toRad = (d: number) => d * Math.PI / 180
  const x1 = cx + r * Math.cos(toRad(startDeg))
  const y1 = cy + r * Math.sin(toRad(startDeg))
  const endDeg = startDeg + sweepDeg
  const x2 = cx + r * Math.cos(toRad(endDeg))
  const y2 = cy + r * Math.sin(toRad(endDeg))
  const large = sweepDeg > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

// ─── Score arc dégradé — SVG multi-segments simulant un dégradé angulaire ──
function ScoreArcGradient({
  score,
  size = 120,
  strokeWidth = 9,
}: {
  score: number
  size?: number
  strokeWidth?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const r  = (size - strokeWidth * 2) / 2

  // Arc 240° centré en bas : de 150° à 390°
  const START_DEG = 150
  const TOTAL_DEG = 240
  const filled    = (score / 100) * TOTAL_DEG

  // Track (gris)
  const trackPath = arcPath(cx, cy, r, START_DEG, TOTAL_DEG)

  // Dégradé gris→orange→or : 3 stops sur [0,1]
  const GRAD = [
    { t: 0,    rgb: [0x8E, 0x8E, 0x93] },
    { t: 0.5,  rgb: [0xD8, 0x5A, 0x30] },
    { t: 1.0,  rgb: [0xFA, 0xC7, 0x75] },
  ] as const

  function lerpGrad(t: number): [number, number, number] {
    let lo = GRAD[0], hi = GRAD[GRAD.length - 1]
    for (let k = 0; k < GRAD.length - 1; k++) {
      if (t >= GRAD[k].t && t <= GRAD[k + 1].t) { lo = GRAD[k]; hi = GRAD[k + 1]; break }
    }
    const ft = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t)
    return [
      Math.round(lo.rgb[0] * (1 - ft) + hi.rgb[0] * ft),
      Math.round(lo.rgb[1] * (1 - ft) + hi.rgb[1] * ft),
      Math.round(lo.rgb[2] * (1 - ft) + hi.rgb[2] * ft),
    ]
  }

  const N_SEG = 180
  const segDeg = filled / N_SEG
  const segments: { path: string; color: string }[] = []

  if (filled > 0.5) {
    for (let i = 0; i < N_SEG; i++) {
      const t      = i / N_SEG
      const sStart = START_DEG + i * segDeg
      const sLen   = segDeg * 1.5
      const path   = arcPath(cx, cy, r, sStart, sLen)
      if (!path) continue
      const [r8, g8, b8] = lerpGrad(t)
      segments.push({ path, color: `rgb(${r8},${g8},${b8})` })
    }
  }

  // Couleur texte = couleur au bout de l'arc
  const [er, eg, eb] = lerpGrad(score / 100)
  const scoreTextColor = score === 0 ? '#4A4A5A' : `rgb(${er},${eg},${eb})`

  return (
    <Svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size}`} pointerEvents="none">
      {/* Track */}
      <Path
        d={trackPath}
        stroke="rgba(255,255,255,0.09)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
      {/* Segments dégradés */}
      {segments.map((seg, i) => (
        <Path
          key={i}
          d={seg.path}
          stroke={seg.color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="butt"
        />
      ))}
      {/* Valeur score */}
      <SvgText
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fill={scoreTextColor}
        fontSize={size * 0.22}
        fontWeight="900"
      >
        {String(score)}
      </SvgText>
      <SvgText
        x={cx}
        y={cy + size * 0.22}
        textAnchor="middle"
        fill="rgba(255,255,255,0.28)"
        fontSize={size * 0.085}
        fontWeight="700"
        letterSpacing={1.2}
      >
        SCORE
      </SvgText>
    </Svg>
  )
}

// ─── APPROACH A: Triangle mesh geometry ────────────────────────────────────
// Full (N_RINGS+1) × N_SEGS vertex grid connected with indexed triangles.
// computeVertexNormals() enables Phong shading with depth and light response.

function makeTopoGeo(
  data: number[][],
  maxH: number,
  sign: 1 | -1,
  colored: boolean,
): THREE.BufferGeometry {
  const NV = (N_RINGS + 1) * N_SEGS
  const positions = new Float32Array(NV * 3)
  const colors    = colored ? new Float32Array(NV * 3) : null

  // Step 1: fill vertex positions and optional colors
  for (let ri = 0; ri <= N_RINGS; ri++) {
    const r = (ri / N_RINGS) * MAX_R
    for (let si = 0; si < N_SEGS; si++) {
      const a   = (si / N_SEGS) * TWO_PI
      const idx = ri * N_SEGS + si
      const b   = idx * 3
      positions[b]     = r * Math.cos(a)
      positions[b + 1] = sign * getH(r, a, data, maxH)
      positions[b + 2] = r * Math.sin(a)
      if (colors !== null) {
        const [cr, cg, cb] = getC(a)
        colors[b]     = cr
        colors[b + 1] = cg
        colors[b + 2] = cb
      }
    }
  }

  // Step 2: build triangle indices — two CCW triangles per quad
  const nTris    = N_RINGS * N_SEGS * 2
  const indices  = new Uint32Array(nTris * 3)
  let   iPtr     = 0
  for (let ri = 0; ri < N_RINGS; ri++) {
    for (let si = 0; si < N_SEGS; si++) {
      const v00 = ri       * N_SEGS + si
      const v10 = (ri + 1) * N_SEGS + si
      const v01 = ri       * N_SEGS + (si + 1) % N_SEGS
      const v11 = (ri + 1) * N_SEGS + (si + 1) % N_SEGS
      // triangle 1 — CCW
      indices[iPtr++] = v00
      indices[iPtr++] = v10
      indices[iPtr++] = v01
      // triangle 2 — CCW
      indices[iPtr++] = v10
      indices[iPtr++] = v11
      indices[iPtr++] = v01
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (colors !== null) {
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  return geo
}

// ─── Sector mesh geometry (non-indexed, simpler sector filter) ─────────────
function makeTopoGeoSector(
  fi: number,
  data: number[][],
  maxH: number,
  sign: 1 | -1,
  colored: boolean,
): THREE.BufferGeometry {
  const pts: number[]  = []
  const cols: number[] = []

  // For each ring pair (ri, ri+1) and each segment where midpoint angle is in sector fi
  for (let ri = 0; ri < N_RINGS; ri++) {
    const rBot = (ri / N_RINGS) * MAX_R
    const rTop = ((ri + 1) / N_RINGS) * MAX_R
    for (let si = 0; si < N_SEGS; si++) {
      const a0  = (si / N_SEGS) * TWO_PI
      const a1  = ((si + 1) / N_SEGS) * TWO_PI
      const mid = (a0 + a1) / 2
      const midNorm = ((mid % TWO_PI) + TWO_PI) % TWO_PI
      if (Math.floor(midNorm / SECTOR_ANG) % N_SECTORS !== fi) continue

      // Four corner vertices of the quad
      const xB0 = rBot * Math.cos(a0)
      const zB0 = rBot * Math.sin(a0)
      const xB1 = rBot * Math.cos(a1)
      const zB1 = rBot * Math.sin(a1)
      const xT0 = rTop * Math.cos(a0)
      const zT0 = rTop * Math.sin(a0)
      const xT1 = rTop * Math.cos(a1)
      const zT1 = rTop * Math.sin(a1)
      const yB0 = sign * getH(rBot, a0, data, maxH)
      const yB1 = sign * getH(rBot, a1, data, maxH)
      const yT0 = sign * getH(rTop, a0, data, maxH)
      const yT1 = sign * getH(rTop, a1, data, maxH)

      // triangle 1: (B0, T0, B1)
      pts.push(xB0, yB0, zB0)
      pts.push(xT0, yT0, zT0)
      pts.push(xB1, yB1, zB1)
      // triangle 2: (T0, T1, B1)
      pts.push(xT0, yT0, zT0)
      pts.push(xT1, yT1, zT1)
      pts.push(xB1, yB1, zB1)

      if (colored) {
        const [cr0, cg0, cb0] = getC(a0)
        const [cr1, cg1, cb1] = getC(a1)
        // triangle 1 colors: B0, T0, B1
        cols.push(cr0, cg0, cb0)
        cols.push(cr0, cg0, cb0)
        cols.push(cr1, cg1, cb1)
        // triangle 2 colors: T0, T1, B1
        cols.push(cr0, cg0, cb0)
        cols.push(cr1, cg1, cb1)
        cols.push(cr1, cg1, cb1)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  if (colored && cols.length > 0) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
  }
  geo.computeVertexNormals()
  return geo
}

// ─── Socle geometry (kept as LineSegments) ─────────────────────────────────
function makeSocleGeo(): THREE.BufferGeometry {
  const R_INNER = MAX_R * 0.92
  const R_OUTER = MAX_R * 1.07
  const N_TICKS = N_SPOKES * 2

  const totalSeg = 3 * N_SEGS + N_TICKS
  const pts = new Float32Array(totalSeg * 6)
  let idx = 0

  const addRing = (r: number) => {
    for (let i = 0; i < N_SEGS; i++) {
      const a1 = (i / N_SEGS) * TWO_PI
      const a2 = ((i + 1) / N_SEGS) * TWO_PI
      const b  = idx * 6
      pts[b]     = r * Math.cos(a1); pts[b + 1] = 0; pts[b + 2] = r * Math.sin(a1)
      pts[b + 3] = r * Math.cos(a2); pts[b + 4] = 0; pts[b + 5] = r * Math.sin(a2)
      idx++
    }
  }

  addRing(R_INNER)
  addRing(MAX_R)
  addRing(R_OUTER)

  for (let t = 0; t < N_TICKS; t++) {
    const a = (t / N_TICKS) * TWO_PI
    const b = idx * 6
    pts[b]     = R_INNER * Math.cos(a); pts[b + 1] = 0; pts[b + 2] = R_INNER * Math.sin(a)
    pts[b + 3] = R_OUTER * Math.cos(a); pts[b + 4] = 0; pts[b + 5] = R_OUTER * Math.sin(a)
    idx++
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
  return geo
}

// ─── Hitbox secteur (pie-slice invisible, raycasting uniquement) ───────────
function makeSectorHitbox(fi: number): THREE.Mesh {
  const N_ARC  = 12
  const startA = fi * SECTOR_ANG
  const verts: number[] = [0, 0, 0]
  for (let i = 0; i <= N_ARC; i++) {
    const a = startA + (i / N_ARC) * SECTOR_ANG
    verts.push(MAX_R * 1.12 * Math.cos(a), 0, MAX_R * 1.12 * Math.sin(a))
  }
  const idxs: number[] = []
  for (let i = 0; i < N_ARC; i++) idxs.push(0, i + 1, i + 2)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.setIndex(idxs)

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  )
  mesh.userData.sectorIndex = fi
  return mesh
}

// ─── Type overlay ──────────────────────────────────────────────────────────
interface LabelPos {
  x: number
  y: number
  visible: boolean
}

// ─── Composant ─────────────────────────────────────────────────────────────
export default function MyoOrb({
  sessionValues = EMPTY_SESSION,
  averageValues = MOCK_AVERAGE,
  size,
  selectedFamily: externalSelectedFamily,
  onFamilySelect,
  bgColor,
  showScore = true,
  showLabels = true,
}: Props) {
  const { width } = Dimensions.get('window')
  const S = size ?? width - 32

  // ─── State ───────────────────────────────────────────────────────────────
  const isControlled = externalSelectedFamily !== undefined
  const [internalSelectedFamily, setInternalSelectedFamily] = useState<number | null>(null)
  const selectedFamily = isControlled ? (externalSelectedFamily ?? null) : internalSelectedFamily
  const [labelScreenPos, setLabelScreenPos] = useState<LabelPos[]>(
    Array.from({ length: N_SECTORS }, () => ({ x: 0, y: 0, visible: false })),
  )

  // ─── bgColor ref ─────────────────────────────────────────────────────────
  const bgColorRef = useRef(bgColor ?? '#0A0A0F')
  useEffect(() => { bgColorRef.current = bgColor ?? '#0A0A0F' }, [bgColor])

  // ─── Fade-in entrée ──────────────────────────────────────────────────────
  const mountOpacity = useSharedValue(0)
  const mountAnim = useAnimatedStyle(() => ({ opacity: mountOpacity.value }))
  useEffect(() => {
    mountOpacity.value = withTiming(1, { duration: 700, easing: Easing.bezier(0.16, 1, 0.3, 1) })
  }, [])

  // ─── Animation panneau détail + barres ───────────────────────────────────
  const panelTranslateY = useSharedValue(10)
  const panelOpacity    = useSharedValue(0)
  const barProgress     = useSharedValue(0)
  const panelAnim       = useAnimatedStyle(() => ({
    opacity:   panelOpacity.value,
    transform: [{ translateY: panelTranslateY.value }],
  }))
  useEffect(() => {
    if (selectedFamily === null) return
    panelTranslateY.value = 10
    panelOpacity.value    = 0
    barProgress.value     = 0
    panelTranslateY.value = withSpring(0, { damping: 18, stiffness: 300 })
    panelOpacity.value    = withTiming(1, { duration: 200, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    barProgress.value     = withDelay(80, withTiming(1, { duration: 480, easing: Easing.bezier(0.16, 1, 0.3, 1) }))
  }, [selectedFamily])

  // ─── Refs partagés GL ↔ React ────────────────────────────────────────────
  const rafRef               = useRef<number | null>(null)
  const cameraRef            = useRef<THREE.PerspectiveCamera | null>(null)
  const sceneRef             = useRef<THREE.Scene | null>(null)
  const sceneRotYRef         = useRef(0)
  const targetRotYRef        = useRef(0)
  const autoRotateRef        = useRef(true)
  const selectedRef          = useRef<number | null>(null)
  const svRef                = useRef(sessionValues)
  const avRef                = useRef(averageValues)
  const sessionMatsRef       = useRef<THREE.MeshPhongMaterial[]>([])
  const avgMatRef            = useRef<THREE.MeshPhongMaterial | null>(null)
  const hitboxMeshesRef      = useRef<THREE.Mesh[]>([])
  const autoRotateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Score global — pondéré 1/8 par famille (évite que MUSCLES/17 dims écrase tout)
  const globalScore = useMemo(() => {
    let famSum = 0
    let famCount = 0
    for (const fam of sessionValues) {
      if (fam.length === 0) continue
      const famAvg = fam.reduce((s, v) => s + v, 0) / fam.length
      famSum += famAvg
      famCount++
    }
    return famCount > 0 ? Math.round((famSum / famCount) * 100) : 0
  }, [sessionValues])
  const scoreColor = globalScore >= 66 ? '#FAC775' : globalScore >= 33 ? '#D85A30' : '#8E8E93'
  // scoreColor is kept for potential external use — suppress lint warning
  void scoreColor

  // ─── Positions 3D des étiquettes — dessus du pic de chaque secteur ───────
  const labelPositions3D = useMemo((): THREE.Vector3[] => {
    return Array.from({ length: N_SECTORS }, (_, fi) => {
      const sA = fi * SECTOR_ANG + SECTOR_ANG / 2
      let maxHVal = 0
      for (let s = 0; s < 20; s++) {
        const a = fi * SECTOR_ANG + ((s + 0.5) / 20) * SECTOR_ANG
        for (let rI = 1; rI <= 8; rI++) {
          const h = getH((rI / 8) * MAX_R, a, sessionValues, H_TOP)
          if (h > maxHVal) maxHVal = h
        }
      }
      return new THREE.Vector3(
        MAX_R * 0.65 * Math.cos(sA),
        maxHVal + 0.22,
        MAX_R * 0.65 * Math.sin(sA),
      )
    })
  }, [sessionValues])

  // ─── Mise à jour positions 2D des labels (15 fps, délai 800ms) ───────────
  useEffect(() => {
    const euler  = new THREE.Euler()
    const tmpW   = new THREE.Vector3()
    const tmpV   = new THREE.Vector3()

    let intervalId: ReturnType<typeof setInterval> | null = null
    const timeoutId = setTimeout(() => {
      intervalId = setInterval(() => {
        const cam = cameraRef.current
        if (!cam) return
        euler.set(0, sceneRotYRef.current, 0)

        const positions: LabelPos[] = labelPositions3D.map(p => {
          tmpW.copy(p).applyEuler(euler)
          tmpV.copy(tmpW).applyMatrix4(cam.matrixWorldInverse)
          if (tmpV.z > -0.1) return { x: 0, y: 0, visible: false }
          tmpW.project(cam)
          if (Math.abs(tmpW.x) > 1.35 || Math.abs(tmpW.y) > 1.35) {
            return { x: 0, y: 0, visible: false }
          }
          return {
            x: ((tmpW.x + 1) / 2) * S - 34,
            y: ((-tmpW.y + 1) / 2) * S - 10,
            visible: true,
          }
        })

        setLabelScreenPos(positions)
      }, 67)
    }, 800)

    return () => {
      clearTimeout(timeoutId)
      if (intervalId !== null) clearInterval(intervalId)
    }
  }, [labelPositions3D, S])

  // ─── Helpers select/deselect ─────────────────────────────────────────────
  const selectFamily = useCallback((fi: number | null) => {
    if (!isControlled) setInternalSelectedFamily(fi)
    onFamilySelect?.(fi)
    selectedRef.current = fi
    if (autoRotateTimeoutRef.current) clearTimeout(autoRotateTimeoutRef.current)
    if (fi === null) {
      autoRotateTimeoutRef.current = setTimeout(() => {
        autoRotateRef.current = true
      }, 3000)
    } else {
      autoRotateRef.current = false
      const sA = fi * SECTOR_ANG + SECTOR_ANG / 2
      targetRotYRef.current = sA - Math.PI / 2
    }
  }, [isControlled, onFamilySelect])

  // ─── Fermeture panneau ───────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    selectFamily(null)
  }, [selectFamily])

  // ─── Raycasting sur hitboxes invisibles ──────────────────────────────────
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: evt => {
        const cam      = cameraRef.current
        const scene    = sceneRef.current
        const hitboxes = hitboxMeshesRef.current
        if (!cam || !scene || hitboxes.length === 0) return

        const { locationX, locationY } = evt.nativeEvent
        const ndcX = (locationX - S / 2) / (S / 2)
        const ndcY = -((locationY - S / 2) / (S / 2))

        scene.updateMatrixWorld(true)

        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam)
        const intersects = raycaster.intersectObjects(hitboxes, false)

        if (intersects.length === 0) {
          selectFamily(null)
          return
        }

        const fi = intersects[0].object.userData.sectorIndex as number
        selectFamily(selectedRef.current === fi ? null : fi)
      },
    }),
    [S, selectFamily],
  )

  // ─── Sync selectedRef quand prop externe change ──────────────────────────
  useEffect(() => {
    if (!isControlled) return
    const fi = externalSelectedFamily ?? null
    selectedRef.current = fi
    if (autoRotateTimeoutRef.current) clearTimeout(autoRotateTimeoutRef.current)
    if (fi === null) {
      autoRotateTimeoutRef.current = setTimeout(() => {
        autoRotateRef.current = true
      }, 3000)
    } else {
      autoRotateRef.current = false
      const sA = fi * SECTOR_ANG + SECTOR_ANG / 2
      targetRotYRef.current = sA - Math.PI / 2
    }
  }, [isControlled, externalSelectedFamily])

  // ─── Cleanup RAF ─────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (autoRotateTimeoutRef.current) clearTimeout(autoRotateTimeoutRef.current)
  }, [])

  // ─── GL context ──────────────────────────────────────────────────────────
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const W = gl.drawingBufferWidth
    const H = gl.drawingBufferHeight

    const canvas = {
      width: W, height: H, style: {},
      clientWidth: W, clientHeight: H,
      addEventListener: () => {}, removeEventListener: () => {},
    } as unknown as HTMLCanvasElement

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as WebGL2RenderingContext,
      antialias: false,
    })
    renderer.setSize(W, H, false)
    renderer.setPixelRatio(1)
    const bgInt = parseInt(bgColorRef.current.replace('#', ''), 16)
    renderer.setClearColor(bgInt, 1)

    const scene  = new THREE.Scene()

    // ─── Lighting (Approach A — Phong requires lights) ────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.30))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.90)
    dirLight.position.set(2, 4, 3)
    scene.add(dirLight)

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)
    camera.position.set(0, 2.0, 5.5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    cameraRef.current = camera
    sceneRef.current  = scene

    // ─── Session terrain — 8 MeshPhongMaterial sectors ───────────────────
    const mats: THREE.MeshPhongMaterial[] = []
    for (let fi = 0; fi < N_SECTORS; fi++) {
      const mat = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side        : THREE.DoubleSide,
        shininess   : 45,
        specular    : new THREE.Color(0.2, 0.2, 0.2),
      })
      mats.push(mat)
      scene.add(new THREE.Mesh(
        makeTopoGeoSector(fi, svRef.current, H_TOP, 1, true),
        mat,
      ))
    }
    sessionMatsRef.current = mats

    // ─── Historical terrain — single MeshPhongMaterial ───────────────────
    const avgMat = new THREE.MeshPhongMaterial({
      color      : new THREE.Color(0x2a3a4e),
      side       : THREE.DoubleSide,
      shininess  : 10,
      transparent: true,
      opacity    : 0.55,
    })
    avgMatRef.current = avgMat
    scene.add(new THREE.Mesh(makeTopoGeo(avRef.current, H_BOT, -1, false), avgMat))

    // ─── Socle (kept as LineSegments, only material color changed) ────────
    scene.add(new THREE.LineSegments(
      makeSocleGeo(),
      new THREE.LineBasicMaterial({ color: 0x1a1a2e, transparent: true, opacity: 0.45 }),
    ))

    // ─── Hitboxes (invisible pie-slices for raycasting) ───────────────────
    const hitboxes: THREE.Mesh[] = []
    for (let fi = 0; fi < N_SECTORS; fi++) {
      const hb = makeSectorHitbox(fi)
      hitboxes.push(hb)
      scene.add(hb)
    }
    hitboxMeshesRef.current = hitboxes

    let last    = 0
    let prevSel: number | null = null

    const tick = (now: number): void => {
      rafRef.current = requestAnimationFrame(tick)
      if (now - last < 33) return
      last = now

      if (autoRotateRef.current) {
        scene.rotation.y += 0.003
      } else {
        let diff = targetRotYRef.current - scene.rotation.y
        diff = ((diff + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI
        scene.rotation.y += diff * 0.05
      }
      sceneRotYRef.current = scene.rotation.y
      camera.updateMatrixWorld()

      const sel = selectedRef.current
      if (sel !== prevSel) {
        prevSel = sel
        for (let fi = 0; fi < N_SECTORS; fi++) {
          const mat    = mats[fi]
          const dimmed = sel !== null && fi !== sel
          mat.opacity     = dimmed ? 0.13 : 1.0
          mat.transparent = fi !== sel
          mat.needsUpdate = true
        }
        const av = avgMatRef.current
        if (av !== null) {
          av.opacity     = sel !== null ? 0.20 : 0.55
          av.transparent = true
          av.needsUpdate = true
        }
      }

      renderer.render(scene, camera)
      gl.endFrameEXP()
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────
  const accentHex = selectedFamily !== null ? SECTOR_COLORS_HEX[selectedFamily] : '#F0F0F5'
  const familyScore = useMemo(() => {
    if (selectedFamily === null) return 0
    const fam = sessionValues[selectedFamily] ?? []
    return fam.length > 0 ? fam.reduce((s, v) => s + v, 0) / fam.length : 0
  }, [selectedFamily, sessionValues])

  return (
    <Animated.View style={[{ width: S }, mountAnim]}>

      {/* ── Orb 3D (S×S, clippé) ── */}
      <View style={{ width: S, height: S }}>
        {/* Canvas GL + labels + touch */}
        <View style={[styles.orbContainer, { width: S, height: S }]}>
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />

          {/* Étiquettes flottantes */}
          {showLabels && <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {labelScreenPos.map((pos, i) => (
              <Text
                key={i}
                style={[
                  styles.label,
                  {
                    left: pos.x,
                    top: pos.y,
                    opacity: pos.visible
                      ? (selectedFamily !== null && selectedFamily !== i ? 0.28 : 1)
                      : 0,
                    color: selectedFamily === i
                      ? SECTOR_COLORS_HEX[i]
                      : 'rgba(255,255,255,0.52)',
                    transform: [{ scale: selectedFamily === i ? 1.18 : 1 }],
                  },
                ]}
              >
                {FAMILY_NAMES[i]}
              </Text>
            ))}
          </View>}

          {/* Couche tactile */}
          <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
        </View>
      </View>

      {/* ── Score arc dégradé centré sous l'orb ── */}
      {showScore && (
        <View style={styles.scoreArcRow}>
          <ScoreArcGradient score={globalScore} size={100} strokeWidth={8} />
        </View>
      )}

      {/* ── Panneau détail — SOUS l'orb, flux normal ── */}
      {selectedFamily !== null && (
        <Animated.View
          style={[styles.detailPanel, panelAnim]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.detailAccentBar, { backgroundColor: accentHex }]} />
          <View style={styles.detailHeader}>
            <Text style={[styles.detailTitle, { color: accentHex }]}>
              {FAMILY_NAMES[selectedFamily]}
            </Text>
            <View style={styles.familyScoreRow}>
              <View style={styles.familyScoreBarBg}>
                <AnimatedBarFill val={familyScore} color={accentHex} progress={barProgress} />
              </View>
              <Text style={[styles.familyScoreVal, { color: accentHex }]}>
                {Math.round(familyScore * 100)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={16} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>
          {DIM_NAMES[selectedFamily].map((name, i) => {
            const val = sessionValues[selectedFamily]?.[i] ?? 0
            if (val < 0.05) return null
            return (
              <View key={i} style={styles.dimRow}>
                <Text style={styles.dimName}>{name}</Text>
                <View style={styles.dimBarBg}>
                  <AnimatedBarFill val={val} color={accentHex} progress={barProgress} />
                </View>
                <Text style={styles.dimVal}>{Math.round(val * 100)}</Text>
              </View>
            )
          })}
        </Animated.View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  orbContainer: {
    borderRadius   : 16,
    overflow       : 'hidden',
  },
  scoreArcRow: {
    alignItems    : 'center',
    marginTop     : -16,
  },
  label: {
    position     : 'absolute',
    fontSize     : 11,
    fontWeight   : '700',
    letterSpacing: 1.2,
  },
  detailPanel: {
    marginHorizontal: 8,
    marginTop       : 6,
    backgroundColor : 'rgba(8,8,8,0.90)',
    borderRadius    : 12,
    padding         : 14,
    paddingTop      : 16,
  },
  detailAccentBar: {
    position    : 'absolute',
    top         : 0,
    left        : 0,
    right       : 0,
    height      : 2,
    borderRadius: 12,
    opacity     : 0.85,
  },
  detailHeader: {
    flexDirection : 'row',
    alignItems    : 'center',
    marginBottom  : 10,
    gap           : 10,
  },
  detailTitle: {
    fontSize     : 12,
    fontWeight   : '700',
    letterSpacing: 1.6,
    minWidth     : 80,
  },
  familyScoreRow: {
    flex         : 1,
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : 6,
  },
  familyScoreBarBg: {
    flex            : 1,
    height          : 4,
    backgroundColor : 'rgba(255,255,255,0.09)',
    borderRadius    : 2,
    overflow        : 'hidden',
  },
  familyScoreVal: {
    fontSize    : 12,
    fontWeight  : '700',
    letterSpacing: 0.2,
    minWidth    : 24,
    textAlign   : 'right',
  },
  closeBtn: {
    width          : 24,
    height         : 24,
    alignItems     : 'center',
    justifyContent : 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius   : 12,
  },
  dimRow: {
    flexDirection : 'row',
    alignItems    : 'center',
    marginBottom  : 5,
  },
  dimName: {
    color   : 'rgba(255,255,255,0.55)',
    fontSize: 10,
    width   : 96,
  },
  dimBarBg: {
    flex             : 1,
    height           : 3,
    backgroundColor  : 'rgba(255,255,255,0.09)',
    borderRadius     : 2,
    overflow         : 'hidden',
    marginHorizontal : 8,
  },
  dimBarFill: {
    height      : 3,
    borderRadius: 2,
    opacity     : 0.80,
  },
  dimVal: {
    color    : 'rgba(255,255,255,0.45)',
    fontSize : 10,
    width    : 22,
    textAlign: 'right',
  },
})

// ─── Animated bar fill (uses styles, defined after StyleSheet) ─────────────
function AnimatedBarFill({ val, color, progress }: {
  val     : number
  color   : string
  progress: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => ({
    width: `${Math.round(val * 100 * progress.value)}%` as `${number}%`,
  }))
  return (
    <Animated.View style={[styles.dimBarFill, { backgroundColor: color }, style]} />
  )
}
