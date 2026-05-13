import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, PanResponder, StyleSheet, ActivityIndicator,
  TouchableOpacity, Dimensions,
} from 'react-native'
import Svg, { Path, Circle, G } from 'react-native-svg'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrbSig {
  z_volume: number; z_intensite: number; z_structure: number
  z_recovery: number; z_performance: number; z_regularite: number
  score: number
  z_extended: Record<string, number>
  workout_title: string
}

interface Seg3D { x1:number; y1:number; z1:number; x2:number; y2:number; z2:number }
interface Dot3D { x:number; y:number; z:number }

interface Projected {
  segs: Array<{ x1:number; y1:number; x2:number; y2:number; stroke:string; sw:number; op:number }>
  dots: Array<{ cx:number; cy:number; r:number; fill:string; op:number }>
  grid: Array<{ d:string; depth:number }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window')
const SIZE = Math.min(SW - 32, 380)
const CX = SIZE / 2
const CY = SIZE / 2
const R_SPHERE = SIZE * 0.28
const FOV = SIZE * 1.6

const ORB_GROUPS: Array<{
  id: string; label: string; color: string
  zKeys: string[]
  theta: number; phi: number
}> = [
  { id: 'volume',      label: 'Volume',     color: '#D85A30', zKeys: ['volume_kg'],                                   theta: 0,                   phi: Math.PI * 0.25 },
  { id: 'intensite',   label: 'Intensité',  color: '#FAC775', zKeys: ['densite', 'charge_relative', 'max_1rm_kg'],    theta: Math.PI * 0.42,      phi: Math.PI * 0.38 },
  { id: 'structure',   label: 'Structure',  color: '#9B59B6', zKeys: ['nb_series', 'nb_exercices'],                   theta: Math.PI * 0.83,      phi: Math.PI * 0.28 },
  { id: 'recuperation',label: 'Récup.',     color: '#50C878', zKeys: ['recuperation', 'temps_repos_moy_sec'],         theta: Math.PI * 1.17,      phi: Math.PI * 0.42 },
  { id: 'performance', label: 'Perf.',      color: '#4A9EFF', zKeys: ['nb_pr', 'mean_evolution_volume'],              theta: Math.PI * 1.5,       phi: Math.PI * 0.30 },
  { id: 'regularite',  label: 'Constance',  color: '#FF9800', zKeys: ['streak', 'frequence_hebdo'],                   theta: Math.PI * 1.83,      phi: Math.PI * 0.40 },
  { id: 'muscles',     label: 'Muscles',    color: '#00BCD4', zKeys: ['nb_muscles', 'hhi_muscles', 'share_dominant'], theta: Math.PI * 0.22,      phi: Math.PI * 0.65 },
  { id: 'temps',       label: 'Durée',      color: '#E91E63', zKeys: ['duree_sec', 'ratio_actif'],                    theta: Math.PI * 1.1,       phi: Math.PI * 0.70 },
]

const GROUP_LABEL_Z: Record<string, number> = {
  volume: 0, intensite: 1, structure: 2, recuperation: 3,
  performance: 4, regularite: 5, muscles: 0, temps: 0,
}

// ─── 3D Math ──────────────────────────────────────────────────────────────────

function rotX(p: [number,number,number], a: number): [number,number,number] {
  const [x, y, z] = p
  return [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]
}
function rotY(p: [number,number,number], a: number): [number,number,number] {
  const [x, y, z] = p
  return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]
}
function project(p: [number,number,number]): { x:number; y:number; depth:number } {
  const dz = p[2] + FOV
  const s = FOV / dz
  return { x: CX + p[0] * s, y: CY + p[1] * s, depth: p[2] }
}
function rot(p: [number,number,number], rx: number, ry: number): [number,number,number] {
  return rotX(rotY(p, ry), rx)
}

function spherePoint(theta: number, phi: number, r = R_SPHERE): [number,number,number] {
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ]
}

// ─── Branch generation ────────────────────────────────────────────────────────

function normalize3(v: [number,number,number]): [number,number,number] {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) || 1
  return [v[0]/len, v[1]/len, v[2]/len]
}

