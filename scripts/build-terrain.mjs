// Builds the St. George landscape stage from raw map data.
//
//   in:  data/raw/terrarium/*.png   AWS Terrain Tiles (Terrarium encoding), zoom 12
//        data/raw/osm.json          OpenStreetMap coastline, water, rivers, wetlands, places
//   out: public/data/meta.json      grid sizes, projection, lake levels, rivers, labels, route
//        public/data/height.bin     Float32 ground height (m) on the mesh grid
//        public/data/water.bin      Float32 per mesh point: inland water surface (m), SEA (-9999) for
//                                   tidal water, NaN for dry land
//        public/data/paint.png      ground colour, one pixel per PAINT metres
//        public/data/trees.bin      tree instances
//        data/preview.png           a top-down check image (not shipped)
//
// Everything here is meant to be re-run: change a constant, run `npm run build:data`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- config

// The stage: St. George and Lake Utopia down to Letete. Piskahegan is deliberately outside.
const BBOX = { s: 45.020, n: 45.215, w: -66.940, e: -66.755 };
// Scene origin (0,0,0) is St. George, at the falls end of town.
const ORIGIN = { lat: 45.1276, lon: -66.8270 };
const FINE = 10;   // metres per cell of the working rasters
const CELL = 30;   // metres per terrain mesh cell
const PAINT = 15;  // metres per ground-colour pixel
const TREE_SPACING = 40;

// Tides in Passamaquoddy Bay run about 7 m; OSM coastline is roughly high water.
const HIGH_WATER = 3.6;

const M_LAT = 111135; // metres per degree of latitude at 45.1 N
const M_LON = 78683;  // metres per degree of longitude at 45.1 N
const toX = (lon) => (lon - ORIGIN.lon) * M_LON;
const toZ = (lat) => -(lat - ORIGIN.lat) * M_LAT; // north is -z

const XMIN = toX(BBOX.w), XMAX = toX(BBOX.e);
const ZMIN = toZ(BBOX.n), ZMAX = toZ(BBOX.s);
const FW = Math.ceil((XMAX - XMIN) / FINE), FH = Math.ceil((ZMAX - ZMIN) / FINE);
const FN = FW * FH;
const MW = Math.floor((XMAX - XMIN) / CELL) + 1, MH = Math.floor((ZMAX - ZMIN) / CELL) + 1;
const PW = Math.ceil((XMAX - XMIN) / PAINT), PH = Math.ceil((ZMAX - ZMIN) / PAINT);

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
log(`fine ${FW}x${FH}, mesh ${MW}x${MH}, paint ${PW}x${PH}`);

// ---------------------------------------------------------------- helpers

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Continuous fine-grid coordinates (cell centres sit at +0.5).
const fu = (x) => (x - XMIN) / FINE;
const fv = (z) => (z - ZMIN) / FINE;
function hash2(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, scale, seed) {
  const u = x / scale, v = z / scale;
  const i = Math.floor(u), j = Math.floor(v);
  const a = u - i, b = v - j;
  const sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
  return mix(mix(hash2(i, j, seed), hash2(i + 1, j, seed), sa), mix(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), sa), sb);
}
function fbm(x, z, scale, seed) {
  return 0.55 * vnoise(x, z, scale, seed) + 0.3 * vnoise(x, z, scale / 2.3, seed + 7) + 0.15 * vnoise(x, z, scale / 5.1, seed + 13);
}
function sampleF(arr, u, v) { // bilinear on a fine raster, u/v in continuous cell coords
  const x = clamp(u - 0.5, 0, FW - 1.001), y = clamp(v - 0.5, 0, FH - 1.001);
  const i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j, k = j * FW + i;
  return mix(mix(arr[k], arr[k + 1], a), mix(arr[k + FW], arr[k + FW + 1], a), b);
}
const cellOf = (x, z) => clamp(Math.floor(fv(z)), 0, FH - 1) * FW + clamp(Math.floor(fu(x)), 0, FW - 1);

// ---------------------------------------------------------------- elevation

const TZ = 12, TX0 = 1286, TY0 = 1468, NTX = 3, NTY = 6;
const DW = NTX * 256, DH = NTY * 256;
const dem = new Float32Array(DW * DH);
for (let ty = 0; ty < NTY; ty++) for (let tx = 0; tx < NTX; tx++) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'data/raw/terrarium', `${TZ}_${TX0 + tx}_${TY0 + ty}.png`)));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const p = (y * 256 + x) * 4;
    dem[(ty * 256 + y) * DW + tx * 256 + x] = png.data[p] * 256 + png.data[p + 1] + png.data[p + 2] / 256 - 32768;
  }
}
function demAt(lat, lon) {
  const n = 256 * 2 ** TZ, r = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * n - TX0 * 256 - 0.5;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - TY0 * 256 - 0.5;
  const x = clamp(px, 0, DW - 1.001), y = clamp(py, 0, DH - 1.001);
  const i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j, k = j * DW + i;
  return mix(mix(dem[k], dem[k + 1], a), mix(dem[k + DW], dem[k + DW + 1], a), b);
}
const demF = new Float32Array(FN);
for (let j = 0; j < FH; j++) {
  const lat = ORIGIN.lat - (ZMIN + (j + 0.5) * FINE) / M_LAT;
  for (let i = 0; i < FW; i++) demF[j * FW + i] = demAt(lat, ORIGIN.lon + (XMIN + (i + 0.5) * FINE) / M_LON);
}
log('elevation sampled');

// ---------------------------------------------------------------- OSM

const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw/osm.json'), 'utf8')).elements;
const toLocal = (g) => g.map((p) => [toX(p.lon), toZ(p.lat)]);

