import { formatVolume } from '../lib/utils'

describe('formatVolume', () => {
  // ─── Cas nominaux ─────────────────────────────────────────────────────────────

  it('should format 12450 as "12 450"', () => {
    expect(formatVolume(12450)).toBe('12 450')
  })

  it('should format 1000 as "1 000"', () => {
    expect(formatVolume(1000)).toBe('1 000')
  })

  it('should format 999 as "999"', () => {
    expect(formatVolume(999)).toBe('999')
  })

  it('should format 0 as "0"', () => {
    expect(formatVolume(0)).toBe('0')
  })

  // ─── Null ─────────────────────────────────────────────────────────────────────

  it('should return "—" for null', () => {
    expect(formatVolume(null)).toBe('—')
  })

  // ─── Arrondis ─────────────────────────────────────────────────────────────────

  it('should round 999.9 to 1000 and format as "1 000"', () => {
    expect(formatVolume(999.9)).toBe('1 000')
  })

  it('should round 1500.4 to 1500 and format as "1 500"', () => {
    expect(formatVolume(1500.4)).toBe('1 500')
  })

  it('should round 1500.5 to 1501 and format as "1 501"', () => {
    expect(formatVolume(1500.5)).toBe('1 501')
  })

  // ─── Padding zéros ────────────────────────────────────────────────────────────

  it('should pad rest with zeros: 1001 → "1 001"', () => {
    expect(formatVolume(1001)).toBe('1 001')
  })

  it('should pad rest with zeros: 1010 → "1 010"', () => {
    expect(formatVolume(1010)).toBe('1 010')
  })

  it('should pad rest with zeros: 1100 → "1 100"', () => {
    expect(formatVolume(1100)).toBe('1 100')
  })

  // ─── Grands nombres ───────────────────────────────────────────────────────────

  it('should format 5000 as "5 000"', () => {
    expect(formatVolume(5000)).toBe('5 000')
  })

  it('should format 10000 as "10 000"', () => {
    expect(formatVolume(10000)).toBe('10 000')
  })

  // ─── Valeurs limites ──────────────────────────────────────────────────────────

  it('should format 1 as "1"', () => {
    expect(formatVolume(1)).toBe('1')
  })

  it('should handle decimal < 1000 by rounding', () => {
    expect(formatVolume(42.7)).toBe('43')
  })
})
