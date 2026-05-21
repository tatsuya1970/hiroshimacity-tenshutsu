// Read b06/b07 TSVs and produce a prefecture-level migration JSON.
const fs = require('fs');
const path = require('path');

const PREFS = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

function parseTsv(tsvPath) {
  // For each prefecture row, the 全市 総数 sits in TSV column 4.
  // Label hierarchy uses columns 1, 2, 3. Prefecture name is in column 3.
  const out = {};
  const text = fs.readFileSync(tsvPath, 'utf8');
  const lines = text.split('\n');
  for (const line of lines) {
    const cols = line.split('\t');
    // cols[0] is row number; cols[1..3] are label cells.
    // Prefecture name may sit in column C (col[3]) when it has no parent region
    // group (北海道) or in column D (col[4]) when nested under a region group.
    const label = ((cols[4] || '').trim()) || ((cols[3] || '').trim());
    if (PREFS.includes(label)) {
      const total = (cols[5] || '').replace(/[，,]/g, '');
      if (total === '―' || total === '' || total == null) continue;
      const n = parseInt(total, 10);
      if (!Number.isNaN(n)) out[label] = n;
    }
  }
  return out;
}

const dir = __dirname;
const incoming = parseTsv(path.join(dir, 'b06_raw.tsv')); // 転入 = into Hiroshima
const outgoing = parseTsv(path.join(dir, 'b07_raw.tsv')); // 転出 = out of Hiroshima

const result = {};
for (const p of PREFS) {
  const inN = incoming[p] || 0;
  const outN = outgoing[p] || 0;
  result[p] = { in: inN, out: outN, net: inN - outN };
}

console.log(JSON.stringify(result, null, 2));