// Rasterise a polyline into a mask so that it forms a 4-connected wall.
function drawLine(mask, x0, z0, x1, z1, val = 1) {
  const u0 = fu(x0), v0 = fv(z0), u1 = fu(x1), v1 = fv(z1);
  const n = Math.ceil(Math.hypot(u1 - u0, v1 - v0) * 4) + 1;
  let pi = -1, pj = -1;
  for (let s = 0; s <= n; s++) {
    const t = s / n, i = Math.floor(mix(u0, u1, t)), j = Math.floor(mix(v0, v1, t));
    if (i === pi && j === pj) continue;
    if (pi >= 0 && i !== pi && j !== pj && pi >= 0 && pi < FW && j >= 0 && j < FH) mask[j * FW + pi] = val;
    if (i >= 0 && i < FW && j >= 0 && j < FH) mask[j * FW + i] = val;
    pi = i; pj = j;
  }
}
// Even-odd scanline fill of rings (local metres) onto the fine grid.
function fillRings(rings, cb) {
  let vmin = Infinity, vmax = -Infinity;
  const segs = [];
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const a = r[k], b = r[(k + 1) % r.length];
    const au = fu(a[0]), av = fv(a[1]), bu = fu(b[0]), bv = fv(b[1]);
    if (av === bv) continue;
    segs.push([au, av, bu, bv]);
    vmin = Math.min(vmin, av, bv); vmax = Math.max(vmax, av, bv);
  }
  const j0 = clamp(Math.floor(vmin), 0, FH - 1), j1 = clamp(Math.ceil(vmax), 0, FH - 1);
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const yc = j + 0.5;
    xs.length = 0;
    for (const [au, av, bu, bv] of segs) if ((av <= yc) !== (bv <= yc)) xs.push(au + ((yc - av) / (bv - av)) * (bu - au));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = clamp(Math.ceil(xs[k] - 0.5), 0, FW), i1 = clamp(Math.floor(xs[k + 1] - 0.5), -1, FW - 1);
      for (let i = i0; i <= i1; i++) cb(j * FW + i);
    }
  }
}
const same = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
function assemble(ways) {
  const pool = ways.map((w) => w.slice()), rings = [];
  while (pool.length) {
    let ring = pool.pop();
    for (let guard = 0; guard < 2000 && !same(ring[0], ring[ring.length - 1]); guard++) {
      const end = ring[ring.length - 1];
      let k = pool.findIndex((w) => same(w[0], end)), rev = false;
      if (k < 0) { k = pool.findIndex((w) => same(w[w.length - 1], end)); rev = true; }
      if (k < 0) break;
      const w = pool.splice(k, 1)[0];
      if (rev) w.reverse();
      ring = ring.concat(w.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

// ---- sea: coastline walls, connected regions, then vote with "water is on the right"
const wall = new Uint8Array(FN);
const coastWays = osm.filter((e) => e.type === 'way' && e.tags?.natural === 'coastline').map((e) => toLocal(e.geometry));
for (const w of coastWays) for (let k = 0; k + 1 < w.length; k++) drawLine(wall, w[k][0], w[k][1], w[k + 1][0], w[k + 1][1]);

const comp = new Int32Array(FN).fill(-1);
const queue = new Int32Array(FN);
let ncomp = 0;
for (let s = 0; s < FN; s++) {
  if (wall[s] || comp[s] >= 0) continue;
  let qh = 0, qt = 0; queue[qt++] = s; comp[s] = ncomp;
  while (qh < qt) {
    const c = queue[qh++], i = c % FW, j = (c - i) / FW;
    const nb = [i > 0 ? c - 1 : -1, i < FW - 1 ? c + 1 : -1, j > 0 ? c - FW : -1, j < FH - 1 ? c + FW : -1];
    for (const n of nb) if (n >= 0 && !wall[n] && comp[n] < 0) { comp[n] = ncomp; queue[qt++] = n; }
  }
  ncomp++;
}
const votes = new Float32Array(ncomp);
const inGrid = (x, z) => x >= XMIN && x < XMAX && z >= ZMIN && z < ZMAX;
for (const w of coastWays) for (let k = 0; k + 1 < w.length; k++) {
  const [x0, z0] = w[k], [x1, z1] = w[k + 1];
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1) continue;
  // In (east, north) terms the right-hand normal of d is (dn, -de). Here z = -north.
  const de = (x1 - x0) / len, dn = -(z1 - z0) / len;
  const rx = dn, rn = -de; // right normal (east, north)
  for (const t of [0.25, 0.5, 0.75]) {
    const mx = mix(x0, x1, t), mz = mix(z0, z1, t);
    for (const [sgn, v] of [[1, 1], [-1, -1]]) {
      const px = mx + sgn * rx * FINE * 1.6, pz = mz - sgn * rn * FINE * 1.6;
      if (!inGrid(px, pz)) continue;
      const c = comp[cellOf(px, pz)];
      if (c >= 0) votes[c] += v;
    }
  }
}
// Regions with no coastline at all: decide by elevation.
const compDem = new Float64Array(ncomp), compN = new Float64Array(ncomp);
for (let c = 0; c < FN; c++) if (comp[c] >= 0) { compDem[comp[c]] += demF[c]; compN[comp[c]]++; }
const sea = new Uint8Array(FN);
for (let c = 0; c < FN; c++) {
  const k = comp[c];
  if (k < 0) continue;
  sea[c] = votes[k] > 0 || (votes[k] === 0 && compDem[k] / compN[k] < -3) ? 1 : 0;
}
for (let c = 0; c < FN; c++) if (wall[c]) { // wall cells join the majority of their neighbours
  const i = c % FW, j = (c - i) / FW; let s = 0, n = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ii = i + di, jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= FW || jj >= FH || wall[jj * FW + ii]) continue;
    s += sea[jj * FW + ii]; n++;
  }
  sea[c] = n && s * 2 > n ? 1 : 0;
}
log(`sea mask: ${ncomp} regions`);

// ---- inland water polygons
const waterPolys = [];
for (const e of osm) {
  if (e.tags?.natural !== 'water') continue;
  let rings;
  if (e.type === 'way') rings = [toLocal(e.geometry)];
  else if (e.type === 'relation') rings = assemble(e.members.filter((m) => m.type === 'way' && m.geometry).map((m) => toLocal(m.geometry)));
  else continue;
  const name = e.tags.name || '';
  const riverish = /river|canal|stream|creek/.test(e.tags.water || '') || /River|Canal|Creek|Stream|Brook/.test(name);
  waterPolys.push({ name, kind: riverish ? 'river' : 'lake', rings });
}
const waterId = new Int16Array(FN); // 1-based index into waterPolys
waterPolys.forEach((p, k) => fillRings(p.rings, (c) => { if (!sea[c]) waterId[c] = k + 1; }));
const wet = new Uint8Array(FN);
for (const e of osm) if (e.type === 'way' && e.tags?.natural === 'wetland' && e.geometry) fillRings([toLocal(e.geometry)], (c) => { wet[c] = 1; });

// The Gulley, the ravine south-west of the falls, was flooded by the pulp mill dam in 1902
// (Martin 2013, Map 4). In 1874 it was dry ground, so today's water there is taken out.
const GULLEY = { x: toX(-66.8318), z: toZ(45.1283), r: 230 };
// ...and its eastern arm and outlet beside the Gorge, below the dam (the 1902 pulp mill's flume
// and tailrace): south of the dam line only, so the millpond above the falls stays
const OUTLET = { x: toX(-66.8289), z: toZ(45.1283), r: 180, zDam: toZ(45.1298) };
for (let c = 0; c < FN; c++) {
  if (!waterId[c]) continue;
  const i = c % FW, j = (c - i) / FW, x = XMIN + (i + 0.5) * FINE, z = ZMIN + (j + 0.5) * FINE;
  if (Math.hypot(x - GULLEY.x, z - GULLEY.z) < GULLEY.r) waterId[c] = 0;
  if (z > OUTLET.zDam && Math.hypot(x - OUTLET.x, z - OUTLET.z) < OUTLET.r) waterId[c] = 0;
}

// lake level = median elevation of its cells
const levelOf = new Float32Array(waterPolys.length).fill(NaN);
{
  const buckets = waterPolys.map(() => []);
  for (let c = 0; c < FN; c++) if (waterId[c]) buckets[waterId[c] - 1].push(demF[c]);
  buckets.forEach((b, k) => { if (b.length) { b.sort((p, q) => p - q); levelOf[k] = b[b.length >> 1]; } });
}
// OSM closes the coastline across river mouths. River polygons that sit at sea level are
// tidal (the Magaguadavic estuary runs salt right up to the falls), so they become sea.
{
  const tidal = waterPolys.map((p, k) => p.kind === 'river' && levelOf[k] < HIGH_WATER + 2);
  let n = 0;
  for (let c = 0; c < FN; c++) if (waterId[c] && tidal[waterId[c] - 1]) { sea[c] = 1; waterId[c] = 0; n++; }
  for (let c = 0; c < FN; c++) if (wall[c] && !waterId[c]) {
    const i = c % FW, j = (c - i) / FW; let s = 0, m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= FW || jj >= FH || wall[jj * FW + ii]) continue;
      s += sea[jj * FW + ii]; m++;
    }
    if (m && s * 2 > m) sea[c] = 1;
  }
  // The channel below the falls is tidal all the way down, even where it narrows under the
  // lower bridge to less than a raster cell: stamp the river's own line into the sea.
  for (const e of osm) {
    if (e.type !== 'way' || e.tags?.waterway !== 'river' || e.tags.name !== 'Magaguadavic River') continue;
    if (e.geometry[0].lat > 45.1296) continue; // ways that start at or below the falls
    const pts = toLocal(e.geometry);
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], m = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4);
      for (let q = 0; q <= m; q++) {
        const x = mix(x0, x1, q / m), z = mix(z0, z1, q / m);
        for (let dz = -30; dz <= 30; dz += 5) for (let dx = -30; dx <= 30; dx += 5) {
          if (dx * dx + dz * dz > 900 || !inGrid(x + dx, z + dz)) continue;
          const c = cellOf(x + dx, z + dz);
          if (!sea[c]) { sea[c] = 1; waterId[c] = 0; n++; }
        }
      }
    }
  }
  // Seal slivers left between river polygons and the coastline: spread the sea a few cells
  // into ground the elevation model itself has at sea level.
  for (let pass = 0; pass < 8; pass++) {
    const add = [];
    for (let c = FW; c < FN - FW; c++) {
      if (sea[c] || waterId[c] || demF[c] > 0.5) continue;
      if (sea[c - 1] || sea[c + 1] || sea[c - FW] || sea[c + FW]) add.push(c);
    }
    for (const c of add) sea[c] = 1;
    n += add.length;
  }
  // ...but not above the falls. The stamp and the sliver pass reach up past the lip toward the
  // upper bridge, which dug a tidal pit under the millpond. Give those cells back to the pond.
  {
    const ways = osm.filter((e) => e.type === 'way' && e.tags?.waterway === 'river' && e.tags.name === 'Magaguadavic River'
      && e.geometry[0].lat <= 45.1296 && e.geometry[0].lat > 45.127).map((e) => toLocal(e.geometry));
    ways.sort((a, b) => a[0][0] - b[0][0]); // the lip: where the westernmost way below the dam starts
    const [lx, lz] = ways[0][0], [bx, bz] = ways[0][Math.min(2, ways[0].length - 1)];
    const bl = Math.hypot(bx - lx, bz - lz), ux = (bx - lx) / bl, uz = (bz - lz) / bl; // downstream
    let pond = 0, best = Infinity;
    for (let c = 0; c < FN; c++) {
      if (!waterId[c]) continue;
      const i = c % FW, j = (c - i) / FW, d = Math.hypot(XMIN + (i + 0.5) * FINE - lx, ZMIN + (j + 0.5) * FINE - lz);
      if (d < best) { best = d; pond = waterId[c]; }
    }
    let back = 0;
    for (let c = 0; c < FN; c++) {
      if (!sea[c]) continue;
      const i = c % FW, j = (c - i) / FW, x = XMIN + (i + 0.5) * FINE - lx, z = ZMIN + (j + 0.5) * FINE - lz;
      if (Math.hypot(x, z) < 110 && x * ux + z * uz < -3) { sea[c] = 0; waterId[c] = pond; back++; }
    }
    log(`above the falls, given back to the millpond: ${back} cells`);
  }
  log(`tidal river cells moved to sea: ${n}`);
  levelOf.forEach((v, k) => { levelOf[k] = Math.max(v, HIGH_WATER + 0.5); });
}
log(`inland water polygons: ${waterPolys.length}`);

// ---------------------------------------------------------------- distance transforms

const INF = 1e20;
function edt(isFeature) { // squared distance (cells²) + index of nearest feature
  const d2 = new Float64Array(FN), near = new Int32Array(FN);
  const colD = new Float64Array(FN), colY = new Int32Array(FN);
  const n = Math.max(FW, FH), f = new Float64Array(n), d = new Float64Array(n);
  const arg = new Int32Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) { const p = v[k]; s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= zz[k] && k > 0) k--; else break; }
      if (s <= zz[k]) { v[k] = q; zz[k + 1] = INF; continue; }
      k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; arg[q] = v[k]; }
  };
  for (let i = 0; i < FW; i++) {
    for (let j = 0; j < FH; j++) f[j] = isFeature(j * FW + i) ? 0 : INF;
    pass(FH);
    for (let j = 0; j < FH; j++) { colD[j * FW + i] = d[j]; colY[j * FW + i] = arg[j]; }
  }
  for (let j = 0; j < FH; j++) {
    for (let i = 0; i < FW; i++) f[i] = colD[j * FW + i];
    pass(FW);
    for (let i = 0; i < FW; i++) { d2[j * FW + i] = d[i]; near[j * FW + i] = colY[j * FW + arg[i]] * FW + arg[i]; }
  }
  return { d2, near };
}
const toM = (d2) => Math.sqrt(d2) * FINE;
const seaT = edt((c) => sea[c]);          // land -> nearest sea
const landT = edt((c) => !sea[c]);        // sea -> nearest land
const inland = (c) => waterId[c] > 0;
const inlandT = edt(inland);              // anything -> nearest inland water
const dryT = edt((c) => !inland(c));      // inland water -> nearest shore
log('distance fields');

// ---------------------------------------------------------------- rivers

