// Simplify Japan prefecture GeoJSON with Douglas-Peucker.
// Drop tiny rings whose area is negligible. Round coords to 3 decimals.
const fs = require('fs');
const path = require('path');

const TOLERANCE = parseFloat(process.argv[2] || '0.03');
const MIN_RING_AREA = parseFloat(process.argv[3] || '0.0015');

function perpDistSq(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = p[0] - a[0];
    const ddy = p[1] - a[1];
    return ddx * ddx + ddy * ddy;
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  const cx = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const cy = a[1] + Math.max(0, Math.min(1, t)) * dy;
  const ddx = p[0] - cx;
  const ddy = p[1] - cy;
  return ddx * ddx + ddy * ddy;
}

function dpSimplify(points, tol) {
  if (points.length < 3) return points.slice();
  const tolSq = tol * tol;
  const n = points.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxIdx = -1;
    let maxDistSq = 0;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistSq(points[i], points[s], points[e]);
      if (d > maxDistSq) {
        maxDistSq = d;
        maxIdx = i;
      }
    }
    if (maxDistSq > tolSq && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx]);
      stack.push([maxIdx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function ringArea(ring) {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

function round(arr) {
  return arr.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}

function processRing(ring) {
  const simplified = dpSimplify(ring, TOLERANCE);
  if (simplified.length < 4) return null;
  if (ringArea(simplified) < MIN_RING_AREA) return null;
  // Ensure closed
  const r = round(simplified);
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) {
    r.push([r[0][0], r[0][1]]);
  }
  return r;
}

const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'japan.geojson'), 'utf8'));

const out = { type: 'FeatureCollection', features: [] };

let originalPts = 0;
let simplifiedPts = 0;

for (const f of j.features) {
  const name = f.properties.nam_ja;
  let geom = f.geometry;
  let newCoords;
  if (geom.type === 'Polygon') {
    const polys = [];
    for (const ring of geom.coordinates) {
      originalPts += ring.length;
      const r = processRing(ring);
      if (r) {
        polys.push(r);
        simplifiedPts += r.length;
      }
    }
    if (polys.length === 0) continue;
    newCoords = polys;
  } else if (geom.type === 'MultiPolygon') {
    const polys = [];
    for (const poly of geom.coordinates) {
      const rings = [];
      for (const ring of poly) {
        originalPts += ring.length;
        const r = processRing(ring);
        if (r) {
          rings.push(r);
          simplifiedPts += r.length;
        }
      }
      if (rings.length) polys.push(rings);
    }
    if (polys.length === 0) continue;
    newCoords = polys;
  }
  out.features.push({
    type: 'Feature',
    properties: { name },
    geometry: { type: geom.type, coordinates: newCoords },
  });
}

const json = JSON.stringify(out);
fs.writeFileSync(path.join(__dirname, 'japan_simplified.geojson'), json);
process.stderr.write(`Input pts: ${originalPts}, output pts: ${simplifiedPts}, file size: ${json.length} bytes\n`);
