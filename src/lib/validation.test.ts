import { describe, expect, it } from 'vitest'
import { formatMXN, parsePriceToCents } from './validation'
import { buildRecoveryUrl, validateRestaurantInput, validateRestaurantUpdate } from '../../supabase/functions/_shared/validation'
import { menuContrastRatio, normalizeHexColor, readableTextOn } from './menu-theme'

describe('parsePriceToCents', () => {
  it.each([
    ['42', 4200],
    ['42.5', 4250],
    ['42.05', 4205],
    ['999999.99', 99999999],
  ])('convierte %s a centavos', (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected)
  })

  it.each(['', '0', '-1', '1.999', '1,50', '01.00', '1e2', '  ', '1000000.00'])(
    'rechaza el precio inválido %s',
    (input) => {
      expect(parsePriceToCents(input)).toBeNull()
    },
  )
})

describe('administrative input validation', () => {
  it('accepts only bounded restaurant fields and normalizes owner email', () => {
    expect(validateRestaurantInput({ slug: 'casa-lumbre', name: ' Casa Lumbre ', description: '', productLimit: 40, ownerEmail: 'Owner@Example.com' }))
      .toEqual({ slug: 'casa-lumbre', name: 'Casa Lumbre', description: '', productLimit: 40, ownerEmail: 'owner@example.com' })
    expect(validateRestaurantInput({ slug: 'Bad Slug', name: 'X', description: '', productLimit: 40, ownerEmail: 'owner@example.com' })).toBeNull()
    expect(validateRestaurantInput({ slug: 'ok', name: 'X', description: '', productLimit: 41, ownerEmail: 'owner@example.com' })).toBeNull()
  })

  it('validates update IDs and active state', () => {
    expect(validateRestaurantUpdate({ restaurantId: '20000000-0000-4000-8000-000000000001', name: 'Casa', description: '', productLimit: 10, isActive: false })).not.toBeNull()
    expect(validateRestaurantUpdate({ restaurantId: 'not-a-uuid', name: 'Casa', description: '', productLimit: 10, isActive: false })).toBeNull()
  })

  it('builds recovery URLs only for secure app origins', () => {
    expect(buildRecoveryUrl('https://menus.example.com', 'one-time-hash'))
      .toBe('https://menus.example.com/reset-password#token_hash=one-time-hash&type=recovery')
    expect(buildRecoveryUrl('http://menus.example.com', 'one-time-hash')).toBeNull()
    expect(buildRecoveryUrl('https://evil.example/path', 'one-time-hash')).toBeNull()
  })
})

describe('menu appearance colors', () => {
  it('accepts six-digit hex values and normalizes casing', () => {
    expect(normalizeHexColor('#a65e32')).toBe('#A65E32')
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('#123')).toBeNull()
  })

  it('chooses black or white with readable contrast for accent badges', () => {
    for (const color of ['#000000', '#FFFFFF', '#A65E32', '#284D3B', '#777777']) {
      expect(menuContrastRatio(color)).toBeGreaterThanOrEqual(4.5)
    }
    expect(readableTextOn('#000000')).toBe('#FFFFFF')
    expect(readableTextOn('#FFFFFF')).toBe('#000000')
  })
})

describe('formatMXN', () => {
  it('presenta centavos como pesos mexicanos', () => {
    // In es-MX, Intl.NumberFormat uses the familiar peso/dollar sign.
    expect(formatMXN(4250)).toBe('$42.50')
  })

  it('rechaza valores inválidos', () => {
    expect(() => formatMXN(-1)).toThrow(RangeError)
    expect(() => formatMXN(1.5)).toThrow(RangeError)
  })
})