const RIVER_WIDTH = { 'Magaguadavic River': 60, 'The Canal': 26, 'Letang River': 18, 'Bonny River': 16 };
const rivers = [];
for (const e of osm) {
  if (e.type !== 'way' || !/^(river|stream|canal)$/.test(e.tags?.waterway || '')) continue;
  const pts = toLocal(e.geometry);
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  const name = e.tags.name || '';
  const width = RIVER_WIDTH[name] ?? (e.tags.waterway === 'stream' ? 9 : 18);
  if (e.tags.waterway === 'stream' && len < 1100 && !name) continue;
  // resample every 12 m, clipped to the stage
  const s = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 12));
    for (let q = 0; q < n; q++) s.push([mix(x0, x1, q / n), mix(z0, z1, q / n)]);
  }
  s.push(pts[pts.length - 1]);
  let run = [];
  const flush = () => { if (run.length > 3) rivers.push({ name, kind: e.tags.waterway, width, pts: run }); run = []; };
  for (const p of s) { if (inGrid(p[0], p[1])) run.push(p); else flush(); }
  flush();
}
// Water surface along each river: never runs uphill, meets lakes at their level.
for (const r of rivers) {
  let run = Infinity;
  r.surf = r.pts.map(([x, z]) => {
    const c = cellOf(x, z);
    if (sea[c]) { r.hitsSea = true; return (run = Math.min(run, 1)); }
    if (waterId[c] && waterPolys[waterId[c] - 1].kind === 'lake') return (run = levelOf[waterId[c] - 1]);
    return (run = Math.min(run, sampleF(demF, fu(x), fv(z)) - 0.5));
  });
  for (let pass = 0; pass < 3; pass++) { // soften the steps, then re-impose downhill
    const s2 = r.surf.slice();
    for (let k = 2; k < s2.length - 2; k++) s2[k] = (r.surf[k - 2] + r.surf[k - 1] + r.surf[k] + r.surf[k + 1] + r.surf[k + 2]) / 5;
    r.surf = s2;
  }
  for (let k = r.surf.length - 2; k >= 0; k--) r.surf[k] = Math.max(r.surf[k], r.surf[k + 1]);
  for (let k = 1; k < r.surf.length; k++) r.surf[k] = Math.min(r.surf[k], r.surf[k - 1]);
  r.state = r.pts.map(([x, z]) => { const c = cellOf(x, z); return sea[c] ? 'sea' : waterId[c] ? 'poly' : 'land'; });
}
// River-polygon surfaces come from the nearest river centreline.
const lineSurf = new Float32Array(FN).fill(NaN);
for (const r of rivers) r.pts.forEach(([x, z], k) => {
  // only where the line runs inside a water polygon: a stream still up in the hills must not
  // set the level of the canal it is about to join
  if (r.state[k] !== 'poly') return;
  const c = cellOf(x, z);
  if (Number.isNaN(lineSurf[c]) || r.surf[k] < lineSurf[c]) lineSurf[c] = r.surf[k];
});
const lineT = edt((c) => !Number.isNaN(lineSurf[c]));
const waterSurfF = new Float32Array(FN).fill(NaN);
for (let c = 0; c < FN; c++) {
  if (!waterId[c]) continue;
  const p = waterPolys[waterId[c] - 1];
  waterSurfF[c] = p.kind === 'river' && toM(lineT.d2[c]) < 400 ? lineSurf[lineT.near[c]] : levelOf[waterId[c] - 1];
}
log(`rivers: ${rivers.length}`);

// Segment hash for "distance to the nearest open river" (the ones drawn as ribbons).
const HB = 60;
const hashW = Math.ceil((XMAX - XMIN) / HB), hashH = Math.ceil((ZMAX - ZMIN) / HB);
const riverHash = Array.from({ length: hashW * hashH }, () => []);
rivers.forEach((r, ri) => {
  for (let k = 0; k + 1 < r.pts.length; k++) {
    if (r.state[k] !== 'land' && r.state[k + 1] !== 'land') continue;
    const [x0, z0] = r.pts[k], [x1, z1] = r.pts[k + 1], reach = r.width / 2 + 120;
    const i0 = Math.floor((Math.min(x0, x1) - reach - XMIN) / HB), i1 = Math.floor((Math.max(x0, x1) + reach - XMIN) / HB);
    const j0 = Math.floor((Math.min(z0, z1) - reach - ZMIN) / HB), j1 = Math.floor((Math.max(z0, z1) + reach - ZMIN) / HB);
    for (let j = Math.max(0, j0); j <= Math.min(hashH - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(hashW - 1, i1); i++) riverHash[j * hashW + i].push([ri, k]);
  }
});
function nearestRiver(x, z) {
  const i = Math.floor((x - XMIN) / HB), j = Math.floor((z - ZMIN) / HB);
  if (i < 0 || j < 0 || i >= hashW || j >= hashH) return null;
  let best = null;
  for (const [ri, k] of riverHash[j * hashW + i]) {
    const r = rivers[ri], [x0, z0] = r.pts[k], [x1, z1] = r.pts[k + 1];
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - x0) * dx + (z - z0) * dz) / L2, 0, 1);
    const d = Math.hypot(x - x0 - t * dx, z - z0 - t * dz) - r.width / 2;
    if (!best || d < best.d) best = { d, surf: mix(r.surf[k], r.surf[k + 1], t), width: r.width };
  }
  return best;
}

// ---------------------------------------------------------------- the Gorge

// Below the dam the Magaguadavic drops through a rock gorge to the lower bridge and the Basin
// (Martin 2013, Map 4 and the c.1890s photograph on p. 16). The river's own line gives the
// path; the fall is split into steps so it reads as upper falls, rapids and lower falls.
const LOWER_BRIDGE = [toX(-66.82578), toZ(45.12778)];
const GORGE_HALF = 15;
const gorge = (() => {
  const ways = osm.filter((e) => e.type === 'way' && e.tags?.waterway === 'river' && e.tags.name === 'Magaguadavic River'
    && e.geometry[0].lat <= 45.1296 && e.geometry[0].lat > 45.127).map((e) => toLocal(e.geometry));
  ways.sort((a, b) => a[0][0] - b[0][0]); // start with the one furthest west: the lip
  let line = ways.shift();
  for (let grew = true; grew;) {
    grew = false;
    const end = line[line.length - 1];
    const k = ways.findIndex((w) => Math.hypot(w[0][0] - end[0], w[0][1] - end[1]) < 5);
    if (k >= 0) { line = line.concat(ways.splice(k, 1)[0].slice(1)); grew = true; }
  }
  let cut = 0, best = Infinity;
  line.forEach((p, k) => { const d = Math.hypot(p[0] - LOWER_BRIDGE[0], p[1] - LOWER_BRIDGE[1]); if (d < best) { best = d; cut = k; } });
  const pts = [];
  for (let k = 0; k < cut; k++) {
    const [x0, z0] = line[k], [x1, z1] = line[k + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 5));
    for (let q = 0; q < n; q++) pts.push([mix(x0, x1, q / n), mix(z0, z1, q / n)]);
  }
  pts.push(line[cut]);
  let t = 0;
  return pts.map((p, k) => { if (k) t += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]); return [p[0], p[1], t]; });
})();
const GORGE_LEN = gorge[gorge.length - 1][2];
const LIP = (() => { // median river level within 80 m of the lip (single cells there can read low)
  const v = [];
  for (let dz = -80; dz <= 80; dz += FINE) for (let dx = -80; dx <= 80; dx += FINE) {
    const c = cellOf(gorge[0][0] + dx, gorge[0][1] + dz);
    if (waterId[c] && Math.hypot(dx, dz) <= 80) v.push(waterSurfF[c]);
  }
  v.sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 9;
})();
// water surface down the gorge: [metres from the lip, height]
const GORGE_STEPS = [[0, LIP], [18, LIP - 0.6], [34, LIP * 0.62], [120, LIP * 0.48], [150, LIP * 0.3], [GORGE_LEN - 40, 0.8], [GORGE_LEN, -0.8]];
function gorgeSurf(t) {
  for (let k = 0; k + 1 < GORGE_STEPS.length; k++) {
    const [t0, h0] = GORGE_STEPS[k], [t1, h1] = GORGE_STEPS[k + 1];
    if (t <= t1) return mix(h0, h1, clamp((t - t0) / (t1 - t0), 0, 1));
  }
  return GORGE_STEPS[GORGE_STEPS.length - 1][1];
}
const gorgeBox = gorge.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
function gorgeAt(x, z) {
  if (x < gorgeBox[0] - 60 || x > gorgeBox[2] + 60 || z < gorgeBox[1] - 60 || z > gorgeBox[3] + 60) return null;
  let best = null;
  for (let k = 0; k + 1 < gorge.length; k++) {
    const [x0, z0, t0] = gorge[k], [x1, z1, t1] = gorge[k + 1];
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    const f = clamp(((x - x0) * dx + (z - z0) * dz) / L2, 0, 1);
    const d = Math.hypot(x - x0 - f * dx, z - z0 - f * dz);
    if (!best || d < best.d) best = { d, t: mix(t0, t1, f) };
  }
  best.surf = gorgeSurf(best.t);
  return best;
}
log(`gorge: ${Math.round(GORGE_LEN)} m, lip ${LIP.toFixed(1)} m`);

// ---------------------------------------------------------------- ground height

