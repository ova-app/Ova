import React from "react";

const BRAND = "#FFDD00";
const DARK = "#0A0A0F";

// ── Inline mark geometry (master viewBox 0 0 200 200) ──────────────────────
// Ring: cx=100 cy=100 r=85 strokeWidth=30 → outer Ø 200, inner Ø 140
// Triangle: apex (100,44) base corners (55/145, 153.6) arc on inner r=70
function InlineMark({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  return (
    <g transform={`translate(${cx},${cy}) scale(${scale}) translate(-100,-100)`}>
      <circle cx="100" cy="100" r="85" fill="none" stroke={BRAND} strokeWidth="30" />
      <path d="M 100,44 L 145,153.6 A 70 70 0 0 1 55,153.6 Z" fill={BRAND} />
    </g>
  );
}

// ── Format label block ──────────────────────────────────────────────────────
function FormatLabel({
  tag,
  spec,
  sub,
  sub2,
}: {
  tag: string;
  spec: string;
  sub: string;
  sub2?: string;
}) {
  return (
    <div
      style={{
        marginTop: 20,
        textAlign: "center",
        width: 180,
        fontFamily: "'Barlow', sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "2px",
          color: BRAND,
          textTransform: "uppercase",
          marginBottom: 7,
        }}
      >
        {tag}
      </div>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: "#A8A8B8",
          letterSpacing: "0.1px",
          marginBottom: 3,
        }}
      >
        {spec}
      </div>
      <div
        style={{ fontSize: 9, fontWeight: 400, color: "#323242", letterSpacing: "0.25px" }}
      >
        {sub}
      </div>
      {sub2 && (
        <div
          style={{ fontSize: 9, fontWeight: 400, color: "#32324A", letterSpacing: "0.25px" }}
        >
          {sub2}
        </div>
      )}
    </div>
  );
}

