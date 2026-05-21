// Parse a single sheet of an unzipped xlsx (no external deps).
// Resolves shared strings and prints rows as JSON.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'hiroshima_b_extracted');
const sheetArg = process.argv[2] || 'sheet7.xml';
const sheetPath = path.join(ROOT, 'xl', 'worksheets', sheetArg);
const sharedStringsPath = path.join(ROOT, 'xl', 'sharedStrings.xml');

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml) {
  const out = [];
  // each <si>...</si> contains either <t>...</t> directly or nested runs <r><t>...</t></r>
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    const body = m[1];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let parts = [];
    let t;
    while ((t = tRegex.exec(body)) !== null) parts.push(decodeEntities(t[1]));
    out.push(parts.join(''));
  }
  return out;
}

function colLettersToIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const rowNum = parseInt(rm[1], 10);
    const rowBody = rm[2];
    const cells = {};
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRegex.exec(rowBody)) !== null) {
      const attrs = cm[1] || '';
      const inner = cm[2] || '';
      const rMatch = /\br="([A-Z]+)(\d+)"/.exec(attrs);
      if (!rMatch) continue;
      const colLetters = rMatch[1];
      const tMatch = /\bt="([^"]+)"/.exec(attrs);
      const t = tMatch ? tMatch[1] : 'n';
      let value = null;
      if (t === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (v) value = shared[parseInt(v[1], 10)];
      } else if (t === 'inlineStr') {
        const tt = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        if (tt) value = decodeEntities(tt[1]);
      } else if (t === 'str') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (v) value = decodeEntities(v[1]);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (v) value = v[1];
      }
      cells[colLettersToIndex(colLetters)] = value;
    }
    rows[rowNum - 1] = cells;
  }
  return rows;
}

const sharedXml = fs.readFileSync(sharedStringsPath, 'utf8');
const sheetXml = fs.readFileSync(sheetPath, 'utf8');
const shared = parseSharedStrings(sharedXml);
const rows = parseSheet(sheetXml, shared);

// Print as tab-separated; trim trailing empties
let maxCol = 0;
for (const r of rows) {
  if (!r) continue;
  for (const k of Object.keys(r)) {
    const n = parseInt(k, 10);
    if (n > maxCol) maxCol = n;
  }
}

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r) {
    process.stdout.write(`${i + 1}\t\n`);
    continue;
  }
  const cells = [];
  for (let c = 0; c <= maxCol; c++) {
    const v = r[c];
    cells.push(v == null ? '' : String(v).replace(/\s+/g, ' '));
  }
  process.stdout.write(`${i + 1}\t` + cells.join('\t') + '\n');
}
