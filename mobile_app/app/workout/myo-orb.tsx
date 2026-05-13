// npm install @react-three/fiber --legacy-peer-deps
// (three + expo-gl already installed)

import React, { useRef, useMemo, useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Dimensions, ActivityIndicator,
  TouchableOpacity, PanResponder, Animated,
} from 'react-native'
import { Canvas, useFrame, useThree } from '@react-three/fiber/native'
import * as THREE from 'three'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import Svg, { Path, Circle } from 'react-native-svg'

// ─── GLSL ─────────────────────────────────────────────────────────────────────

// Uniform block injected before void main()
const GLSL_UNIFORMS = `
uniform vec3  uAttractors[8];
uniform float uWeights[8];
uniform float uTime;
`

// Ashima 3D simplex noise — GLSL ES 1.0, prefixed to avoid symbol collisions
const GLSL_NOISE = `
vec3  _mn3(vec3  x){return x-floor(x*(1./289.))*289.;}
vec4  _mn4(vec4  x){return x-floor(x*(1./289.))*289.;}
vec4  _mp(vec4   x){return _mn4(((x*34.)+1.)*x);}
vec4  _ti(vec4   r){return 1.79284291400159-0.85373472095314*r;}
float myo_snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i =floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g =step(x0.yzx,x0.xyz);
  vec3 l =1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=_mn3(i);
  vec4 p=_mp(_mp(_mp(
    i.z+vec4(0.,i1.z,i2.z,1.))+
    i.y+vec4(0.,i1.y,i2.y,1.))+
    i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=_ti(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

// Injected immediately after #include <begin_vertex>
// At that point `transformed` = vec3(position) — we overwrite it with displaced pos.
// Radial displacement preserves normal direction → matcap UVs stay correct.
const GLSL_DISPLACE = `
{
  vec3 dir = normalize(transformed);
  float field = 0.0;
  for(int i = 0; i < 8; i++){
    vec3 d = dir - uAttractors[i];
    field += uWeights[i] * 0.55 / (dot(d,d) + 0.045);
  }
  float blob = 1.0 + min(0.48, field * 0.068);
  // three noise octaves: large organic bulges + medium channels + micro-texture
  float n1 = myo_snoise(dir * 2.3  + uTime * 0.18);
  float n2 = myo_snoise(dir * 5.1  + uTime * 0.12) * 0.42;
  float n3 = myo_snoise(dir * 11.0 + uTime * 0.07) * 0.15;
  // positive noise peaks carve concave pores; negative peaks raise ridges
  float pore = max(0.0, n1 + n2 + n3) * 0.28;
  transformed = dir * (blob - pore);
}
`

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrbSig {
  z_volume: number; z_intensite: number; z_structure: number
  z_recovery: number; z_performance: number; z_regularite: number
  score: number; z_extended: Record<string, number>; workout_title: string
}

interface FamilyNode {
  id: string; label: string; color: string
  theta: number; phi: number; famZ: number
  vars: Array<{ key: string; label: string; z: number }>
}

interface ProjEntry { id: string; sx: number; sy: number; behind: boolean }

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window')
const SIZE = Math.min(SW - 32, 400)
const CX = SIZE / 2

const VAR_LABELS: Record<string, string> = {
  volume_kg: 'Volume', densite: 'Densité', charge_relative: 'Charge rel.',
  max_1rm_kg: '1RM max', nb_series: 'Séries', nb_exercices: 'Exercices',
  recuperation: 'Récup.', temps_repos_moy_sec: 'Repos moy.',
  nb_pr: 'PRs', mean_evolution_volume: 'Évolution',
  streak: 'Streak', frequence_hebdo: 'Fréquence',
  nb_muscles: 'Muscles', hhi_muscles: 'Répartition', share_dominant: 'Dominant',
  duree_sec: 'Durée', ratio_actif: 'Ratio actif',
}

const GROUPS: Array<{ id: string; label: string; color: string; zKeys: string[] }> = [
  { id: 'volume',       label: 'Volume',    color: '#D85A30', zKeys: ['volume_kg'] },
  { id: 'intensite',    label: 'Intensité', color: '#FAC775', zKeys: ['densite', 'charge_relative', 'max_1rm_kg'] },
  { id: 'structure',    label: 'Structure', color: '#9B59B6', zKeys: ['nb_series', 'nb_exercices'] },
  { id: 'recuperation', label: 'Récup.',    color: '#50C878', zKeys: ['recuperation', 'temps_repos_moy_sec'] },
  { id: 'performance',  label: 'Perf.',     color: '#4A9EFF', zKeys: ['nb_pr', 'mean_evolution_volume'] },
  { id: 'regularite',   label: 'Constance', color: '#FF9800', zKeys: ['streak', 'frequence_hebdo'] },
  { id: 'muscles',      label: 'Muscles',   color: '#00BCD4', zKeys: ['nb_muscles', 'hhi_muscles', 'share_dominant'] },
  { id: 'temps',        label: 'Durée',     color: '#E91E63', zKeys: ['duree_sec', 'ratio_actif'] },
]

const NODE_PHI = GROUPS.map((_, i) => i % 2 === 0 ? Math.PI * 0.38 : Math.PI * 0.62)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = -3, hi = 3): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 0))
}

function buildFamilyNodes(sig: OrbSig): FamilyNode[] {
  const coreZ: Record<string, number> = {
    volume_kg: sig.z_volume, densite: sig.z_intensite,
    nb_series: sig.z_structure, recuperation: sig.z_recovery,
    nb_pr: sig.z_performance, streak: sig.z_regularite,
  }
  const allZ = { ...coreZ, ...sig.z_extended }
  return GROUPS.map((g, i) => {
    const zVals = g.zKeys.map(k => clamp(allZ[k] ?? 0))
    const famZ  = zVals.reduce((a, b) => a + b, 0) / zVals.length
    return {
      id: g.id, label: g.label, color: g.color,
      theta: (i / GROUPS.length) * 2 * Math.PI,
      phi: NODE_PHI[i], famZ,
      vars: g.zKeys.map((k, vi) => ({ key: k, label: VAR_LABELS[k] ?? k, z: zVals[vi] })),
    }
  })
}

// ─── Score arc ────────────────────────────────────────────────────────────────

const ARC_SZ = 72, ARC_CX = 36, ARC_CY = 36, ARC_R = 27
const A0 = 150 * Math.PI / 180, ASWEEP = 240 * Math.PI / 180

function arcPath(cx: number, cy: number, r: number, a0: number, sweep: number): string {
  const sx = cx + r * Math.cos(a0), sy = cy + r * Math.sin(a0)
  const ex = cx + r * Math.cos(a0 + sweep), ey = cy + r * Math.sin(a0 + sweep)
  return `M${sx.toFixed(2)},${sy.toFixed(2)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${ex.toFixed(2)},${ey.toFixed(2)}`
}

function ScoreArc({ score }: { score: number }) {
  const pct   = Math.max(0, Math.min(100, score)) / 100
  const color = pct >= 0.66 ? '#FAC775' : pct >= 0.33 ? '#D85A30' : '#8E8E93'
  return (
    <View style={{ width: ARC_SZ, height: ARC_SZ }}>
      <Svg width={ARC_SZ} height={ARC_SZ}>
        <Path d={arcPath(ARC_CX, ARC_CY, ARC_R, A0, ASWEEP)}
          stroke="#ffffff14" strokeWidth={4.5} fill="none" strokeLinecap="round" />
        {pct > 0.01 && (
          <Path d={arcPath(ARC_CX, ARC_CY, ARC_R, A0, ASWEEP * pct)}
            stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        )}
        <Circle cx={ARC_CX} cy={ARC_CY} r={10} fill={color} opacity={0.07} />
        <Circle cx={ARC_CX} cy={ARC_CY} r={3}  fill={color} opacity={0.22} />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={st.arcCenter}>
          <Text style={[st.arcNum, { color: '#fff' }]}>{Math.round(score)}</Text>
          <Text style={st.arcLabel}>MYO</Text>
        </View>
      </View>
    </View>
  )
}

// ─── R3F: BlobMesh ────────────────────────────────────────────────────────────

interface BlobMeshProps {
  nodes:      FamilyNode[]
  meshRef:    React.MutableRefObject<THREE.Mesh | null>
  cameraRef:  React.MutableRefObject<THREE.PerspectiveCamera | null>
  ryRef:      React.MutableRefObject<number>
  isInteract: React.MutableRefObject<boolean>
  projRef:    React.MutableRefObject<ProjEntry[]>
  onFrame:    () => void
}

// Procedural matte-ceramic matcap — no DOM, no network, works immediately in expo-gl.
// Key light upper-left (warm), soft fill, slight rim lower-right.
function createCeramicMatcap(): THREE.DataTexture {
  const SZ = 128
  const data = new Uint8Array(SZ * SZ * 4)
  for (let y = 0; y < SZ; y++) {
    for (let x = 0; x < SZ; x++) {
      const u = (x / (SZ - 1)) * 2 - 1
      const v = (y / (SZ - 1)) * 2 - 1
      const key = Math.exp(-((u + 0.45) ** 2 + (v + 0.55) ** 2) * 2.8) * 0.72
      const rim = Math.exp(-((u - 0.5)  ** 2 + (v - 0.4)  ** 2) * 5.5) * 0.18
      const b   = Math.min(1, 0.52 + key + rim)
      const i   = (y * SZ + x) * 4
      data[i] = Math.round(b * 248); data[i+1] = Math.round(b * 245)
      data[i+2] = Math.round(b * 240); data[i+3] = 255
    }
  }
  const t = new THREE.DataTexture(data, SZ, SZ, THREE.RGBAFormat)
  t.needsUpdate = true
  return t
}

function BlobMesh({ nodes, meshRef, cameraRef, ryRef, isInteract, projRef, onFrame }: BlobMeshProps) {
  const { camera, size } = useThree()

  // Shader uniforms shared by reference — updated each frame without recompile
  const uniforms = useRef({
    uAttractors: {
      value: nodes.map(n => new THREE.Vector3(
        Math.sin(n.phi) * Math.cos(n.theta),
        -Math.cos(n.phi),
        Math.sin(n.phi) * Math.sin(n.theta),
      )),
    },
    uWeights: { value: nodes.map(n => Math.max(0, (n.famZ + 3) / 6)) },
    uTime:    { value: 0.0 },
  })

  // Procedural DataTexture — zero DOM/network access, works immediately in expo-gl.
  // To use a real photo matcap: load it via expo-asset (Asset.fromModule(require(...))),
  // get its localUri, then assign to material.matcap inside onContextCreate.
  // THREE.TextureLoader and any fetch-based loading call document.createElementNS → crash in RN.
  const ceramicMatcap = useMemo(() => createCeramicMatcap(), [])

  // IcosahedronGeometry detail 6 → ~40k verts, 81k triangles.
  // "args={[1, 64]}" in JSX would mean detail=64 = 20×4^64 triangles → instant crash.
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.0, 6)
    g.computeVertexNormals()
    return g
  }, [])

  // MeshMatcapMaterial + custom vertex displacement via onBeforeCompile.
  // No lights needed — matcap bakes the full lighting illusion into the texture.
  const material = useMemo(() => {
    const m = new THREE.MeshMatcapMaterial({ matcap: ceramicMatcap })
    m.customProgramCacheKey = () => 'myo-blob-r3f-v1'
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms.current)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${GLSL_UNIFORMS}\n${GLSL_NOISE}`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${GLSL_DISPLACE}`,
      )
    }
    return m
  }, [ceramicMatcap])

  useEffect(() => () => { geometry.dispose(); material.dispose(); ceramicMatcap.dispose() }, [geometry, material, ceramicMatcap])

  const _tmp = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    // Sync camera ref for RN label projection
    cameraRef.current = camera as THREE.PerspectiveCamera

    // Auto-rotate when user isn't touching
    if (!isInteract.current) ryRef.current += 0.003
    if (meshRef.current) meshRef.current.rotation.y = ryRef.current

    // Animate displacement noise
    uniforms.current.uTime.value += delta * 0.5

    // Project all 8 attractor positions to screen coords for the RN label overlay.
    // This is the mobile equivalent of drei <Html> anchored to 3D coordinates.
    const w = size.width, h = size.height
    projRef.current = nodes.map(n => {
      _tmp.current
        .set(
          Math.sin(n.phi) * Math.cos(n.theta),
          -Math.cos(n.phi),
          Math.sin(n.phi) * Math.sin(n.theta),
        )
        .multiplyScalar(1.45)
        .applyEuler(new THREE.Euler(0, ryRef.current, 0))
        .project(camera)
      return {
        id:     n.id,
        sx:     (_tmp.current.x + 1) / 2 * w,
        sy:     -(_tmp.current.y - 1) / 2 * h,
        behind: _tmp.current.z > 1.0,
      }
    })

    onFrame()
  })

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} scale={1.45} />
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyoOrbScreen() {
  const { id }     = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()

  const [sig, setSig]           = useState<OrbSig | null>(null)
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [, setFrame]            = useState(0)

  const fadeAnim    = useRef(new Animated.Value(0)).current
  const detailAnim  = useRef(new Animated.Value(0)).current
  const nodesRef    = useRef<FamilyNode[]>([])
  const meshRef     = useRef<THREE.Mesh | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const ryRef       = useRef(0)
  const isInteract  = useRef(false)
  const lastXRef    = useRef(0)
  const selectedRef = useRef<string | null>(null)
  const projRef     = useRef<ProjEntry[]>([])
  const tapOrigin   = useRef({ x: 0, y: 0 })
  const frameCount  = useRef(0)

  const onFrame = () => {
    frameCount.current++
    // Labels refresh at ~10 fps — no need to match the 30 fps render loop
    if (frameCount.current % 3 === 0) setFrame(f => f + 1)
  }

  function selectFamily(fid: string | null) {
    selectedRef.current = fid
    setSelected(fid)
    Animated.spring(detailAnim, {
      toValue: fid ? 1 : 0, useNativeDriver: true, tension: 80, friction: 12,
    }).start()
  }

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e, gs) => {
      isInteract.current = true
      lastXRef.current   = gs.moveX
      tapOrigin.current  = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
    },
    onPanResponderMove: (_, gs) => {
      const dx = gs.moveX - lastXRef.current
      lastXRef.current = gs.moveX
      ryRef.current   -= dx * 0.005
    },
    onPanResponderRelease: (_, gs) => {
      isInteract.current = false
      // Tap: less than 8px movement → hit-test against projected attractor positions
      if (Math.abs(gs.dx) < 8 && Math.abs(gs.dy) < 8) {
        const { x, y } = tapOrigin.current
        let best: string | null = null, minD = Infinity
        for (const p of projRef.current) {
          if (p.behind) continue
          const d = Math.hypot(p.sx - x, p.sy - y)
          if (d < 44 && d < minD) { minD = d; best = p.id }
        }
        selectFamily(best && best !== selectedRef.current ? best : null)
      }
    },
    onPanResponderTerminate: () => { isInteract.current = false },
  })).current

  useEffect(() => { if (id) loadSig(id) }, [id])

  async function loadSig(wid: string) {
    const [sigRes, wRes] = await Promise.all([
      supabase.from('myo_signatures')
        .select('z_volume,z_intensite,z_structure,z_recovery,z_performance,z_regularite,score,z_extended')
        .eq('workout_id', wid).maybeSingle(),
      supabase.from('workouts').select('title').eq('id', wid).maybeSingle(),
    ])
    if (!sigRes.data) { setLoading(false); return }
    const s = sigRes.data as any
    const loaded: OrbSig = {
      z_volume: s.z_volume ?? 0, z_intensite: s.z_intensite ?? 0,
      z_structure: s.z_structure ?? 0, z_recovery: s.z_recovery ?? 0,
      z_performance: s.z_performance ?? 0, z_regularite: s.z_regularite ?? 0,
      score: s.score ?? 50, z_extended: s.z_extended ?? {},
      workout_title: (wRes.data as any)?.title ?? 'Séance',
    }
    nodesRef.current = buildFamilyNodes(loaded)
    setSig(loaded)
    setLoading(false)
    Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }).start()
  }

  const selectedNode = selected
    ? nodesRef.current.find(n => n.id === selected) ?? null
    : null

  if (loading) return (
    <View style={[st.center, { backgroundColor: '#0a0a0a' }]}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  )
  if (!sig) return (
    <View style={[st.center, { backgroundColor: '#0a0a0a' }]}>
      <Text style={{ color: colors.textSecondary }}>Signature introuvable</Text>
    </View>
  )

  return (
    <View style={[st.container, { backgroundColor: '#0a0a0a' }]}>

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[st.back, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={st.headerMid}>
          <Text style={st.title}>{sig.workout_title}</Text>
          <Text style={st.hint}>{selected ? 'appuyer pour fermer' : 'glisser · appuyer'}</Text>
        </View>
        <ScoreArc score={sig.score} />
      </View>

      <Animated.View style={{ opacity: fadeAnim }}>

        {/* 3D canvas + RN label overlay */}
        <View style={st.canvas} {...pan.panHandlers}>

          {/* R3F Canvas — PanResponder claims all touches; R3F renders passively */}
          <Canvas
            style={StyleSheet.absoluteFill}
            dpr={1}
            camera={{ fov: 36, near: 0.1, far: 100, position: [0, 0, 5.5] }}
          >
            {/* Scene background — replaces renderer.setClearColor */}
            <color attach="background" args={['#0a0a0a']} />

            {nodesRef.current.length > 0 && (
              <BlobMesh
                nodes={nodesRef.current}
                meshRef={meshRef}
                cameraRef={cameraRef}
                ryRef={ryRef}
                isInteract={isInteract}
                projRef={projRef}
                onFrame={onFrame}
              />
            )}
          </Canvas>

          {/* Floating family labels anchored to 3D attractor positions.
              Mobile equivalent of drei <Html> — projects 3D→screen each frame. */}
          {projRef.current.filter(p => !p.behind).map(p => {
            const n = nodesRef.current.find(nd => nd.id === p.id)
            if (!n) return null
            return (
              <View
                key={`lbl${p.id}`}
                pointerEvents="none"
                style={[st.labelChip, {
                  ...(p.sx >= CX
                    ? { left:  Math.round(p.sx + 16) }
                    : { right: Math.round(SIZE - p.sx + 16) }),
                  top:         Math.round(p.sy - 12),
                  borderColor: n.color + (n.famZ < -1 ? '28' : '44'),
                  opacity:     n.famZ < -1 ? 0.44 : 1,
                }]}
              >
                <Text style={[st.labelText, { color: n.color }]}>{n.label}</Text>
                <Text style={[st.labelZ,    { color: n.color }]}>
                  {n.famZ >= 0 ? `+${n.famZ.toFixed(1)}` : n.famZ.toFixed(1)}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Variable detail panel */}
        {selectedNode && (
          <Animated.View style={[st.detail, {
            opacity:   detailAnim,
            transform: [{ translateY: detailAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
          }]}>
            <View style={[st.detailHead, { borderLeftColor: selectedNode.color }]}>
              <Text style={[st.detailTitle, { color: selectedNode.color }]}>{selectedNode.label}</Text>
              <Text style={[st.detailFamZ,  { color: selectedNode.color }]}>
                {selectedNode.famZ >= 0 ? `+${selectedNode.famZ.toFixed(2)}` : selectedNode.famZ.toFixed(2)} σ
              </Text>
            </View>
            {selectedNode.vars.map(v => {
              const t   = Math.max(0, Math.min(1, (v.z + 3) / 6))
              const pos = v.z >= 0
              return (
                <View key={v.key} style={st.varRow}>
                  <Text style={st.varLbl}>{v.label}</Text>
                  <View style={st.varTrack}>
                    <View style={[st.varFill, {
                      width:           Math.round(t * 100),
                      backgroundColor: pos ? selectedNode.color : '#8E8E93',
                    }]} />
                  </View>
                  <Text style={[st.varVal, { color: pos ? selectedNode.color : '#8E8E93' }]}>
                    {v.z >= 0 ? `+${v.z.toFixed(1)}` : v.z.toFixed(1)}
                  </Text>
                </View>
              )
            })}
          </Animated.View>
        )}

        {/* Legend */}
        {!selected && (
          <View style={st.legend}>
            {GROUPS.map(g => {
              const z    = nodesRef.current.find(n => n.id === g.id)?.famZ ?? 0
              const barW = 4 + Math.max(0, Math.min(1, (z + 3) / 6)) * 22
              return (
                <TouchableOpacity key={g.id} style={st.legendItem} onPress={() => selectFamily(g.id)}>
                  <View style={[st.legendDot, { backgroundColor: g.color }]} />
                  <Text style={st.legendTxt}>{g.label}</Text>
                  <View style={[st.legendBar, { width: barW, backgroundColor: g.color }]} />
                </TouchableOpacity>
              )
            })}
          </View>
        )}

      </Animated.View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container:  { flex: 1 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 12, gap: 10,
  },
  back:      { fontSize: 32, fontWeight: '300', lineHeight: 34 },
  headerMid: { flex: 1, gap: 2 },
  title:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint:      { color: '#ffffff44', fontSize: 11 },
  arcCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 8 },
  arcNum:    { fontSize: 17, fontWeight: '800', lineHeight: 20 },
  arcLabel:  { color: '#ffffff44', fontSize: 7, letterSpacing: 2 },
  canvas:    { alignSelf: 'center', width: SIZE, height: SIZE, position: 'relative' },
  labelChip: {
    position: 'absolute',
    backgroundColor: '#0a0a0acc',
    borderRadius: 6, borderWidth: 0.5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  labelText: { fontSize: 9,  fontWeight: '700', letterSpacing: 0.5 },
  labelZ:    { fontSize: 8,  fontWeight: '600', opacity: 0.72 },
  detail: {
    marginHorizontal: 20, marginTop: 4,
    backgroundColor: '#111115',
    borderRadius: 14, borderWidth: 0.5, borderColor: '#ffffff12',
    padding: 16,
  },
  detailHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 3, paddingLeft: 10, marginBottom: 14,
  },
  detailTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  detailFamZ:  { fontSize: 13, fontWeight: '700' },
  varRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  varLbl:   { color: '#ffffff66', fontSize: 11, width: 90, textAlign: 'right' },
  varTrack: { flex: 1, height: 3, backgroundColor: '#ffffff10', borderRadius: 2, overflow: 'hidden' },
  varFill:  { height: 3, borderRadius: 2 },
  varVal:   { fontSize: 11, fontWeight: '700', width: 38, textAlign: 'right' },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 24, paddingTop: 8, justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
  legendTxt:  { color: '#ffffff66', fontSize: 11 },
  legendBar:  { height: 3, borderRadius: 1.5, opacity: 0.75 },
})
