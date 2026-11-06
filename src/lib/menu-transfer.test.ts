import { describe, expect, it } from 'vitest'
import { parseMenuCsv, serializeMenuCsv, type MenuCsvRow } from './menu-transfer'

describe('transferencia CSV de carta', () => {
  it('parsea comillas, comas y saltos de línea preservando centavos', () => {
    const result = parseMenuCsv('categoria,nombre,descripcion,precio_mxn,estado,orden_categoria,orden_producto\n"Bebidas","Agua, mineral","Con limón,\ny hielo",35.50,agotado,0,2')
    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([{
      category: 'Bebidas', name: 'Agua, mineral', description: 'Con limón,\ny hielo',
      priceCents: 3550, status: 'sold_out', categoryOrder: 0, productOrder: 2, sourceRow: 2,
    }])
  })

  it('reporta fila y causa, sin dar por válido un lote con errores', () => {
    const result = parseMenuCsv('categoria,nombre,descripcion,precio_mxn,estado,orden_categoria,orden_producto\nPlatos,,x,0,desconocido,-1,abc')
    expect(result.rows).toEqual([])
    expect(result.issues.length).toBeGreaterThanOrEqual(4)
    expect(result.issues.every((issue) => issue.row === 2)).toBe(true)
  })

  it('neutraliza celdas CSV peligrosas y permite volver a parsear el archivo', () => {
    const rows: MenuCsvRow[] = [{
      category: 'Postres', name: '=HYPERLINK("https://example.com")', description: 'crema, vainilla',
      priceCents: 1250, status: 'hidden', categoryOrder: 1, productOrder: 0, sourceRow: 2,
    }]
    const csv = serializeMenuCsv(rows)
    expect(csv).toContain("'=HYPERLINK(")
    const parsed = parseMenuCsv(csv)
    expect(parsed.issues).toEqual([])
    expect(parsed.rows[0].name).toBe("'=HYPERLINK(\"https://example.com\")")
  })
})