function groundAt(x, z) {
  const u = fu(x), v = fv(z), c = cellOf(x, z);
  const d = sampleF(demF, u, v);
  const gz = gorgeAt(x, z);
  if (gz && gz.d < GORGE_HALF && gz.t > 4) return gz.surf - 1.6 - 1.2 * smooth(GORGE_HALF, 0, gz.d);
  if (sea[c]) { // tidal flats first, then the real sea floor further out
    const dl = toM(landT.d2[c]);
    // steep enough that the narrow estuary is full at mid-tide; flats show as the tide drops
    const profile = dl < 70 ? HIGH_WATER + 0.3 - 0.11 * dl : HIGH_WATER + 0.3 - 7.7 - 0.03 * (dl - 70);
    const bathy = clamp(Math.min(d, -1), -90, -1);
    return Math.max(-45, Math.min(profile, mix(profile, bathy, smooth(150, 800, dl))));
  }
  if (waterId[c]) return waterSurfF[c] - Math.min(0.8 + 0.06 * toM(dryT.d2[c]), 14);
  const ds = toM(seaT.d2[c]);
  let h = Math.max(d, HIGH_WATER + 0.3 + 0.02 * Math.min(ds, 100)); // above high water near the shore only
  h = mix(Math.min(HIGH_WATER + 0.3 + 0.07 * ds, h), h, smooth(0, 160, ds));
  const dw = toM(inlandT.d2[c]);
  if (dw < 100) {
    const w = waterSurfF[inlandT.near[c]];
    const far = Math.max(h, w + 0.6 + 0.02 * dw);
    h = mix(Math.min(w + 0.6 + 0.1 * dw, far), far, smooth(0, 100, dw));
  }
  const r = nearestRiver(x, z);
  if (r && r.d < 120) {
    const depth = 1.2 + 0.03 * r.width;
    h = Math.min(h, r.d < 0 ? r.surf - depth * smooth(0, -r.width / 2, r.d) - 0.15 : r.surf + 0.5 + r.d * 0.14);
  }
  return h;
}
// The Gorge's rock walls: steep from the channel up to the natural ground, fading out where the
// gorge opens into the Basin. Applied on top of everything else, sea cells included.
function withGorgeWalls(x, z, h) {
  const gz = gorgeAt(x, z);
  if (!gz || gz.t < 20 || gz.d < GORGE_HALF || gz.d > 45) return h;
  // never above the ground beside the gorge, so the walls cut down into the land, not up out of it
  const rim = Math.max(h, gz.surf + 4);
  const wall = Math.min(gz.surf + 1 + (gz.d - GORGE_HALF) * 0.9, rim);
  return Math.max(h, mix(h, wall, 1 - smooth(GORGE_LEN - 50, GORGE_LEN, gz.t)));
}

const height = new Float32Array(MW * MH);
for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) { const x = XMIN + i * CELL, z = ZMIN + j * CELL; height[j * MW + i] = withGorgeWalls(x, z, groundAt(x, z)); }
// Inland water surface on the mesh grid: set wherever a water cell is within reach.
// Sea points are flagged too, so the one flat sea sheet can hide itself over lakes and land
// that happen to lie below sea level (Lake Utopia's bed does).
const SEA = -9999;
const waterMesh = new Float32Array(MW * MH).fill(NaN);
for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
  const x = XMIN + i * CELL, z = ZMIN + j * CELL, c = cellOf(x, z);
  if (sea[c] || toM(seaT.d2[c]) < CELL) { waterMesh[j * MW + i] = SEA; continue; }
  if (toM(inlandT.d2[c]) <= CELL * 1.05) waterMesh[j * MW + i] = waterSurfF[inlandT.near[c]];
}
log('ground height');

function heightAt(x, z) { // bilinear on the mesh
  const u = clamp((x - XMIN) / CELL, 0, MW - 1.001), v = clamp((z - ZMIN) / CELL, 0, MH - 1.001);
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * MW + i;
  return mix(mix(height[k], height[k + 1], a), mix(height[k + MW], height[k + MW + 1], a), b);
}
function demSlopeAt(x, z) { // the natural slope, before any shore or bank shaping
  const u = fu(x), v = fv(z);
  return Math.hypot(sampleF(demF, u + 2, v) - sampleF(demF, u - 2, v), sampleF(demF, u, v + 2) - sampleF(demF, u, v - 2)) / (4 * FINE);
}
function slopeAt(x, z) {
  const e = CELL;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

// ---------------------------------------------------------------- the 1870s land cover

// Places with farms and clearings by the mid-1870s; radius in metres.
const SETTLEMENTS = [
  ['St. George', 45.1276, -66.8270, 1700],
  ['Bonny River', 45.2019, -66.8576, 950],
  ['Canal', 45.1584, -66.8268, 700],
  ['Caithness', 45.1172, -66.8492, 750],
  ['Breadalbane', 45.1284, -66.8673, 750],
  ['Bethel', 45.1588, -66.9157, 650],
  ['Mascarene', 45.1003, -66.9041, 950],
  ['Letang', 45.0810, -66.8348, 850],
  ['Upper Letang', 45.1310, -66.7876, 600],
  ['Back Bay', 45.0562, -66.8695, 900],
  ['Letete', 45.0587, -66.8915, 950],
  ['Utopia', 45.1480, -66.7712, 450],
].map(([name, lat, lon, r]) => ({ name, x: toX(lon), z: toZ(lat), r }));
const magaguadavic = rivers.filter((r) => r.name === 'Magaguadavic River');
function clearing(x, z) {
  let c = 0;
  const warp = 0.55 + 0.9 * fbm(x, z, 650, 17);
  for (const s of SETTLEMENTS) c = Math.max(c, 1 - smooth(s.r * 0.4, s.r * 1.2, Math.hypot(x - s.x, z - s.z) * warp));
  // intervale farms along the Magaguadavic between Bonny River and the falls
  if (z < 0 && z > toZ(45.205)) {
    let best = Infinity;
    for (const r of magaguadavic) for (let k = 0; k < r.pts.length; k += 4) best = Math.min(best, Math.hypot(x - r.pts[k][0], z - r.pts[k][1]));
    c = Math.max(c, (1 - smooth(120, 420, best)) * 0.85);
  }
  const n = fbm(x, z, 900, 3);
  return clamp(c * (0.55 + 0.9 * n) - 0.15, 0, 1);
}

// Utopia Granite: the red belt north of the canal (after Martin 2013, Maps 2-3).
const GRANITE_EDGE = [[-66.945, 45.168], [-66.90, 45.166], [-66.87, 45.162], [-66.843, 45.1605], [-66.83, 45.1615], [-66.815, 45.1650], [-66.80, 45.172], [-66.785, 45.182], [-66.77, 45.19], [-66.75, 45.195]]
  .map(([lon, lat]) => [toX(lon), toZ(lat)]);
function graniteBelt(x, z) { // >0 north of the edge
  for (let k = 0; k + 1 < GRANITE_EDGE.length; k++) {
    const [x0, z0] = GRANITE_EDGE[k], [x1, z1] = GRANITE_EDGE[k + 1];
    if (x >= x0 && x <= x1) return mix(z0, z1, (x - x0) / (x1 - x0)) - z;
  }
  return -1;
}

// The Bay of Fundy Co. quarry floor (Map 3, No. 10): bare rock in front of the cut face.
// Its orientation matches structures.quarry, which is worked out from the slope in the same way.
const QUARRY_FLOOR = (() => {
  const x = toX(-66.8255), z = toZ(45.1640);
  return { x, z };
})();
function quarryFloor(x, z, rot) {
  const dx = x - QUARRY_FLOOR.x, dz = z - QUARRY_FLOOR.z;
  const lx = dx * Math.cos(rot) - dz * Math.sin(rot), lz = dx * Math.sin(rot) + dz * Math.cos(rot);
  return Math.abs(lx) < 27 && lz > -6 && lz < 20 ? 1 - smooth(14, 20, lz) * 0.5 : 0;
}

// Bare ledges: scattered through the belt, and thickest along its southern edge between the
// Magaguadavic and Lake Utopia, where the quarries opened ("immense ledges" - O'Halloran 1968).
const QUARRY_ROW = [toX(-66.845), toX(-66.806)];
function ledges(x, z, g, sl) {
  if (g <= 0) return 0;
  let e = smooth(0.72, 0.86, fbm(x, z, 220, 21)) * smooth(0.05, 0.12, sl);
  if (x > QUARRY_ROW[0] && x < QUARRY_ROW[1] && g < 650) e = Math.max(e, smooth(0.5, 0.7, fbm(x, z, 110, 40)) * (1 - smooth(350, 650, g)));
  return e;
}

const PAL = {
  meadow: [147, 174, 116], meadow2: [127, 157, 101], forest: [69, 106, 71], forestMixed: [91, 126, 82],
  sand: [207, 193, 153], shoreRock: [150, 140, 128], mud: [141, 122, 94], mudWet: [112, 100, 80],
  seabed: [88, 104, 92], lakebed: [112, 104, 76], marsh: [170, 182, 98], marsh2: [128, 156, 82],
  granite: [184, 100, 86], granite2: [214, 140, 118], rock: [140, 138, 130], bank: [120, 128, 78],
  hedge: [92, 120, 64],
  // hay, oats, pasture, turned earth (potatoes), fallow, ripe grain - also in src/world.js
  fields: [[214, 196, 104], [196, 208, 108], [140, 190, 86], [150, 114, 76], [182, 184, 104], [226, 214, 140]],
};
const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function fieldAt(x, z) { // cleared land split into lots; returns a field kind or -1
  const ox = x, oz = z;
  x += 24 * Math.sin(oz / 170) + 12 * Math.sin(oz / 63);
  z += 19 * Math.sin(ox / 210);
  const ang = 0.5; // gently bent lots; keep in step with the ground shader
  const u = x * Math.cos(ang) - z * Math.sin(ang), v = x * Math.sin(ang) + z * Math.cos(ang);
  const W = 150, H = 90, i = Math.floor(u / W), j = Math.floor(v / H);
  const fu2 = u / W - i, fv2 = v / H - j;
  const edge = Math.min(fu2, 1 - fu2) * W < 5 || Math.min(fv2, 1 - fv2) * H < 5;
  // +1000 keeps lot numbers positive; src/world.js repeats this hash in GLSL, so keep them in step
  // lot centre back in map coordinates: a lot is a field only if its middle is open farmland
  const cu = (i + 0.5) * W, cv = (j + 0.5) * H;
  const cx = cu * Math.cos(ang) + cv * Math.sin(ang), cz = -cu * Math.sin(ang) + cv * Math.cos(ang);
  return { kind: Math.floor(hash2(i + 1000, j + 1000, 11) * PAL.fields.length), open: hash2(i + 1000, j + 1000, 5), edge, cx, cz };
}

// the quarry faces downhill, like structures.quarry below
const QUARRY_ROT = (() => {
  const { x, z } = QUARRY_FLOOR;
  return Math.atan2(-(heightAt(x + 30, z) - heightAt(x - 30, z)), -(heightAt(x, z + 30) - heightAt(x, z - 30)));
})();
const paint = new PNG({ width: PW, height: PH });
// masks.png: R = open farmland, G = bare rock, B = marsh. The ground shader draws lots, cracks
// and reeds from these so they stay sharp up close.
const masks = new PNG({ width: PW, height: PH });
const farmAt = new Float32Array(PW * PH);
const coverClear = new Float32Array(PW * PH);
for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
  const x = XMIN + (i + 0.5) * PAINT, z = ZMIN + (j + 0.5) * PAINT, c = cellOf(x, z);
  const h = heightAt(x, z), n = fbm(x, z, 260, 1), n2 = vnoise(x, z, 40, 9);
  let col, farm = 0, rock = 0;
  if (sea[c]) {
    const dl = toM(landT.d2[c]);
    col = h > -HIGH_WATER - 0.5 ? lerpC(PAL.mud, PAL.mudWet, smooth(2, -3, h)) : PAL.seabed;
    if (dl < 22) col = lerpC(PAL.sand, col, dl / 22);
    col = lerpC(col, PAL.shoreRock, n2 > 0.72 ? 0.6 : 0);
  } else if (waterId[c]) {
    col = PAL.lakebed;
  } else {
    const ds = toM(seaT.d2[c]), dw = toM(inlandT.d2[c]), sl = demSlopeAt(x, z);
    const clear = clearing(x, z);
    coverClear[j * PW + i] = clear;
    const forestShade = lerpC(PAL.forest, PAL.forestMixed, smooth(0.35, 0.7, n));
    col = lerpC(lerpC(PAL.meadow, PAL.meadow2, n2), forestShade, 1 - clear);
    // farm lots are drawn by the ground shader from this, so their edges stay sharp up close
    farm = wet[c] ? 0 : clear * (1 - smooth(0.1, 0.14, sl));
    if (wet[c]) col = lerpC(PAL.marsh, PAL.marsh2, vnoise(x * 3, z, 60, 4));
    const g = graniteBelt(x, z);
    const rocky = smooth(0.24, 0.42, sl) + ledges(x, z, g, sl);
    if (rocky > 0) col = lerpC(col, g > 0 ? lerpC(PAL.granite, PAL.granite2, n2) : PAL.rock, clamp(rocky, 0, 1) * (g > 0 ? 1 : 0.8));
    rock = clamp(rocky, 0, 1);
    const qf = quarryFloor(x, z, QUARRY_ROT);
    if (qf > 0) { col = lerpC(col, lerpC(PAL.granite, PAL.granite2, n2 * 0.6), qf); rock = Math.max(rock, qf); farm = 0; }
    const r = nearestRiver(x, z);
    if (r && r.d < 12) col = lerpC(col, PAL.bank, 0.7);
    if (dw < 14) col = lerpC(col, PAL.bank, 0.6);
    if (ds < 26) { col = lerpC(sl > 0.16 ? PAL.shoreRock : PAL.sand, col, smooth(8, 26, ds)); farm *= smooth(10, 30, ds); }
    if (dw < 20) farm *= smooth(8, 20, dw);
  }
  const p = (j * PW + i) * 4;
  paint.data[p] = col[0]; paint.data[p + 1] = col[1]; paint.data[p + 2] = col[2]; paint.data[p + 3] = 255;
  farmAt[j * PW + i] = clamp(farm, 0, 1);
  masks.data[p] = Math.round(farmAt[j * PW + i] * 255);
  masks.data[p + 1] = Math.round(rock * 255);
  masks.data[p + 2] = !sea[c] && !waterId[c] && wet[c] ? 255 : 0;
  masks.data[p + 3] = 255;
}
fs.writeFileSync(path.join(OUT, 'paint.png'), PNG.sync.write(paint));
fs.writeFileSync(path.join(OUT, 'masks.png'), PNG.sync.write(masks));
if (fs.existsSync(path.join(OUT, 'farm.png'))) fs.unlinkSync(path.join(OUT, 'farm.png'));
log('paint');

