import * as XLSX from 'xlsx';

// Normaliza texto: saca acentos, espacios y pasa a minusculas.
function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  let n;
  if (typeof v === 'number') n = v;
  else n = Number(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  // Limpia ruido de floats del Excel (ej. 203.00000000000006 -> 203).
  return Math.round(n * 1000) / 1000;
}

// Analiza una hoja y detecta la fila de encabezado y las columnas de
// "Descripción Parte" y del stock online ("Cajon <Prov>" / "KG <Prov>").
// Devuelve null si la hoja no parece ser de un proveedor.
function parseSheet(rows) {
  const scanLimit = Math.min(rows.length, 15);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r] || [];
    let descCol = -1;
    let cajonCol = -1;
    let kgCol = -1;

    for (let c = 0; c < row.length; c++) {
      const val = norm(row[c]);
      if (val === 'descripcion parte' && descCol === -1) descCol = c;
      // "Cajon <algo>" (ej. "Cajon Pedernera"), NO "Conteo Cajon" ni "Envio Cajon".
      if (/^cajon\s+\S/.test(val) && cajonCol === -1) cajonCol = c;
    }

    if (descCol === -1 || cajonCol === -1) continue;

    // La columna KG del stock online suele estar pegada a la derecha del cajon.
    const rightVal = norm(row[cajonCol + 1]);
    if (/^kg\b/.test(rightVal)) kgCol = cajonCol + 1;

    const supplierGuess = String(row[cajonCol]).replace(/cajon/i, '').trim();

    // Leer los items debajo del encabezado.
    const items = [];
    for (let dr = r + 1; dr < rows.length; dr++) {
      const drow = rows[dr] || [];
      const descRaw = drow[descCol];
      const desc = String(descRaw ?? '').trim();
      if (!desc) continue;
      if (norm(desc) === 'descripcion parte') continue; // encabezado repetido
      items.push({
        descripcion: desc,
        stock_cajon: toNumber(drow[cajonCol]),
        stock_kg: kgCol !== -1 ? toNumber(drow[kgCol]) : null,
      });
    }

    return {
      headerRow: r,
      descCol,
      cajonCol,
      kgCol,
      supplierGuess,
      items,
    };
  }
  return null;
}

// Hojas utilitarias que NO son proveedores (aunque tengan estructura parecida).
const EXCLUDED_SHEETS = new Set([
  'conteo sp',
  'conteo sc',
  'stock online gral',
  'distribucin caj pint+seri x ps',
  'distribucion caj pint+seri x ps',
  'est lk',
  'est ch',
  'grafico1',
  'hoja1',
  'hoja2',
]);

// Parsea el workbook completo y devuelve solo las hojas que parecen de proveedor.
export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const suppliers = [];
  for (const sheetName of wb.SheetNames) {
    if (EXCLUDED_SHEETS.has(norm(sheetName))) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      raw: true,
      defval: null,
    });
    const parsed = parseSheet(rows);
    if (parsed && parsed.items.length > 0) {
      suppliers.push({
        sheet: sheetName,
        supplierGuess: parsed.supplierGuess || sheetName,
        itemCount: parsed.items.length,
        items: parsed.items,
      });
    }
  }
  return suppliers;
}
