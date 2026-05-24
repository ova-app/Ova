import { dark, light, spacing, radius, typography, touchTarget } from '../constants/theme'

describe('theme — dark palette', () => {
  it('should have all required color tokens as strings', () => {
    const tokens: Array<keyof typeof dark> = [
      'background', 'backgroundSecondary', 'backgroundTertiary',
      'textPrimary', 'textSecondary', 'textTertiary',
      'separator', 'border',
      'accent',
      'prGold', 'prSilver', 'prBronze', 'prExercice',
      'success', 'error', 'warning',
      'inputBackground', 'switchBackground',
    ]
    for (const token of tokens) {
      expect(typeof dark[token]).toBe('string')
      expect(dark[token].length).toBeGreaterThan(0)
    }
  })

  it('should have accent = #FFDD00', () => {
    expect(dark.accent).toBe('#FFDD00')
  })

  it('should have prGold = #FAC775', () => {
    expect(dark.prGold).toBe('#FAC775')
  })

  it('should have prSilver = #C0C0C0', () => {
    expect(dark.prSilver).toBe('#C0C0C0')
  })

  it('should have prBronze = #CD7F32', () => {
    expect(dark.prBronze).toBe('#CD7F32')
  })

  it('should not use pure black or pure white backgrounds', () => {
    expect(dark.background).not.toBe('#000000')
    expect(dark.background).not.toBe('#000')
    expect(dark.textPrimary).not.toBe('#FFFFFF')
    expect(dark.textPrimary).not.toBe('#fff')
  })
})

describe('theme — light palette', () => {
  it('should have same token keys as dark', () => {
    const darkKeys = Object.keys(dark).sort()
    const lightKeys = Object.keys(light).sort()
    expect(lightKeys).toEqual(darkKeys)
  })

  it('should have all tokens as strings', () => {
    for (const [, value] of Object.entries(light)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })

  it('should have accent = #FFDD00', () => {
    expect(light.accent).toBe('#FFDD00')
  })
})

describe('theme — spacing (8pt grid)', () => {
  it('should have s1 = 4', () => { expect(spacing.s1).toBe(4) })
  it('should have s2 = 8', () => { expect(spacing.s2).toBe(8) })
  it('should have s3 = 12', () => { expect(spacing.s3).toBe(12) })
  it('should have s4 = 16', () => { expect(spacing.s4).toBe(16) })
  it('should have s5 = 20', () => { expect(spacing.s5).toBe(20) })
  it('should have s6 = 24', () => { expect(spacing.s6).toBe(24) })
  it('should have s8 = 32', () => { expect(spacing.s8).toBe(32) })
  it('should have s10 = 40', () => { expect(spacing.s10).toBe(40) })
  it('should have s12 = 48', () => { expect(spacing.s12).toBe(48) })
})

describe('theme — radius', () => {
  it('should have sm = 8', () => { expect(radius.sm).toBe(8) })
  it('should have md = 12', () => { expect(radius.md).toBe(12) })
  it('should have lg = 16', () => { expect(radius.lg).toBe(16) })
  it('should have xl = 24', () => { expect(radius.xl).toBe(24) })
  it('should have full = 9999', () => { expect(radius.full).toBe(9999) })
})

describe('theme — typography', () => {
  it('should have hero.fontSize = 56', () => { expect(typography.hero.fontSize).toBe(56) })
  it('should have display.fontSize = 40', () => { expect(typography.display.fontSize).toBe(40) })
  it('should have title.fontSize = 24', () => { expect(typography.title.fontSize).toBe(24) })
  it('should have subtitle.fontSize = 18', () => { expect(typography.subtitle.fontSize).toBe(18) })
  it('should have body.fontSize = 15', () => { expect(typography.body.fontSize).toBe(15) })
  it('should have caption.fontSize = 12', () => { expect(typography.caption.fontSize).toBe(12) })
  it('should have mono.fontSize = 14', () => { expect(typography.mono.fontSize).toBe(14) })

  it('should have negative letterSpacing on large sizes', () => {
    expect(typography.hero.letterSpacing).toBeLessThan(0)
    expect(typography.display.letterSpacing).toBeLessThan(0)
    expect(typography.title.letterSpacing).toBeLessThan(0)
  })

  it('should have positive letterSpacing on caption', () => {
    expect(typography.caption.letterSpacing).toBeGreaterThan(0)
  })
})

describe('theme — touchTarget', () => {
  it('should have min = 44', () => { expect(touchTarget.min).toBe(44) })
  it('should have comfort = 52', () => { expect(touchTarget.comfort).toBe(52) })
  it('should have hero = 64', () => { expect(touchTarget.hero).toBe(64) })

  it('should have min <= comfort <= hero', () => {
    expect(touchTarget.min).toBeLessThanOrEqual(touchTarget.comfort)
    expect(touchTarget.comfort).toBeLessThanOrEqual(touchTarget.hero)
  })
})