// ---------------------------------------------------------------- the town in detail

// A 10 m inset around the falls and the Basin, drawn in place of the 30 m ground there.
// Its rectangle sits on the 30 m grid so the two meshes meet exactly at the edge.
const TOWN_CELL = 10, TOWN_PAINT = 2.5;
const TOWN = (() => {
  const snap = (v, lo) => lo + Math.round((v - lo) / CELL) * CELL;
  const x0 = snap(toX(-66.8420), XMIN), x1 = snap(toX(-66.8130), XMIN);
  const z0 = snap(toZ(45.1370), ZMIN), z1 = snap(toZ(45.1195), ZMIN);
  return { x0, z0, x1, z1, w: Math.round((x1 - x0) / TOWN_CELL) + 1, h: Math.round((z1 - z0) / TOWN_CELL) + 1, pw: Math.round((x1 - x0) / TOWN_PAINT), ph: Math.round((z1 - z0) / TOWN_PAINT) };
})();
const inTown = (x, z, pad = 0) => x >= TOWN.x0 + pad && x <= TOWN.x1 - pad && z >= TOWN.z0 + pad && z <= TOWN.z1 - pad;
const townCentre = [toX(-66.8255), toZ(45.1288)];

// ---- streets of the 1870s town: the ones on Martin's Map 4 and in the local histories.
// Their lines come from today's map (the old core has kept its streets).
const OLD_STREETS = { 'Brunswick Street': 5, 'Main Street': 5, 'South Street': 4, 'Wallace Street': 3.5, 'North Street': 3.5,
  'Portage Street': 3.5, 'Mount Pleasant Road': 3.5, 'Campbell Hill Road': 3.5, 'Pancake Hill Road': 3.5 };
const townOsm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw/osm-town.json'), 'utf8')).elements;
const streets = townOsm.filter((e) => e.type === 'way' && e.tags?.highway && OLD_STREETS[e.tags.name] && e.geometry)
  .map((e) => ({ name: e.tags.name, half: OLD_STREETS[e.tags.name], bridge: !!e.tags.bridge, pts: toLocal(e.geometry) }));
const streetSegs = streets.flatMap((s) => s.pts.slice(1).map((p, k) => [s.pts[k], p, s.half]));
function nearestStreet(x, z) {
  let best = Infinity;
  for (const [[x0, z0], [x1, z1], h] of streetSegs) {
    if (Math.min(x0, x1) - 40 > x || Math.max(x0, x1) + 40 < x || Math.min(z0, z1) - 40 > z || Math.max(z0, z1) + 40 < z) continue;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1, f = clamp(((x - x0) * dx + (z - z0) * dz) / L2, 0, 1);
    best = Math.min(best, Math.hypot(x - x0 - f * dx, z - z0 - f * dz) - h);
  }
  return { d: best };
}

// ---- buildings: [kind, x, z, rotation (radians), variant 0..1]
// kinds: house (two storey), cape (storey and a half), store, barn, church
const buildings = [];
const taken = [];
const clearOf = (x, z, r) => taken.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > r + br);
const buildable = (x, z, slopeMax = 0.2) => {
  if (!inGrid(x, z)) return false;
  const c = cellOf(x, z);
  if (sea[c] || waterId[c] || wet[c] || toM(seaT.d2[c]) < 12 || toM(inlandT.d2[c]) < 12) return false;
  const g = gorgeAt(x, z);
  if (g && g.d < 40) return false;
  const r = nearestRiver(x, z);
  if (r && r.d < 10) return false;
  return demSlopeAt(x, z) < slopeMax;
};
function addBuilding(kind, x, z, rot, variant, r) {
  buildings.push([kind, Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(rot * 1000) / 1000, Math.round(variant * 100) / 100]);
  taken.push([x, z, r]);
}

// ---- the named structures of 1874, placed from Map 4 and the texts (notes in src/places.js)
const at = (lat, lon) => [toX(lon), toZ(lat)];
// y-rotation that points a building's long (local z) axis along a compass bearing (north is -z)
const bearingRot = (deg) => Math.atan2(Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180));
const structures = {};
{
  // Bay of Fundy Red Granite Co. finishing mill: east of the dam, north of the Gorge (Map 4, No. 1)
  const [mx, mz] = at(45.12944, -66.82778);
  const mb = (63 * Math.PI) / 180, ax = Math.sin(mb), az = -Math.cos(mb); // unit vector along the long axis
  structures.mill = { x: mx, z: mz, rot: bearingRot(63), length: 88, width: 18 };
  taken.push([mx, mz, 50]);
  // the timber dam below the upper bridge (Map 4; the c.1890s photograph on p. 16), and the flume to the wheel
  const [dx, dz] = at(45.12920, -66.82883);
  const [gx, gz] = gorge[0], [hx, hz] = gorge[4];
  structures.dam = { x: dx, z: dz, rot: Math.atan2(hx - gx, hz - gz), level: LIP };
  structures.flume = [[dx + 14, dz - 4], [mx - ax * 44, mz - az * 44]];
  // bridges: today's Brunswick Street (upper) and South Street (lower) crossings
  const bridge = (name) => { const s = streets.find((q) => q.bridge && q.name === name); return s ? [s.pts[0], s.pts[s.pts.length - 1]] : null; };
  structures.upperBridge = bridge('Brunswick Street');
  structures.lowerBridge = bridge('South Street');
  // Wharves are { x, z (root, on the shore), rot (direction out over the water), length, width }.
  // Main wharf: from the north shore of the Basin just east of the lower bridge, south into the Basin (Map 4).
  const nearSea = (x, z) => { const c = seaT.near[cellOf(x, z)]; const i = c % FW, j = (c - i) / FW; return [XMIN + (i + 0.5) * FINE, ZMIN + (j + 0.5) * FINE]; };
  const [wx, wz] = at(45.12795, -66.82430), wb = (170 * Math.PI) / 180;
  structures.wharf = { x: wx, z: wz, rot: Math.atan2(Math.sin(wb), -Math.cos(wb)), length: 90, width: 14 };
  taken.push([wx, wz, 25]);
  // "the distinctive, windswept White Pine on the right riverbank beyond the footbridge": 'right' as
  // the c.1890s photograph looks UP the Gorge (p. 16). Map 4 puts it on the north-east (town,
  // Brunswick Street) bank, just upstream of the footbridge, above the rock wall.
  const gp = gorge[Math.floor(gorge.length * 0.56)], gq = gorge[Math.floor(gorge.length * 0.56) + 1];
  const gl = Math.hypot(gq[0] - gp[0], gq[1] - gp[1]);
  const [px, pz] = [gp[0] + ((gq[1] - gp[1]) / gl) * 34, gp[1] - ((gq[0] - gp[0]) / gl) * 34];
  structures.oldPine = { x: px, z: pz };
  taken.push([px, pz, 12]);
  // the Red Store and its wharf at Breadalbane
  const [bx, bz] = at(45.1284, -66.8673);
  const rs = nearSea(bx, bz);
  const rdir = Math.atan2(rs[0] - bx, rs[1] - bz);
  structures.redStore = { x: rs[0] - Math.sin(rdir) * 30, z: rs[1] - Math.cos(rdir) * 30, rot: rdir };
  structures.redStoreWharf = { x: rs[0] - Math.sin(rdir) * 12, z: rs[1] - Math.cos(rdir) * 12, rot: rdir, length: 70, width: 10 };
  taken.push([structures.redStore.x, structures.redStore.z, 20]);
}
// churches: at today's church sites in the old core (the exact 1874 sites are not verified)
for (const e of townOsm) {
  if (e.tags?.amenity !== 'place_of_worship' || !/Baptist|Catholic|United/.test(e.tags.name || '')) continue;
  const lat = e.lat ?? e.center?.lat ?? e.geometry?.[0]?.lat, lon = e.lon ?? e.center?.lon ?? e.geometry?.[0]?.lon;
  const [x, z] = at(lat, lon);
  if (clearOf(x, z, 18)) addBuilding('church', x, z, 0.35, hash2(Math.round(x), Math.round(z), 3), 20);
}

