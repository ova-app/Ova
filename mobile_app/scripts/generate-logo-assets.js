// Génère icon.png (1024×1024), adaptive-icon.png (1024×1024), splash.png (2048×2048)
// Usage : node scripts/generate-logo-assets.js
// Prérequis : npm install sharp --save-dev (une seule fois)

const sharp = require('sharp')
const path = require('path')

const ACCENT = '#FFDD00'
const BG = '#0A0A0F'
const ASSETS = path.join(__dirname, '../assets')

// SVG du logo — 3 anneaux vectoriels, taille arbitraire via viewBox
function logoSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${BG}"/>
    <circle cx="50" cy="50" r="42" stroke="${ACCENT}" stroke-width="6" fill="none"/>
    <circle cx="50" cy="50" r="28" stroke="${ACCENT}" stroke-width="6" fill="none"/>
    <circle cx="50" cy="50" r="6" fill="${ACCENT}"/>
  </svg>`
}

// Splash : logo centré sur fond sombre, exporté 2048×2048
function splashSvg() {
  const canvas = 2048
  const logoSize = 600
  const offset = (canvas - logoSize) / 2
  const cx = logoSize / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
    <rect width="${canvas}" height="${canvas}" fill="${BG}"/>
    <g transform="translate(${offset}, ${offset})">
      <circle cx="${cx}" cy="${cx}" r="${logoSize * 0.42}" stroke="${ACCENT}" stroke-width="${logoSize * 0.06}" fill="none"/>
      <circle cx="${cx}" cy="${cx}" r="${logoSize * 0.28}" stroke="${ACCENT}" stroke-width="${logoSize * 0.06}" fill="none"/>
      <circle cx="${cx}" cy="${cx}" r="${logoSize * 0.06}" fill="${ACCENT}"/>
    </g>
  </svg>`
}

async function run() {
  const tasks = [
    { svg: logoSvg(1024),  out: 'icon.png',          label: 'icon.png (1024×1024)' },
    { svg: logoSvg(1024),  out: 'adaptive-icon.png',  label: 'adaptive-icon.png (1024×1024)' },
    { svg: splashSvg(),    out: 'splash.png',          label: 'splash.png (2048×2048)' },
    { svg: logoSvg(256),   out: 'favicon.png',         label: 'favicon.png (256×256)' },
  ]

  for (const { svg, out, label } of tasks) {
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(ASSETS, out))
    console.log(`✓ ${label}`)
  }

  console.log('\nAssets générés dans mobile_app/assets/')
}

run().catch(err => {
  console.error(err.message)
  if (err.message.includes("Cannot find module 'sharp'")) {
    console.error('\n→ Installe sharp : npm install sharp --save-dev')
  }
  process.exit(1)
})