// ── Tiny size label used inside Format 4 ───────────────────────────────────
function SizePill({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 7.5,
        fontWeight: 600,
        letterSpacing: "0.9px",
        color: "#2C2C3C",
        textAlign: "center",
        fontFamily: "'Barlow', sans-serif",
      }}
    >
      {text}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  // ── Format 1 — iOS flat 1024×1024 ───────────────────────────────────────
  // Ring outer Ø = 560 px in 1024 px canvas → occupies 54.69% of canvas
  const F1 = 180;
  const f1Scale = (560 / 1024) * (F1 / 200); // 0.4922

  // ── Format 2 — iOS rounded, home screen preview ─────────────────────────
  // Icon displayed at 120 px within 180 px wallpaper canvas
  // cornerRadius = 120 × (224 / 1024) = 26.3 px
  const F2_OUTER = 180;
  const F2_ICON = 120;
  const F2_OFF = (F2_OUTER - F2_ICON) / 2; // 30 px margin on each side
  const F2_R = F2_ICON * (224 / 1024);      // 26.3 px
  const f2Scale = (560 / 1024) * (F2_ICON / 200); // 0.3281

  // ── Format 3 — Android adaptive ─────────────────────────────────────────
  // Android canvas 108 dp; logo fits 66 dp; safe zone 72 dp
  // Display at 180 px → logo scale = (66/108) × (180/200) = 0.55
  const F3 = 180;
  const F3_R = 80;  // squircle corner radius (≈44% of size)
  const f3Scale = (66 / 108) * (F3 / 200); // 0.55
  const F3_SAFE_R = (72 / 108) * (F3 / 2); // 60 px

  // ── Format 4 — Notification 24 dp ───────────────────────────────────────
  // Simplified: ring r=9.5 stroke=2.5; triangle proportionally scaled to 24×24
  // apex=(12,5.74), base corners=(6.97/17.03, 17.99), arc r=7.83
  // Shown at 96 px display (2×) and 48 px display (1×)

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#1A1A24",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 48px",
        fontFamily: "'Barlow', sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 52, textAlign: "center" }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "3.5px",
            color: BRAND,
            textTransform: "uppercase",
            marginBottom: 7,
          }}
        >
          ORAVA
        </div>
        <div
          style={{
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "2.5px",
            color: "#222232",
            textTransform: "uppercase",
          }}
        >
          App Icon Formats
        </div>
      </div>

      {/* ── Four formats row ── */}
      <div
        style={{
          display: "flex",
          gap: 48,
          alignItems: "flex-start",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {/* ────────────────────────────────────────────────────────────────
            FORMAT 1 — iOS 1024×1024, solid bg, no corners
        ──────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg
            width={F1}
            height={F1}
            viewBox={`0 0 ${F1} ${F1}`}
            style={{ display: "block" }}
          >
            <rect width={F1} height={F1} fill={DARK} />
            <InlineMark cx={F1 / 2} cy={F1 / 2} scale={f1Scale} />
          </svg>
          <FormatLabel
            tag="Format 1"
            spec="iOS 1024 × 1024 px"
            sub="#0A0A0F — no corners"
          />
        </div>

        {/* ────────────────────────────────────────────────────────────────
            FORMAT 2 — iOS avec coins arrondis, home screen preview
        ──────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg
            width={F2_OUTER}
            height={F2_OUTER}
            viewBox={`0 0 ${F2_OUTER} ${F2_OUTER}`}
            style={{ display: "block" }}
          >
            <defs>
              <radialGradient id="wallpaper-grad" cx="38%" cy="28%" r="78%">
                <stop offset="0%" stopColor="#16103E" />
                <stop offset="55%" stopColor="#0E0B22" />
                <stop offset="100%" stopColor="#09090F" />
              </radialGradient>
              <clipPath id="f2-icon-clip">
                <rect
                  x={F2_OFF}
                  y={F2_OFF}
                  width={F2_ICON}
                  height={F2_ICON}
                  rx={F2_R}
                  ry={F2_R}
                />
              </clipPath>
            </defs>

            {/* Wallpaper background */}
            <rect width={F2_OUTER} height={F2_OUTER} fill="url(#wallpaper-grad)" />

            {/* Ghost app icon slots — 4 corners (24×24, clear of icon margin) */}
            {(
              [
                [4, 4],
                [152, 4],
                [4, 152],
                [152, 152],
              ] as [number, number][]
            ).map(([gx, gy], i) => (
              <rect
                key={i}
                x={gx}
                y={gy}
                width={24}
                height={24}
                rx={5.3}
                fill="rgba(255,255,255,0.028)"
                stroke="rgba(255,255,255,0.055)"
                strokeWidth="0.6"
              />
            ))}

            {/* Home screen page indicator dots */}
            {([-6, 0, 6] as number[]).map((dx, i) => (
              <circle
                key={i}
                cx={90 + dx}
                cy={173}
                r={1.7}
                fill={
                  dx === 0
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(255,255,255,0.09)"
                }
              />
            ))}

            {/* Icon tile — background layer */}
            <rect
              x={F2_OFF}
              y={F2_OFF}
              width={F2_ICON}
              height={F2_ICON}
              rx={F2_R}
              ry={F2_R}
              fill={DARK}
            />

            {/* Icon tile — mark (clipped to rounded rect) */}
            <g clipPath="url(#f2-icon-clip)">
              <InlineMark cx={F2_OUTER / 2} cy={F2_OUTER / 2} scale={f2Scale} />
            </g>
          </svg>
          <FormatLabel
            tag="Format 2"
            spec="iOS — coins arrondis"
            sub="r 224 px (22 %)"
            sub2="Aperçu écran d'accueil"
          />
        </div>

        {/* ────────────────────────────────────────────────────────────────
            FORMAT 3 — Android adaptive (squircle, safe zone annotation)
        ──────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg
            width={F3}
            height={F3}
            viewBox={`0 0 ${F3} ${F3}`}
            style={{ display: "block" }}
          >
            <defs>
              <clipPath id="f3-squircle-clip">
                <rect
                  x="0"
                  y="0"
                  width={F3}
                  height={F3}
                  rx={F3_R}
                  ry={F3_R}
                />
              </clipPath>
            </defs>

            {/* Background layer */}
            <rect width={F3} height={F3} rx={F3_R} ry={F3_R} fill={DARK} />

            {/* Foreground layer — logo, clipped to adaptive shape */}
            <g clipPath="url(#f3-squircle-clip)">
              <InlineMark cx={F3 / 2} cy={F3 / 2} scale={f3Scale} />
            </g>

            {/* Safe zone circle annotation (Ø 72 dp) */}
            <circle
              cx={F3 / 2}
              cy={F3 / 2}
              r={F3_SAFE_R}
              fill="none"
              stroke={BRAND}
              strokeWidth="0.75"
              strokeDasharray="3.5 3"
              opacity="0.2"
            />
          </svg>
          <FormatLabel
            tag="Format 3"
            spec="Android adaptive"
            sub="Safe zone Ø 72 dp · logo Ø 66 dp"
          />
        </div>

        {/* ────────────────────────────────────────────────────────────────
            FORMAT 4 — Notification 24 dp, simplified, 1× and 2×
            Notification SVG: viewBox 0 0 24 24
              Ring: cx=12 cy=12 r=9.5 strokeWidth=2.5
              Triangle (proportionally scaled from master):
                scale = 9.5/85 = 0.1118
                apex   = (12, 12 - 56×0.1118) = (12, 5.74)
                right  = (12 + 45×0.1118, 12 + 53.6×0.1118) = (17.03, 17.99)
                left   = (6.97, 17.99), arc r = 70×0.1118 = 7.83
        ──────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: 180,
              height: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 28,
                alignItems: "flex-end",
              }}
            >
              {/* 2× — displayed at 96 px */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <svg
                  width={96}
                  height={96}
                  viewBox="0 0 24 24"
                  style={{ display: "block" }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9.5"
                    fill="none"
                    stroke={BRAND}
                    strokeWidth="2.5"
                  />
                  <path
                    d="M 12,5.74 L 17.03,17.99 A 7.83 7.83 0 0 1 6.97,17.99 Z"
                    fill={BRAND}
                  />
                </svg>
                <SizePill text="2× · 48 dp" />
              </div>

              {/* 1× — displayed at 48 px */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <svg
                  width={48}
                  height={48}
                  viewBox="0 0 24 24"
                  style={{ display: "block" }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9.5"
                    fill="none"
                    stroke={BRAND}
                    strokeWidth="2.5"
                  />
                  <path
                    d="M 12,5.74 L 17.03,17.99 A 7.83 7.83 0 0 1 6.97,17.99 Z"
                    fill={BRAND}
                  />
                </svg>
                <SizePill text="1× · 24 dp" />
              </div>
            </div>
          </div>
          <FormatLabel
            tag="Format 4"
            spec="Notification 24 × 24 dp"
            sub="#FFDD00 on transparent"
            sub2="Stroke 2.5 px · 1× et 2×"
          />
        </div>
      </div>
    </div>
  );
}
