import Papa from 'papaparse'
import { parsePriceToCents } from './validation'

export const MENU_CSV_HEADERS = [
  'categoria', 'nombre', 'descripcion', 'precio_mxn', 'estado', 'orden_categoria', 'orden_producto',
] as const

export type TransferStatus = 'available' | 'sold_out' | 'hidden'

export interface MenuCsvRow {
  category: string
  name: string
  description: string
  priceCents: number
  status: TransferStatus
  categoryOrder: number
  productOrder: number
  sourceRow: number
}

export interface MenuCsvIssue {
  row: number
  message: string
}

export interface ParsedMenuCsv {
  rows: MenuCsvRow[]
  issues: MenuCsvIssue[]
}

const statuses: Record<string, TransferStatus> = {
  disponible: 'available',
  available: 'available',
  agotado: 'sold_out',
  sold_out: 'sold_out',
  oculto: 'hidden',
  hidden: 'hidden',
}

export function parseMenuCsv(csv: string): ParsedMenuCsv {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
  })
  const issues: MenuCsvIssue[] = parsed.errors.map((error) => ({
    row: error.row === undefined ? 1 : error.row + 2,
    message: `CSV: ${error.message}`,
  }))
  const headers = parsed.meta.fields ?? []
  if (MENU_CSV_HEADERS.some((header) => !headers.includes(header))) {
    issues.push({ row: 1, message: `La cabecera debe incluir: ${MENU_CSV_HEADERS.join(', ')}.` })
    return { rows: [], issues }
  }

  const rows: MenuCsvRow[] = []
  parsed.data.forEach((record, index) => {
    const row = index + 2
    const category = (record.categoria ?? '').trim()
    const name = (record.nombre ?? '').trim()
    const description = (record.descripcion ?? '').trim()
    const priceText = (record.precio_mxn ?? '').trim()
    const rawStatus = (record.estado ?? 'disponible').trim().toLowerCase()
    const rawCategoryOrder = (record.orden_categoria ?? '').trim()
    const rawProductOrder = (record.orden_producto ?? '').trim()
    const categoryOrder = Number(rawCategoryOrder)
    const productOrder = Number(rawProductOrder)
    const priceCents = parsePriceToCents(priceText)
    const rowIssues: string[] = []

    if (!category || category.length > 80) rowIssues.push('La categoría es obligatoria y admite hasta 80 caracteres.')
    if (!name || name.length > 120) rowIssues.push('El nombre es obligatorio y admite hasta 120 caracteres.')
    if (description.length > 240) rowIssues.push('La descripción admite hasta 240 caracteres.')
    if (priceCents === null) rowIssues.push('El precio debe ser un importe MXN positivo con hasta dos decimales.')
    if (!statuses[rawStatus]) rowIssues.push('Estado inválido; usa disponible, agotado u oculto.')
    if (!rawCategoryOrder || !Number.isInteger(categoryOrder) || categoryOrder < 0) rowIssues.push('Orden de categoría debe ser un entero no negativo.')
    if (!rawProductOrder || !Number.isInteger(productOrder) || productOrder < 0) rowIssues.push('Orden de producto debe ser un entero no negativo.')

    if (rowIssues.length) {
      rowIssues.forEach((message) => issues.push({ row, message }))
      return
    }
    rows.push({
      category,
      name,
      description,
      priceCents: priceCents!,
      status: statuses[rawStatus],
      categoryOrder,
      productOrder,
      sourceRow: row,
    })
  })
  return { rows, issues }
}

function csvCell(value: string | number): string {
  let text = String(value)
  // Excel/Sheets formula injection: prefix an apostrophe for dangerous cells.
  if (/^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function serializeMenuCsv(rows: MenuCsvRow[]): string {
  const body = rows.map((row) => [
    row.category,
    row.name,
    row.description,
    (row.priceCents / 100).toFixed(2),
    row.status,
    row.categoryOrder,
    row.productOrder,
  ].map(csvCell).join(','))
  return [MENU_CSV_HEADERS.join(','), ...body].join('\r\n')
}