// Houses along the old streets: dense in the core between the falls and the Basin, thinning out.
for (const s of streets) {
  if (s.bridge) continue;
  let along = 0;
  for (let k = 0; k + 1 < s.pts.length; k++) {
    const [x0, z0] = s.pts[k], [x1, z1] = s.pts[k + 1], len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1) continue;
    const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    for (let d = (30 - (along % 30)) % 30; d < len; d += 30) {
      for (const side of [-1, 1]) {
        const h = hash2(Math.round(x0 + d * tx), Math.round(z0 + d * tz), side + 5);
        const off = s.half + 12 + h * 5;
        const x = x0 + tx * d - tz * side * off + tx * (h - 0.5) * 8;
        const z = z0 + tz * d + tx * side * off + tz * (h - 0.5) * 8;
        const fromCentre = Math.hypot(x - townCentre[0], z - townCentre[1]);
        const p = 0.08 + 0.82 * (1 - smooth(300, 1300, fromCentre));
        if (h > p || !inTown(x, z, 20) || !buildable(x, z) || !clearOf(x, z, 9)) continue;
        if (nearestStreet(x, z).d < 7) continue;
        const along = Math.atan2(tx, tz); // rotation that lines a building's long side up with the street
        const kind = fromCentre < 330 && h < 0.25 ? 'store' : h < 0.55 ? 'house' : 'cape';
        addBuilding(kind, x, z, kind === 'store' ? along + Math.PI / 2 : along, hash2(Math.round(x), Math.round(z), 8), 8);
        // a barn behind some of the outer houses
        const bxb = x - tz * side * 24, bzb = z + tx * side * 24;
        if (fromCentre > 450 && hash2(Math.round(x), Math.round(z), 9) < 0.45 && buildable(bxb, bzb) && clearOf(bxb, bzb, 10) && nearestStreet(bxb, bzb).d > 8)
          addBuilding('barn', bxb, bzb, along, hash2(Math.round(bxb), 1, 10), 10);
      }
    }
    along += len;
  }
}
const townHouses = buildings.length;

// Villages: a handful of houses and barns at each settlement of the 1870s.
for (const st of SETTLEMENTS) {
  if (st.name === 'St. George') continue;
  const n = Math.round(st.r / 110);
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < n; tries++) {
    const a = hash2(tries, st.r, 21) * Math.PI * 2, rr = Math.sqrt(hash2(tries, st.r, 22)) * st.r * 0.5;
    const x = st.x + Math.cos(a) * rr, z = st.z + Math.sin(a) * rr;
    if (!buildable(x, z, 0.14) || !clearOf(x, z, 12)) continue;
    const rot = Math.round(hash2(tries, st.r, 23) * 4) * (Math.PI / 2) + (hash2(tries, st.r, 24) - 0.5) * 0.4;
    addBuilding(hash2(tries, st.r, 25) < 0.6 ? 'cape' : 'house', x, z, rot, hash2(tries, st.r, 26), 9);
    placed++;
    const bx = x + Math.cos(rot) * 22, bz = z - Math.sin(rot) * 22;
    if (hash2(tries, st.r, 27) < 0.6 && buildable(bx, bz, 0.16) && clearOf(bx, bz, 10)) addBuilding('barn', bx, bz, rot, hash2(tries, st.r, 28), 10);
  }
}
// Farmsteads out in the cleared land: a house and barn by some field lots.
for (let j = 0; j < PH; j += 8) for (let i = 0; i < PW; i += 8) {
  const x = XMIN + (i + 0.5) * PAINT, z = ZMIN + (j + 0.5) * PAINT;
  if (farmAt[j * PW + i] < 0.45 || hash2(i, j, 41) > 0.06 || inTown(x, z)) continue;
  if (!buildable(x, z, 0.12) || !clearOf(x, z, 70)) continue;
  const rot = -0.5 + (hash2(i, j, 42) < 0.5 ? 0 : Math.PI / 2);
  addBuilding(hash2(i, j, 43) < 0.5 ? 'cape' : 'house', x, z, rot, hash2(i, j, 44), 9);
  const bx = x + Math.cos(rot) * 24, bz = z - Math.sin(rot) * 24;
  if (buildable(bx, bz, 0.14)) addBuilding('barn', bx, bz, rot, hash2(i, j, 45), 10);
}
log(`buildings: ${buildings.length} (${townHouses} in town, incl. churches)`);

// ---- the inset's ground and water
const townHeight = new Float32Array(TOWN.w * TOWN.h);
const townWater = new Float32Array(TOWN.w * TOWN.h).fill(NaN);
for (let j = 0; j < TOWN.h; j++) for (let i = 0; i < TOWN.w; i++) {
  const x = TOWN.x0 + i * TOWN_CELL, z = TOWN.z0 + j * TOWN_CELL, c = cellOf(x, z);
  const edge = Math.min(x - TOWN.x0, TOWN.x1 - x, z - TOWN.z0, TOWN.z1 - z);
  townHeight[j * TOWN.w + i] = Math.max(-45, mix(heightAt(x, z), withGorgeWalls(x, z, groundAt(x, z)), smooth(0, 90, edge)));
  const g = gorgeAt(x, z);
  if (sea[c] || toM(seaT.d2[c]) < TOWN_CELL || (g && g.d < GORGE_HALF + 5)) townWater[j * TOWN.w + i] = SEA;
  else if (toM(inlandT.d2[c]) <= TOWN_CELL * 1.05) townWater[j * TOWN.w + i] = waterSurfF[inlandT.near[c]];
}
function townHeightAt(x, z) {
  const u = clamp((x - TOWN.x0) / TOWN_CELL, 0, TOWN.w - 1.001), v = clamp((z - TOWN.z0) / TOWN_CELL, 0, TOWN.h - 1.001);
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * TOWN.w + i;
  return mix(mix(townHeight[k], townHeight[k + 1], a), mix(townHeight[k + TOWN.w], townHeight[k + TOWN.w + 1], a), b);
}
const surfaceAt = (x, z) => (inTown(x, z) ? townHeightAt(x, z) : heightAt(x, z));