function perpVec(d: [number,number,number]): [number,number,number] {
  const ref: [number,number,number] = Math.abs(d[0]) < 0.9 ? [1,0,0] : [0,1,0]
  const x = d[1]*ref[2] - d[2]*ref[1]
  const y = d[2]*ref[0] - d[0]*ref[2]
  const z = d[0]*ref[1] - d[1]*ref[0]
  return normalize3([x, y, z])
}

function addVec(a: [number,number,number], b: [number,number,number], s = 1): [number,number,number] {
  return [a[0] + b[0]*s, a[1] + b[1]*s, a[2] + b[2]*s]
}

function scaleVec(v: [number,number,number], s: number): [number,number,number] {
  return [v[0]*s, v[1]*s, v[2]*s]
}

function rotAround(v: [number,number,number], axis: [number,number,number], angle: number): [number,number,number] {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const [ax, ay, az] = axis
  const dot = v[0]*ax + v[1]*ay + v[2]*az
  const cross: [number,number,number] = [ay*v[2]-az*v[1], az*v[0]-ax*v[2], ax*v[1]-ay*v[0]]
  return [
    v[0]*cos + cross[0]*sin + ax*dot*(1-cos),
    v[1]*cos + cross[1]*sin + ay*dot*(1-cos),
    v[2]*cos + cross[2]*sin + az*dot*(1-cos),
  ]
}

interface Branch3D {
  origin: [number,number,number]
  end:    [number,number,number]
  color: string; sw: number; op: number
  dots: Array<[number,number,number]>
}

function genBranches(
  origin: [number,number,number],
  dir: [number,number,number],
  z: number,
  color: string,
  out: Branch3D[],
  depth = 0,
  parentLen = 0,
) {
  if (depth > 3) return

  const len = parentLen === 0
    ? R_SPHERE * (0.15 + ((z + 3) / 6) * 0.55)
    : parentLen * (0.48 + Math.random() * 0.04)

  const end = addVec(origin, scaleVec(normalize3(dir), len))

  out.push({
    origin, end, color,
    sw: Math.max(0.5, 2.2 - depth * 0.55),
    op: Math.max(0.4, 0.92 - depth * 0.15),
    dots: depth >= 2 ? [end] : [],
  })

  if (depth >= (z > 0.8 ? 3 : z > -0.5 ? 2 : 1)) return

  const perp = perpVec(normalize3(dir))
  const spreadAngle = (0.32 + Math.abs(z) * 0.09) * (depth === 0 ? 1 : 0.75)

  for (const side of [-1, 1]) {
    const childDir = rotAround(normalize3(dir), perp, side * spreadAngle)
    const roll = perpVec(childDir)
    const finalDir = rotAround(childDir, normalize3(dir), side * 0.2 * depth)
    genBranches(end, finalDir, z, color, out, depth + 1, len)
  }
}

// ─── Sphere grid ──────────────────────────────────────────────────────────────

function buildGrid(): Seg3D[] {
  const segs: Seg3D[] = []
  const LATS = 6, LONS = 8, STEPS = 32

  for (let lat = 1; lat < LATS; lat++) {
    const phi = (lat / LATS) * Math.PI
    for (let s = 0; s < STEPS; s++) {
      const t1 = (s / STEPS) * 2 * Math.PI
      const t2 = ((s + 1) / STEPS) * 2 * Math.PI
      const [x1, y1, z1] = spherePoint(t1, phi)
      const [x2, y2, z2] = spherePoint(t2, phi)
      segs.push({ x1, y1, z1, x2, y2, z2 })
    }
  }
  for (let lon = 0; lon < LONS; lon++) {
    const theta = (lon / LONS) * 2 * Math.PI
    for (let s = 0; s < STEPS; s++) {
      const p1 = ((s / STEPS) * Math.PI)
      const p2 = (((s + 1) / STEPS) * Math.PI)
      const [x1, y1, z1] = spherePoint(theta, p1)
      const [x2, y2, z2] = spherePoint(theta, p2)
      segs.push({ x1, y1, z1, x2, y2, z2 })
    }
  }
  return segs
}

const GRID_SEGS = buildGrid()

// ─── Projection pass ──────────────────────────────────────────────────────────

