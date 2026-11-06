/** Parse a human-entered MXN amount into integer centavos. */
export function parsePriceToCents(value: string): number | null {
  const normalized = value.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null

  const [pesos, fraction = ''] = normalized.split('.')
  const cents = Number(pesos) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 99_999_999 ? cents : null
}

const mxnFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMXN(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('El precio debe ser un entero no negativo en centavos.')
  }
  return mxnFormatter.format(cents / 100)
}