// ---- the inset's paint (2.5 m) and masks: R = street, G = yard, B = rock
{
  const tp = new PNG({ width: TOWN.pw, height: TOWN.ph }), tm = new PNG({ width: TOWN.pw, height: TOWN.ph });
  const mainPaint = (x, z) => {
    const u = clamp((x - XMIN) / PAINT - 0.5, 0, PW - 1.001), v = clamp((z - ZMIN) / PAINT - 0.5, 0, PH - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    const px = (ii, jj, k) => paint.data[(jj * PW + ii) * 4 + k];
    return [0, 1, 2].map((k) => mix(mix(px(i, j, k), px(i + 1, j, k), a), mix(px(i, j + 1, k), px(i + 1, j + 1, k), a), b));
  };
  const townBuild = buildings.filter(([, x, z]) => inTown(x, z, -60));
  const DIRT = [184, 158, 110], DIRT_EDGE = [150, 128, 88], YARD = [150, 192, 100], GARDEN = [128, 100, 70], ROCK = [150, 122, 112];
  for (let j = 0; j < TOWN.ph; j++) for (let i = 0; i < TOWN.pw; i++) {
    const x = TOWN.x0 + (i + 0.5) * TOWN_PAINT, z = TOWN.z0 + (j + 0.5) * TOWN_PAINT, c = cellOf(x, z);
    let col = mainPaint(x, z), road = 0, yard = 0, rock = 0;
    if (!sea[c] && !waterId[c]) {
      for (const [kind, bx, bz, rot] of townBuild) {
        const dx = x - bx, dz = z - bz;
        if (Math.abs(dx) > 26 || Math.abs(dz) > 26) continue;
        const lx = dx * Math.cos(rot) - dz * Math.sin(rot), lz = dx * Math.sin(rot) + dz * Math.cos(rot);
        const r = kind === 'church' ? 22 : kind === 'barn' ? 14 : 16;
        if (Math.abs(lx) < r && Math.abs(lz) < r) {
          yard = 1;
          // a kitchen garden in the back corner of some lots
          if (kind !== 'church' && kind !== 'barn' && lz < -7 && lx > 1 && hash2(Math.round(bx), Math.round(bz), 50) < 0.6) col = lerpC(GARDEN, [110, 150, 70], (Math.floor(lx * 1.2) & 1) * 0.5);
          else col = lerpC(YARD, col, 0.35);
        }
      }
    }
    const g = gorgeAt(x, z);
    if (g && g.t > 10 && g.d < 34) { rock = smooth(34, 22, g.d); col = lerpC(col, ROCK, rock); }
    const st = nearestStreet(x, z);
    if (st.d < 1.5) { road = smooth(1.5, 0, st.d); col = lerpC(col, st.d > 0 ? DIRT_EDGE : DIRT, road); }
    const p = (j * TOWN.pw + i) * 4;
    tp.data[p] = col[0]; tp.data[p + 1] = col[1]; tp.data[p + 2] = col[2]; tp.data[p + 3] = 255;
    tm.data[p] = road * 255; tm.data[p + 1] = yard * 255; tm.data[p + 2] = rock * 255; tm.data[p + 3] = 255;
  }
  fs.writeFileSync(path.join(OUT, 'town-paint.png'), PNG.sync.write(tp));
  fs.writeFileSync(path.join(OUT, 'town-masks.png'), PNG.sync.write(tm));
  fs.writeFileSync(path.join(OUT, 'town-height.bin'), Buffer.from(townHeight.buffer));
  fs.writeFileSync(path.join(OUT, 'town-water.bin'), Buffer.from(townWater.buffer));
}
log(`town inset ${TOWN.w}x${TOWN.h}, paint ${TOWN.pw}x${TOWN.ph}`);

// ---- the cart road from the mill yard down to the main wharf, along the old streets
const cartPath = (() => {
  const nodes = [], edges = new Map();
  const nodeOf = ([x, z]) => {
    let k = nodes.findIndex(([nx, nz]) => Math.hypot(nx - x, nz - z) < 4);
    if (k < 0) { k = nodes.push([x, z]) - 1; edges.set(k, []); }
    return k;
  };
  for (const st of streets) for (let k = 0; k + 1 < st.pts.length; k++) {
    const a = nodeOf(st.pts[k]), b = nodeOf(st.pts[k + 1]);
    const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
    edges.get(a).push([b, d]); edges.get(b).push([a, d]);
  }
  const m = structures.mill, w = structures.wharf;
  const millYard = [m.x + Math.sin((63 * Math.PI) / 180) * 50, m.z - Math.cos((63 * Math.PI) / 180) * 50]; // the east end
  const wharfRoot = [w.x, w.z];
  const wharfEnd = [w.x + Math.sin(w.rot) * (w.length * 0.8), w.z + Math.cos(w.rot) * (w.length * 0.8)];
  const nearest = ([x, z]) => nodes.reduce((b, n, k) => (Math.hypot(n[0] - x, n[1] - z) < Math.hypot(nodes[b][0] - x, nodes[b][1] - z) ? k : b), 0);
  const s0 = nearest(millYard), s1 = nearest(wharfRoot);
  const dist = new Map([[s0, 0]]), prev = new Map(), open = new Set([s0]);
  while (open.size) {
    let c = null;
    for (const o of open) if (c === null || dist.get(o) < dist.get(c)) c = o;
    open.delete(c);
    if (c === s1) break;
    for (const [n, d] of edges.get(c)) {
      const nd = dist.get(c) + d;
      if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); prev.set(n, c); open.add(n); }
    }
  }
  const pathNodes = [];
  for (let c = s1; c !== undefined; c = prev.get(c)) pathNodes.unshift(nodes[c]);
  return [millYard, ...pathNodes, wharfRoot, wharfEnd];
})();
log(`cart road: ${cartPath.length} points`);


// ---------------------------------------------------------------- trees

// buildings in a coarse grid, so each tree can check its neighbours quickly
const BH = 50, bGrid = new Map();
for (const [, bx, bz] of buildings) { const k = `${Math.floor(bx / BH)},${Math.floor(bz / BH)}`; if (!bGrid.has(k)) bGrid.set(k, []); bGrid.get(k).push([bx, bz]); }
for (const t of taken) { const k = `${Math.floor(t[0] / BH)},${Math.floor(t[1] / BH)}`; if (!bGrid.has(k)) bGrid.set(k, []); bGrid.get(k).push([t[0], t[1], t[2]]); }
function nearBuilding(x, z, r) {
  const i = Math.floor(x / BH), j = Math.floor(z / BH);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const [bx, bz, br = 0] of bGrid.get(`${i + di},${j + dj}`) || []) if (Math.hypot(x - bx, z - bz) < r + br) return true;
  return false;
}
const trees = [];
for (let j = 0; j * TREE_SPACING < ZMAX - ZMIN; j++) for (let i = 0; i * TREE_SPACING < XMAX - XMIN; i++) {
  const x = XMIN + (i + 0.15 + 0.7 * hash2(i, j, 31)) * TREE_SPACING, z = ZMIN + (j + 0.15 + 0.7 * hash2(i, j, 32)) * TREE_SPACING;
  if (!inGrid(x, z)) continue;
  const c = cellOf(x, z);
  if (sea[c] || waterId[c]) continue;
  const ds = toM(seaT.d2[c]), dw = toM(inlandT.d2[c]);
  if (ds < 30 || dw < 22) continue;
  const r = nearestRiver(x, z);
  if (r && r.d < 14) continue;
  if (nearBuilding(x, z, 16)) continue;
  if (Math.hypot(x - toX(-66.8255), z - toZ(45.1640)) < 60) continue; // the quarry floor (Map 3, No. 10)
  const gz = gorgeAt(x, z);
  if (gz && gz.d < GORGE_HALF + 4) continue;
  if (inTown(x, z) && nearestStreet(x, z).d < 5) continue;
  const pi = clamp(Math.floor((x - XMIN) / PAINT), 0, PW - 1), pj = clamp(Math.floor((z - ZMIN) / PAINT), 0, PH - 1);
  const clear = coverClear[pj * PW + pi], sl = demSlopeAt(x, z), roll = hash2(i, j, 33);
  const g = ledges(x, z, graniteBelt(x, z), sl) > 0.5;
  let p = (1 - clear) * 0.93;
  if (wet[c]) p *= 0.25;
  if (g) p *= 0.3;
  if (sl > 0.3) p *= 0.4;
  const lot = fieldAt(x, z), paintIdx = (px, pz) => clamp(Math.floor((pz - ZMIN) / PAINT), 0, PH - 1) * PW + clamp(Math.floor((px - XMIN) / PAINT), 0, PW - 1);
  const isField = farmAt[paintIdx(lot.cx, lot.cz)] > Math.max(0.58, lot.open) && farmAt[paintIdx(x, z)] > 0.3;
  if (isField) p = lot.edge ? 0.3 : 0; // open fields; a few trees on the lot lines
  p *= smooth(200, 650, Math.hypot(x - townCentre[0], z - townCentre[1])) * 0.85 + 0.15; // the town core is mostly cleared
  if (roll > p) continue;
  const s = hash2(i, j, 34);
  // 0 spruce, 1 fir, 2 white pine, 3 maple, 4 birch
  let type;
  if (ds < 500) type = s < 0.6 ? 0 : s < 0.82 ? 1 : s < 0.9 ? 2 : 4;
  else if (g) type = s < 0.6 ? 2 : 0;
  else type = s < 0.36 ? 0 : s < 0.5 ? 1 : s < 0.6 ? 2 : s < 0.85 ? 3 : 4;
  trees.push([x, z, surfaceAt(x, z), type, Math.floor(hash2(i, j, 35) * 255)]);
}
{
  const n = trees.length, buf = Buffer.alloc(4 + n * 12 + n * 2);
  buf.writeUInt32LE(n, 0);
  trees.forEach(([x, z, h], k) => { buf.writeFloatLE(x, 4 + k * 12); buf.writeFloatLE(z, 8 + k * 12); buf.writeFloatLE(h, 12 + k * 12); });
  trees.forEach(([, , , t, s], k) => { buf[4 + n * 12 + k * 2] = t; buf[5 + n * 12 + k * 2] = s; });
  fs.writeFileSync(path.join(OUT, 'trees.bin'), buf);
}
log(`trees: ${trees.length}`);

// ---------------------------------------------------------------- the granite route (preview)

// Schooner leg: shortest deep-water path through the sea mask, St. George Basin -> Letete Passage.
function seaPath(from, to) {
  const snap = (c) => (sea[c] ? c : seaT.near[c]);
  const s0 = snap(cellOf(from[0], from[1])), s1 = snap(cellOf(to[0], to[1]));
  const dist = new Float64Array(FN).fill(Infinity), prev = new Int32Array(FN).fill(-1);
  const heap = [[0, s0]]; dist[s0] = 0;
  const push = (item) => { heap.push(item); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [d, c] = pop();
    if (c === s1) break;
    if (d > dist[c]) continue;
    const i = c % FW, j = (c - i) / FW;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= FW || jj >= FH) continue;
      const n = jj * FW + ii;
      if (!sea[n]) continue;
      const shore = toM(landT.d2[n]);
      const nd = d + Math.hypot(di, dj) * (1 + 6 / (1 + shore / 40));
      if (nd < dist[n]) { dist[n] = nd; prev[n] = c; push([nd, n]); }
    }
  }
  const out = [];
  if (!Number.isFinite(dist[s1])) {
    let n = 0, lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (let c = 0; c < FN; c++) if (Number.isFinite(dist[c])) { n++; const i = c % FW, j = (c - i) / FW; lo = [Math.min(lo[0], i), Math.min(lo[1], j)]; hi = [Math.max(hi[0], i), Math.max(hi[1], j)]; }
    const ll = ([i, j]) => [(ORIGIN.lat - (ZMIN + j * FINE) / M_LAT).toFixed(4), (ORIGIN.lon + (XMIN + i * FINE) / M_LON).toFixed(4)];
    throw new Error(`no sea path: reached ${n} cells, ${ll(lo)} .. ${ll(hi)}; start ${ll([s0 % FW, Math.floor(s0 / FW)])} end ${ll([s1 % FW, Math.floor(s1 / FW)])}`);
  }
  for (let c = s1; c >= 0; c = prev[c]) { const i = c % FW, j = (c - i) / FW; out.push([XMIN + (i + 0.5) * FINE, ZMIN + (j + 0.5) * FINE]); }
  return out.reverse();
}
function simplify(pts, step) { const out = [pts[0]]; for (const p of pts) if (Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) >= step) out.push(p); out.push(pts[pts.length - 1]); return out; }
function chaikin(pts, n) { for (let r = 0; r < n; r++) { const o = [pts[0]]; for (let k = 0; k + 1 < pts.length; k++) { const [a, b] = [pts[k], pts[k + 1]]; o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } o.push(pts[pts.length - 1]); pts = o; } return pts; }