function projectScene(
  branches: Branch3D[],
  rx: number, ry: number,
): Projected {
  const segs: Projected['segs'] = []
  const dots: Projected['dots'] = []

  for (const b of branches) {
    const p1 = project(rot(b.origin, rx, ry))
    const p2 = project(rot(b.end, rx, ry))
    segs.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: b.color, sw: b.sw, op: b.op })
    for (const d of b.dots) {
      const pd = project(rot(d, rx, ry))
      dots.push({ cx: pd.x, cy: pd.y, r: 1.5, fill: b.color, op: 0.85 })
    }
  }

  const grid: Projected['grid'] = []
  const GRID_STEP = 4
  for (let i = 0; i < GRID_SEGS.length; i += GRID_STEP) {
    const s = GRID_SEGS[i]
    const p1 = project(rot([s.x1, s.y1, s.z1], rx, ry))
    const p2 = project(rot([s.x2, s.y2, s.z2], rx, ry))
    const depth = (p1.depth + p2.depth) / 2
    grid.push({ d: `M${p1.x.toFixed(1)},${p1.y.toFixed(1)}L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`, depth })
  }

  return { segs, dots, grid }
}

// ─── Label positions ──────────────────────────────────────────────────────────

function groupLabels(rx: number, ry: number) {
  return ORB_GROUPS.map(g => {
    const anchor = spherePoint(g.theta, g.phi, R_SPHERE * 1.45)
    const p = project(rot(anchor, rx, ry))
    const visible = p.depth > -R_SPHERE * 0.6
    return { label: g.label, color: g.color, x: p.x, y: p.y, visible }
  })
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreGradient({ score, colors }: { score: number; colors: any }) {
  const pct = Math.max(0, Math.min(100, score))
  const barColor = pct >= 66 ? '#FAC775' : pct >= 33 ? '#D85A30' : '#8E8E93'
  return (
    <View style={orbSt.scoreWrap}>
      <View style={[orbSt.scoreTrack, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[orbSt.scoreFill, { height: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={[orbSt.scoreNum, { color: colors.textPrimary }]}>{pct}</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyoOrbScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const [sig, setSig] = useState<OrbSig | null>(null)
  const [loading, setLoading] = useState(true)

  const rxRef = useRef(-0.3)
  const ryRef = useRef(0.4)
  const [scene, setScene] = useState<Projected>({ segs: [], dots: [], grid: [] })
  const [labels, setLabels] = useState<ReturnType<typeof groupLabels>>([])
  const branchesRef = useRef<Branch3D[]>([])

  function reproject() {
    setScene(projectScene(branchesRef.current, rxRef.current, ryRef.current))
    setLabels(groupLabels(rxRef.current, ryRef.current))
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gs) => {
      ryRef.current += gs.vx * 0.04
      rxRef.current = Math.max(-1.4, Math.min(1.4, rxRef.current + gs.vy * 0.04))
      reproject()
    },
  })).current

  useEffect(() => {
    if (!id) return
    loadSig(id)
  }, [id])

  async function loadSig(workoutId: string) {
    const [sigRes, wRes] = await Promise.all([
      supabase
        .from('myo_signatures')
        .select('z_volume,z_intensite,z_structure,z_recovery,z_performance,z_regularite,score,z_extended')
        .eq('workout_id', workoutId)
        .maybeSingle(),
      supabase
        .from('workouts')
        .select('title')
        .eq('id', workoutId)
        .maybeSingle(),
    ])

    if (!sigRes.data) { setLoading(false); return }

    const s = sigRes.data as any
    const loaded: OrbSig = {
      z_volume: s.z_volume ?? 0, z_intensite: s.z_intensite ?? 0,
      z_structure: s.z_structure ?? 0, z_recovery: s.z_recovery ?? 0,
      z_performance: s.z_performance ?? 0, z_regularite: s.z_regularite ?? 0,
      score: s.score ?? 50,
      z_extended: s.z_extended ?? {},
      workout_title: (wRes.data as any)?.title ?? 'Séance',
    }
    setSig(loaded)
    buildScene(loaded)
    setLoading(false)
  }

  function buildScene(s: OrbSig) {
    const coreZ: Record<string, number> = {
      volume_kg: s.z_volume, densite: s.z_intensite, nb_series: s.z_structure,
      recuperation: s.z_recovery, nb_pr: s.z_performance, streak: s.z_regularite,
    }
    const allZ = { ...coreZ, ...s.z_extended }

    const branches: Branch3D[] = []

    for (const g of ORB_GROUPS) {
      const zVals = g.zKeys.map(k => allZ[k] ?? 0).filter(v => isFinite(v))
      const z = zVals.length ? zVals.reduce((a, b) => a + b, 0) / zVals.length : 0

      const anchor = spherePoint(g.theta, g.phi)
      const dir = normalize3(anchor)
      genBranches(anchor, dir, z, g.color, branches)
    }

    branchesRef.current = branches
    setScene(projectScene(branches, rxRef.current, ryRef.current))
    setLabels(groupLabels(rxRef.current, ryRef.current))
  }

  if (loading) {
    return (
      <View style={[orbSt.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  if (!sig) {
    return (
      <View style={[orbSt.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Signature introuvable</Text>
      </View>
    )
  }

  return (
    <View style={[orbSt.container, { backgroundColor: '#0a0a0c' }]}>
      {/* Header */}
      <View style={orbSt.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[orbSt.back, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={orbSt.headerMid}>
          <Text style={orbSt.title}>{sig.workout_title}</Text>
          <Text style={orbSt.hint}>glisser · rotation</Text>
        </View>
        <ScoreGradient score={sig.score} colors={colors} />
      </View>

      {/* Orb */}
      <View style={orbSt.canvas} {...panResponder.panHandlers}>
        <Svg width={SIZE} height={SIZE}>
          {/* Sphere grid — back half first */}
          {scene.grid
            .filter(g => g.depth < 0)
            .map((g, i) => (
              <Path key={`gb${i}`} d={g.d} stroke="#ffffff" strokeWidth={0.3} opacity={0.07} fill="none" />
            ))}

          {/* Branches */}
          {scene.segs.map((s, i) => (
            <Path
              key={`s${i}`}
              d={`M${s.x1.toFixed(1)},${s.y1.toFixed(1)}L${s.x2.toFixed(1)},${s.y2.toFixed(1)}`}
              stroke={s.stroke} strokeWidth={s.sw} opacity={s.op} fill="none" strokeLinecap="round"
            />
          ))}

          {/* Dots */}
          {scene.dots.map((d, i) => (
            <Circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={d.op} />
          ))}

          {/* Sphere grid — front half */}
          {scene.grid
            .filter(g => g.depth >= 0)
            .map((g, i) => (
              <Path key={`gf${i}`} d={g.d} stroke="#ffffff" strokeWidth={0.4} opacity={0.12} fill="none" />
            ))}

          {/* Center */}
          <Circle cx={CX} cy={CY} r={6} fill="#ffffff" opacity={0.4} />
          <Circle cx={CX} cy={CY} r={3} fill="#ffffff" opacity={0.8} />
        </Svg>

        {/* Floating labels */}
        {labels.map((l, i) => l.visible && (
          <Text
            key={i}
            style={[orbSt.floatLabel, { color: l.color, left: l.x - 30, top: l.y - 8 }]}
            pointerEvents="none"
          >
            {l.label}
          </Text>
        ))}
      </View>

      {/* Legend */}
      <View style={orbSt.legend}>
        {ORB_GROUPS.map(g => (
          <View key={g.id} style={orbSt.legendItem}>
            <View style={[orbSt.legendDot, { backgroundColor: g.color }]} />
            <Text style={orbSt.legendText}>{g.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const orbSt = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 12,
    gap: 10,
  },
  back: { fontSize: 32, fontWeight: '300', lineHeight: 34 },
  headerMid: { flex: 1, gap: 2 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { color: '#ffffff44', fontSize: 11 },
  canvas: {
    alignSelf: 'center',
    width: SIZE,
    height: SIZE,
    position: 'relative',
  },
  floatLabel: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '600',
    width: 60,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 24, paddingTop: 12, justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { color: '#ffffff66', fontSize: 11 },
  scoreWrap: { alignItems: 'center', gap: 4 },
  scoreTrack: {
    width: 8, height: 60, borderRadius: 4, overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  scoreFill: { width: '100%', borderRadius: 4 },
  scoreNum: { fontSize: 12, fontWeight: '700' },
})
