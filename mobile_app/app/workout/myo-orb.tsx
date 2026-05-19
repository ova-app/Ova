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

// ─── Props ─────────────────────────────────────────────────────────────────
interface Props {
  /** 8 familles × ~5 sous-variables = 41 dims, valeurs normalisées [0,1].
   *  Ordre familles : volume · intensité · structure · récup · perf · régularité · muscles · temps */
  sessionValues?: number[][]
  averageValues?: number[][]
  size?: number
}

// ─── Config géométrique ────────────────────────────────────────────────────
const TWO_PI     = Math.PI * 2
const N_SECTORS  = 8
const SECTOR_ANG = TWO_PI / N_SECTORS
const N_RINGS    = 42
const N_SEGS     = 140
const N_SPOKES   = 26
const MAX_R      = 1.8
const H_TOP      = 0.9
const H_BOT      = 0.45

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
  ['Push', 'Pull', 'Jambes', 'Gainage', 'Équilibre'],
  ['Durée', 'Tempo', 'Densité', 'Efficacité', 'Timing'],
]

const SECTOR_COLORS_HEX = [
  '#f97316', '#ef4444', '#8b5cf6', '#06b6d4',
  '#fac775', '#22c55e', '#ec4899', '#3b82f6',
]

const SECTOR_COLORS: readonly number[] = [
  0xf97316, 0xef4444, 0x8b5cf6, 0x06b6d4,
  0xfac775, 0x22c55e, 0xec4899, 0x3b82f6,
]

// ─── Mapping 41 dimensions ─────────────────────────────────────────────────
const N_DIMS_PER_FAM = [6, 5, 5, 5, 5, 5, 5, 5] as const

// ─── Mock data ─────────────────────────────────────────────────────────────
const MOCK_SESSION: number[][] = [
  [0.92, 0.78, 0.85, 0.71, 0.88, 0.65],
  [0.70, 0.82, 0.61, 0.75, 0.68],
  [0.55, 0.63, 0.48, 0.72, 0.58],
  [0.45, 0.52, 0.38, 0.61, 0.49],
  [0.88, 0.94, 0.77, 0.82, 0.91],
  [0.60, 0.55, 0.68, 0.52, 0.63],
  [0.75, 0.82, 0.68, 0.71, 0.79],
  [0.42, 0.38, 0.51, 0.46, 0.35],
]