// Scow leg follows the rivers themselves: along The Canal, then down the Magaguadavic to the falls.
const canal = rivers.find((r) => r.name === 'The Canal');
const quarryBoF = [toX(-66.8255), toZ(45.1640)]; // Map 3, No. 10 "Old Bay of Fundy" (approx.)
let falls = null, scow = [];
{
  // OSM splits the river into several ways: chain them head to tail.
  const parts = magaguadavic.slice();
  let main = parts.sort((a, b) => b.pts.length - a.pts.length).shift();
  main = { pts: main.pts.slice(), state: main.state.slice() };
  for (let grew = true; grew;) {
    grew = false;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k], near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 30;
      if (near(p.pts[p.pts.length - 1], main.pts[0])) { main.pts.unshift(...p.pts); main.state.unshift(...p.state); }
      else if (near(main.pts[main.pts.length - 1], p.pts[0])) { main.pts.push(...p.pts); main.state.push(...p.state); }
      else continue;
      parts.splice(k, 1); grew = true; break;
    }
  }
  let fk = main.state.indexOf('sea');
  if (fk < 0) fk = main.state.length - 1;
  log(`Magaguadavic chain: ${main.pts.length} pts, first sea at ${fk}`);
  falls = main.pts[fk];
  if (canal) {
    let k0 = 0, best = Infinity;
    canal.pts.forEach((p, k) => { const d = Math.hypot(p[0] - quarryBoF[0], p[1] - quarryBoF[1]); if (d < best) { best = d; k0 = k; } });
    const leg1 = canal.pts.slice(k0);
    const end = leg1[leg1.length - 1];
    let m0 = 0; best = Infinity;
    main.pts.forEach((p, k) => { const d = Math.hypot(p[0] - end[0], p[1] - end[1]); if (k < fk && d < best) { best = d; m0 = k; } });
    scow = simplify([quarryBoF, ...leg1, ...main.pts.slice(m0, fk + 1)], 25);
  }
}
const basin = [falls[0] + 150, falls[1] + 60]; // St. George Basin, below the gorge
{ // the quarry face north of the canal, cut into the slope and facing downhill toward the landing
  const [qx, qz] = quarryBoF;
  const gx = heightAt(qx + 30, qz) - heightAt(qx - 30, qz), gz = heightAt(qx, qz + 30) - heightAt(qx, qz - 30);
  structures.quarry = { x: qx, z: qz, rot: Math.atan2(-gx, -gz), landing: scow[1] };
}
const letetePassage = [toX(-66.9080), toZ(45.0455)];
let schooner = [];
try { schooner = chaikin(simplify(seaPath(basin, letetePassage), 120), 3); } catch (err) { console.warn('WARNING', err.message); }
log(`route: scow ${scow.length} pts, schooner ${schooner.length} pts`);

// ---------------------------------------------------------------- write

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
fs.writeFileSync(path.join(OUT, 'height.bin'), Buffer.from(height.buffer));
fs.writeFileSync(path.join(OUT, 'water.bin'), Buffer.from(waterMesh.buffer));
const meta = {
  built: new Date().toISOString(),
  bbox: BBOX, origin: ORIGIN, mPerDegLat: M_LAT, mPerDegLon: M_LON,
  extent: { xmin: XMIN, xmax: XMAX, zmin: ZMIN, zmax: ZMAX },
  mesh: { w: MW, h: MH, cell: CELL }, paint: { w: PW, h: PH, cell: PAINT },
  highWater: HIGH_WATER,
  lakes: waterPolys.map((p, k) => ({ name: p.name, kind: p.kind, level: round(levelOf[k]) })).filter((l) => l.name && l.kind === 'lake' && !Number.isNaN(l.level)),
  rivers: rivers.filter((r) => r.state.includes('land')).map((r) => ({
    name: r.name, kind: r.kind, width: r.width,
    pts: r.pts.map(([x, z], k) => [round(x), round(z), round(r.surf[k], 2), r.state[k] === 'land' ? 1 : 0]),
  })),
  falls: falls.map((v) => round(v)),
  anchors: (() => {
    const cellXZ = (c) => { const i = c % FW, j = (c - i) / FW; return [round(XMIN + (i + 0.5) * FINE), round(ZMIN + (j + 0.5) * FINE)]; };
    const shoreOf = (lat, lon) => cellXZ(seaT.near[cellOf(toX(lon), toZ(lat))]);
    return {
      falls: falls.map((v) => round(v)),
      basin: cellXZ(sea[cellOf(basin[0], basin[1])] ? cellOf(basin[0], basin[1]) : seaT.near[cellOf(basin[0], basin[1])]),
      redStore: shoreOf(45.1284, -66.8673),
      quarryBoF: quarryBoF.map((v) => round(v)),
      letetePassage: letetePassage.map((v) => round(v)),
    };
  })(),
  route: {
    scow: scow.map(([x, z]) => [round(x), round(z)]),
    schooner: schooner.map(([x, z]) => [round(x), round(z)]),
    cart: cartPath.map(([x, z]) => [round(x), round(z)]),
  },
  trees: trees.length,
  town: { x0: TOWN.x0, z0: TOWN.z0, x1: TOWN.x1, z1: TOWN.z1, w: TOWN.w, h: TOWN.h, cell: TOWN_CELL, pw: TOWN.pw, ph: TOWN.ph, paintCell: TOWN_PAINT },
  gorge: gorge.filter((_, k) => k % 2 === 0 || k === gorge.length - 1).map(([x, z, t]) => [round(x), round(z), round(gorgeSurf(t), 2)]),
  structures: JSON.parse(JSON.stringify(structures, (k, v) => (typeof v === 'number' ? round(v, 3) : v))),
  streets: streets.map((s) => ({ name: s.name, half: s.half, bridge: s.bridge, pts: s.pts.map(([x, z]) => [round(x), round(z)]) })),
  buildings,
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
log(`wrote ${OUT}`);

// ---------------------------------------------------------------- preview (hillshaded paint, water tinted)

{
  const png = new PNG({ width: PW, height: PH });
  for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
    const x = XMIN + (i + 0.5) * PAINT, z = ZMIN + (j + 0.5) * PAINT, c = cellOf(x, z);
    const p = (j * PW + i) * 4;
    const hx = heightAt(x + 20, z) - heightAt(x - 20, z), hz = heightAt(x, z + 20) - heightAt(x, z - 20);
    const shade = clamp(0.85 + (-hx + -hz) * 0.03, 0.45, 1.25);
    let r = paint.data[p] * shade, g = paint.data[p + 1] * shade, b = paint.data[p + 2] * shade;
    const wm = waterMesh[clamp(Math.round((z - ZMIN) / CELL), 0, MH - 1) * MW + clamp(Math.round((x - XMIN) / CELL), 0, MW - 1)];
    const h = heightAt(x, z);
    if (sea[c] && h < 0) { r = mix(r, 40, 0.75); g = mix(g, 110, 0.75); b = mix(b, 170, 0.75); }
    else if (wm > SEA && h < wm) { r = mix(r, 50, 0.8); g = mix(g, 120, 0.8); b = mix(b, 180, 0.8); }
    else { const rv = nearestRiver(x, z); if (rv && rv.d < 0) { r = 60; g = 130; b = 190; } }
    png.data[p] = clamp(r, 0, 255); png.data[p + 1] = clamp(g, 0, 255); png.data[p + 2] = clamp(b, 0, 255); png.data[p + 3] = 255;
  }
  const mark = (pts, rgb) => pts.forEach(([x, z]) => {
    const i = Math.floor((x - XMIN) / PAINT), j = Math.floor((z - ZMIN) / PAINT);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= PW || jj >= PH) continue;
      const p = (jj * PW + ii) * 4; png.data[p] = rgb[0]; png.data[p + 1] = rgb[1]; png.data[p + 2] = rgb[2];
    }
  });
  mark(scow, [255, 60, 200]); mark(schooner, [255, 255, 255]);
  mark([falls, quarryBoF, letetePassage], [255, 0, 0]);
  fs.writeFileSync(path.join(ROOT, 'data', 'preview.png'), PNG.sync.write(png));
  log('preview');
}

// ---------------------------------------------------------------- debug probe: PROBE="lat,lon;lat,lon"
if (process.env.PROBE) for (const q of process.env.PROBE.split(';')) {
  const [lat, lon] = q.split(',').map(Number), x = toX(lon), z = toZ(lat), c = cellOf(x, z);
  const wid = waterId[c];
  console.log(q, { sea: sea[c], wall: wall[c], comp: comp[c], votes: comp[c] >= 0 ? votes[comp[c]] : null, waterId: wid, poly: wid ? waterPolys[wid - 1].name + '/' + waterPolys[wid - 1].kind + '@' + levelOf[wid - 1] : '', dem: demF[c].toFixed(1), ground: heightAt(x, z).toFixed(1) });
  const nc = inlandT.near[c], nw = waterId[nc];
  console.log('   nearest water', toM(inlandT.d2[c]).toFixed(0) + 'm', nw ? waterPolys[nw - 1].name + '/' + waterPolys[nw - 1].kind + ' median ' + levelOf[nw - 1].toFixed(1) : '', 'W', waterSurfF[nc]?.toFixed(1), 'line dist', toM(lineT.d2[nc]).toFixed(0), 'lineSurf', lineSurf[lineT.near[nc]]?.toFixed(1));
}
if (process.env.ASCII) { // ASCII="lat,lon,halfCells"
  const [lat, lon, r] = process.env.ASCII.split(',').map(Number), c0 = cellOf(toX(lon), toZ(lat)), i0 = c0 % FW, j0 = (c0 - i0) / FW;
  for (let j = j0 - r; j <= j0 + r; j++) { let row = ''; for (let i = i0 - r; i <= i0 + r; i++) { const c = j * FW + i; row += sea[c] ? (wall[c] ? 'W' : '~') : waterId[c] ? 'o' : wall[c] ? '#' : '.'; } console.log(row); }
}
