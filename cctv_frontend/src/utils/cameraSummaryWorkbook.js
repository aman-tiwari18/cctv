/**
 * Camera Summary workbook (Cameras page download), built with ExcelJS.
 *
 * Layout follows the standard classification report (e.g. UPCISB_Shift1_Classification_*.xlsx):
 *   Summary         title line, key figures, then one row per centre (Cameras / Accessible / Not Accessible)
 *   Not Accessible  navy header row, frozen, filterable
 *   Accessible      same
 *   All Cameras     same
 *
 * `rows` are plain objects keyed by the column labels of the Cameras table download.
 */

const HEAD = 'FF1F4E78';
const WHITE = 'FFFFFFFF';

const COL_WIDTH = {
  'Device ID': 12, 'Camera No': 11, 'TC Code': 10, 'Camera Name': 26, 'Centre Name': 34, State: 16, Region: 12,
  Classification: 22, Status: 16, View: 10, 'CCTV URL': 44, 'Ch Code': 10, 'Camera Category': 16,
  'Exam Date': 12, Shift: 10,
};

const isAcc = (r) => String(r.Status || '').toLowerCase() === 'accessible';
const isNot = (r) => String(r.Status || '').toLowerCase() === 'not accessible';

function dataSheet(wb, { name, rows, fallbackColumns }) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols = rows.length ? Object.keys(rows[0]) : fallbackColumns;
  ws.columns = cols.map((k) => ({ header: k, key: k, width: COL_WIDTH[k] || 16 }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
    c.alignment = { vertical: 'middle' };
  });
  rows.forEach((r) => {
    const row = ws.addRow(cols.map((k) => (k === 'View' ? null : r[k])));
    const vi = cols.indexOf('View');
    if (vi >= 0) {
      const cell = row.getCell(vi + 1);
      if (r.View) {
        cell.value = { text: 'View', hyperlink: r.View, tooltip: 'Open the captured frame' };
        cell.font = { underline: true, color: { argb: 'FF0563C1' } };
      } else {
        cell.value = '-';
      }
    }
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: cols.length } };
  return ws;
}

export function buildCameraSummaryWorkbook(ExcelJS, o) {
  const { examName, shiftName, dateLabel, note, isHls, accessibleRows, notAccessibleRows, allRows } = o;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CCTV Monitoring';
  wb.created = new Date();

  const total = allRows.length;
  const acc = allRows.filter(isAcc).length;
  const not = allRows.filter(isNot).length;
  const other = total - acc - not;

  // ── Summary ──
  const ws = wb.addWorksheet('Summary');
  ws.columns = [{ width: 60 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.getCell('A1').value = `${examName} - Camera Summary, ${shiftName}, ${dateLabel}`;
  ws.getCell('A1').font = { bold: true, size: 13 };
  const kv = [['Cameras checked', total], ['Accessible', acc], ['Not Accessible', not]];
  if (other) kv.push(['Not checked yet', other]);
  if (note) kv.push(['Note', note]);
  kv.forEach(([k, v], i) => { ws.getCell(`A${i + 2}`).value = k; ws.getCell(`B${i + 2}`).value = v; });

  let r = kv.length + 3;
  ['Centre (TC Code)', 'Cameras', 'Accessible', 'Not Accessible'].forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
  });
  const hRow = r;
  r += 1;
  const m = new Map();
  allRows.forEach((row) => {
    const k = row['TC Code'] || '-';
    const e = m.get(k) || { name: `${row['Centre Name'] || '-'} (${k})`, total: 0, acc: 0, not: 0 };
    e.total += 1;
    if (isAcc(row)) e.acc += 1; else if (isNot(row)) e.not += 1;
    m.set(k, e);
  });
  [...m.values()].sort((a, b) => b.not - a.not || a.name.localeCompare(b.name)).forEach((e) => {
    [e.name, e.total, e.acc, e.not].forEach((v, i) => { ws.getCell(r, i + 1).value = v; });
    r += 1;
  });
  if (m.size) ws.autoFilter = { from: { row: hRow, column: 1 }, to: { row: r - 1, column: 4 } };

  // ── data sheets (same order as the standard report) ──
  const fallback = isHls
    ? ['Centre Name', 'TC Code', 'State', 'Camera Name', 'Ch Code', 'Camera Category', 'Classification', 'Status', 'Exam Date', 'Shift', 'View']
    : ['Device ID', 'Camera No', 'TC Code', 'Camera Name', 'Centre Name', 'State', 'Region', 'Classification', 'Status', 'View', 'CCTV URL'];
  dataSheet(wb, { name: 'Not Accessible', rows: notAccessibleRows, fallbackColumns: fallback.filter((k) => k !== 'Classification' && k !== 'View') });
  dataSheet(wb, { name: 'Accessible', rows: accessibleRows, fallbackColumns: fallback });
  dataSheet(wb, { name: 'All Cameras', rows: allRows, fallbackColumns: fallback });
  return wb;
}

export async function saveWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