const MOCK_AVERAGE: number[][] = [
  [0.72, 0.65, 0.70, 0.58, 0.75, 0.62],
  [0.58, 0.65, 0.52, 0.61, 0.55],
  [0.50, 0.55, 0.45, 0.60, 0.48],
  [0.58, 0.62, 0.48, 0.55, 0.52],
  [0.72, 0.78, 0.65, 0.70, 0.75],
  [0.48, 0.52, 0.55, 0.45, 0.50],
  [0.62, 0.68, 0.58, 0.61, 0.65],
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
        harmN     : 64 + vi * 6,
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

// ─── Géométries ────────────────────────────────────────────────────────────
function makeTopoGeo(
  data: number[][],
  maxH: number,
  sign: 1 | -1,
  colored: boolean,
): THREE.BufferGeometry {
  const ringS  = N_RINGS * N_SEGS
  const spokeS = N_SPOKES * N_RINGS
  const total  = ringS + spokeS

  const pos = new Float32Array(total * 6)
  const col = colored ? new Float32Array(total * 6) : null

  const setV = (
    si: number,
    vi: 0 | 1,
    x: number,
    y: number,
    z: number,
    c?: [number, number, number],
  ): void => {
    const b = si * 6 + vi * 3
    pos[b] = x; pos[b + 1] = y; pos[b + 2] = z
    if (col && c) { col[b] = c[0]; col[b + 1] = c[1]; col[b + 2] = c[2] }
  }

  for (let ri = 0; ri < N_RINGS; ri++) {
    const r = ((ri + 1) / N_RINGS) * MAX_R
    for (let si = 0; si < N_SEGS; si++) {
      const a1  = (si / N_SEGS) * TWO_PI
      const a2  = ((si + 1) / N_SEGS) * TWO_PI
      const idx = ri * N_SEGS + si
      setV(idx, 0, r * Math.cos(a1), sign * getH(r, a1, data, maxH), r * Math.sin(a1), colored ? getC(a1) : undefined)
      setV(idx, 1, r * Math.cos(a2), sign * getH(r, a2, data, maxH), r * Math.sin(a2), colored ? getC(a2) : undefined)
    }
  }

  for (let sp = 0; sp < N_SPOKES; sp++) {
    const a = (sp / N_SPOKES) * TWO_PI
    const c = colored ? getC(a) : undefined
    for (let ri = 0; ri < N_RINGS; ri++) {
      const r1  = (ri / N_RINGS) * MAX_R
      const r2  = ((ri + 1) / N_RINGS) * MAX_R
      const idx = ringS + sp * N_RINGS + ri
      setV(idx, 0, r1 * Math.cos(a), sign * getH(r1, a, data, maxH), r1 * Math.sin(a), c)
      setV(idx, 1, r2 * Math.cos(a), sign * getH(r2, a, data, maxH), r2 * Math.sin(a), c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

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

// ─── Géo session — un secteur à la fois (pour highlighting) ───────────────
function makeTopoGeoSector(
  fi: number,
  data: number[][],
  maxH: number,
  sign: 1 | -1,
  colored: boolean,
): THREE.BufferGeometry {
  const pts: number[] = []
  const cols: number[] = []

  for (let ri = 0; ri < N_RINGS; ri++) {
    const r = ((ri + 1) / N_RINGS) * MAX_R
    for (let si = 0; si < N_SEGS; si++) {
      const a1  = (si / N_SEGS) * TWO_PI
      const a2  = ((si + 1) / N_SEGS) * TWO_PI
      const mid = (a1 + a2) / 2
      if (Math.floor(((mid % TWO_PI + TWO_PI) % TWO_PI) / SECTOR_ANG) % N_SECTORS !== fi) continue
      pts.push(
        r * Math.cos(a1), sign * getH(r, a1, data, maxH), r * Math.sin(a1),
        r * Math.cos(a2), sign * getH(r, a2, data, maxH), r * Math.sin(a2),
      )
      if (colored) {
        const c1 = getC(a1); cols.push(c1[0], c1[1], c1[2])
        const c2 = getC(a2); cols.push(c2[0], c2[1], c2[2])
      }
    }
  }

  for (let sp = 0; sp < N_SPOKES; sp++) {
    const a = (sp / N_SPOKES) * TWO_PI
    if (Math.floor(((a % TWO_PI + TWO_PI) % TWO_PI) / SECTOR_ANG) % N_SECTORS !== fi) continue
    const c = colored ? getC(a) : undefined
    for (let ri = 0; ri < N_RINGS; ri++) {
      const r1 = (ri / N_RINGS) * MAX_R
      const r2 = ((ri + 1) / N_RINGS) * MAX_R
      pts.push(
        r1 * Math.cos(a), sign * getH(r1, a, data, maxH), r1 * Math.sin(a),
        r2 * Math.cos(a), sign * getH(r2, a, data, maxH), r2 * Math.sin(a),
      )
      if (colored && c) cols.push(c[0], c[1], c[2], c[0], c[1], c[2])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  if (colored && cols.length > 0) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
  }
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
  sessionValues = MOCK_SESSION,
  averageValues = MOCK_AVERAGE,
  size,
}: Props) {
  const { width } = Dimensions.get('window')
  const S = size ?? width - 32

  // ─── State ───────────────────────────────────────────────────────────────
  const [selectedFamily, setSelectedFamily] = useState<number | null>(null)
  const [labelScreenPos, setLabelScreenPos] = useState<LabelPos[]>(
    Array.from({ length: N_SECTORS }, () => ({ x: 0, y: 0, visible: false })),
  )

  // ─── Refs partagés GL ↔ React ────────────────────────────────────────────
  const rafRef          = useRef<number | null>(null)
  const cameraRef       = useRef<THREE.PerspectiveCamera | null>(null)
  const sceneRef        = useRef<THREE.Scene | null>(null)
  const sceneRotYRef    = useRef(0)
  const targetRotYRef   = useRef(0)
  const autoRotateRef   = useRef(true)
  const selectedRef     = useRef<number | null>(null)
  const svRef           = useRef(sessionValues)
  const avRef           = useRef(averageValues)
  const sessionMatsRef  = useRef<THREE.LineBasicMaterial[]>([])
  const avgMatRef       = useRef<THREE.LineBasicMaterial | null>(null)
  const hitboxMeshesRef = useRef<THREE.Mesh[]>([])

  // ─── Positions 3D des étiquettes — dessus du pic de chaque secteur ───────
  const labelPositions3D = useMemo((): THREE.Vector3[] => {
    return Array.from({ length: N_SECTORS }, (_, fi) => {
      const sA = fi * SECTOR_ANG + SECTOR_ANG / 2
      let maxH = 0
      for (let s = 0; s < 20; s++) {
        const a = fi * SECTOR_ANG + ((s + 0.5) / 20) * SECTOR_ANG
        for (let rI = 1; rI <= 8; rI++) {
          const h = getH((rI / 8) * MAX_R, a, sessionValues, H_TOP)
          if (h > maxH) maxH = h
        }
      }
      return new THREE.Vector3(
        MAX_R * 0.65 * Math.cos(sA),
        maxH + 0.22,
        MAX_R * 0.65 * Math.sin(sA),
      )
    })
  }, [sessionValues])

  // ─── Mise à jour positions 2D des labels (15 fps) ────────────────────────
  useEffect(() => {
    // Alloués une fois, réutilisés à chaque tick
    const euler  = new THREE.Euler()
    const tmpW   = new THREE.Vector3()
    const tmpV   = new THREE.Vector3()

    const id = setInterval(() => {
      const cam = cameraRef.current
      if (!cam) return
      euler.set(0, sceneRotYRef.current, 0)

      const positions: LabelPos[] = labelPositions3D.map(p => {
        tmpW.copy(p).applyEuler(euler)
        // Vérifier que le point est devant la caméra (camera-space z < 0)
        tmpV.copy(tmpW).applyMatrix4(cam.matrixWorldInverse)
        if (tmpV.z > -0.1) return { x: 0, y: 0, visible: false }
        // Projection NDC
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

    return () => clearInterval(id)
  }, [labelPositions3D, S])

  // ─── Fermeture panneau ───────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setSelectedFamily(null)
    selectedRef.current = null
    autoRotateRef.current = true
  }, [])

  // ─── Raycasting sur hitboxes invisibles ──────────────────────────────────
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: evt => {
        const cam     = cameraRef.current
        const scene   = sceneRef.current
        const hitboxes = hitboxMeshesRef.current
        if (!cam || !scene || hitboxes.length === 0) return

        const { locationX, locationY } = evt.nativeEvent
        const ndcX = (locationX - S / 2) / (S / 2)
        const ndcY = -((locationY - S / 2) / (S / 2))

        // Force la mise à jour des matrices monde (hitboxes tournent avec la scène)
        scene.updateMatrixWorld(true)

        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam)
        const intersects = raycaster.intersectObjects(hitboxes, false)

        if (intersects.length === 0) {
          setSelectedFamily(null)
          selectedRef.current = null
          autoRotateRef.current = true
          return
        }

        const fi = intersects[0].object.userData.sectorIndex as number

        if (selectedRef.current === fi) {
          setSelectedFamily(null)
          selectedRef.current = null
          autoRotateRef.current = true
        } else {
          setSelectedFamily(fi)
          selectedRef.current = fi
          autoRotateRef.current = false
          const sA = fi * SECTOR_ANG + SECTOR_ANG / 2
          targetRotYRef.current = sA - Math.PI / 2
        }
      },
    }),
    [S],
  )

  // ─── Cleanup RAF ─────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
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
    renderer.setClearColor(0x080808, 1)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)
    camera.position.set(0, 3.2, 4.8)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    cameraRef.current = camera
    sceneRef.current  = scene

    // 8 LineSegments session — un par secteur, matériau indépendant
    const mats: THREE.LineBasicMaterial[] = []
    for (let fi = 0; fi < N_SECTORS; fi++) {
      const mat = new THREE.LineBasicMaterial({ vertexColors: true })
      mats.push(mat)
      scene.add(new THREE.LineSegments(
        makeTopoGeoSector(fi, svRef.current, H_TOP, 1, true),
        mat,
      ))
    }
    sessionMatsRef.current = mats

    // Terrain historique — un seul bloc, teinté bleu
    const avgMat = new THREE.LineBasicMaterial({ color: 0x4e7d9e })
    avgMatRef.current = avgMat
    scene.add(new THREE.LineSegments(makeTopoGeo(avRef.current, H_BOT, -1, false), avgMat))

    scene.add(new THREE.LineSegments(
      makeSocleGeo(),
      new THREE.LineBasicMaterial({ color: 0x606060 }),
    ))

    // 8 hitboxes invisibles — pie-slices Y=0, tournent avec la scène
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

      // Highlighting — recompile les matériaux uniquement si la sélection change
      const sel = selectedRef.current
      if (sel !== prevSel) {
        prevSel = sel
        for (let fi = 0; fi < N_SECTORS; fi++) {
          const mat    = mats[fi]
          const dimmed = sel !== null && fi !== sel
          mat.opacity     = dimmed ? 0.13 : 1.0
          mat.transparent = dimmed
          mat.needsUpdate = true
        }
        avgMat.opacity     = sel !== null ? 0.20 : 1.0
        avgMat.transparent = sel !== null
        avgMat.needsUpdate = true
      }

      renderer.render(scene, camera)
      gl.endFrameEXP()
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────
  const accentHex = selectedFamily !== null ? SECTOR_COLORS_HEX[selectedFamily] : '#ffffff'

  return (
    <View style={[styles.wrap, { width: S, height: S }]}>
      {/* Canvas 3D */}
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />

      {/* Étiquettes flottantes — non interactives */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {labelScreenPos.map((pos, i) => (
          <Text
            key={i}
            style={[
              styles.label,
              {
                left     : pos.x,
                top      : pos.y,
                opacity  : pos.visible
                  ? (selectedFamily !== null && selectedFamily !== i ? 0.28 : 1)
                  : 0,
                color    : selectedFamily === i
                  ? SECTOR_COLORS_HEX[i]
                  : 'rgba(255,255,255,0.52)',
                transform: [{ scale: selectedFamily === i ? 1.18 : 1 }],
              },
            ]}
          >
            {FAMILY_NAMES[i]}
          </Text>
        ))}
      </View>

      {/* Couche tactile — par-dessus tout, capture les taps */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />

      {/* Panneau détail — par-dessus la couche tactile, absorbe ses propres taps */}
      {selectedFamily !== null && (
        <View
          style={styles.detailPanel}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.detailAccentBar, { backgroundColor: accentHex }]} />
          <View style={styles.detailHeader}>
            <Text style={[styles.detailTitle, { color: accentHex }]}>
              {FAMILY_NAMES[selectedFamily]}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeBtnText}>×</Text>
            </TouchableOpacity>
          </View>
          {DIM_NAMES[selectedFamily].map((name, i) => {
            const val = sessionValues[selectedFamily]?.[i] ?? 0
            return (
              <View key={i} style={styles.dimRow}>
                <Text style={styles.dimName}>{name}</Text>
                <View style={styles.dimBarBg}>
                  <View
                    style={[
                      styles.dimBarFill,
                      { width: `${Math.round(val * 100)}%`, backgroundColor: accentHex },
                    ]}
                  />
                </View>
                <Text style={styles.dimVal}>{Math.round(val * 100)}</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius   : 16,
    overflow       : 'hidden',
    backgroundColor: '#080808',
  },
  label: {
    position     : 'absolute',
    fontSize     : 9,
    fontWeight   : '700',
    letterSpacing: 1.2,
  },
  detailPanel: {
    position       : 'absolute',
    bottom         : 12,
    left           : 12,
    right          : 12,
    backgroundColor: 'rgba(8,8,8,0.90)',
    borderRadius   : 12,
    borderWidth    : 1,
    borderColor    : 'rgba(255,255,255,0.09)',
    padding        : 14,
    paddingTop     : 16,
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
    justifyContent: 'space-between',
    marginBottom  : 10,
  },
  detailTitle: {
    fontSize     : 12,
    fontWeight   : '700',
    letterSpacing: 1.6,
  },
  closeBtn: {
    width          : 24,
    height         : 24,
    alignItems     : 'center',
    justifyContent : 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius   : 12,
  },
  closeBtnText: {
    color     : 'rgba(255,255,255,0.55)',
    fontSize  : 16,
    lineHeight: 18,
    fontWeight: '300',
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