// Ground and clearance checks for the journey's roads in town, against the shipped terrain (no
// WebGL): the loads never drive through a building, the roads have no bumps or pits, and the mill
// stands on level ground. Run after `npm run build:data`. Prints the worst spots it finds.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { load } from './load-stage.mjs';
import { buildJourney } from '../src/journey.js';

const data = await load();
const { meta } = data, S = meta.structures;
const prop = () => { const o = new THREE.Group(); o.userData.setSails = () => {}; return o; };
const world = { exag: 2, tide: 0, toon: null, props: Object.fromEntries(['block', 'column', 'scow', 'wagon', 'schooner'].map((k) => [k, prop])) };
const journey = buildJourney({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), controls: { target: new THREE.Vector3() }, data, world, setTide: () => {} });
const problems = [];
const fail = (msg) => problems.push(msg);

// footprints: [centre x, z, rotation, half width, half depth, name]
const SIZE = { house: [4, 5.3], cape: [4.3, 3.8], store: [4.5, 7], barn: [5.3, 8], church: [5.5, 13] };
const boxes = meta.buildings.filter(([, x, z]) => data.inTown(x, z)).map(([k, x, z, rot]) => [x, z, rot, ...(SIZE[k] ?? [5, 5]), k]);
boxes.push([S.mill.x, S.mill.z, S.mill.rot, S.mill.width / 2, S.mill.length / 2, 'mill'], [S.mill.x - Math.cos(S.mill.rot) * 15 + Math.sin(S.mill.rot) * 10.6, S.mill.z + Math.sin(S.mill.rot) * 15 + Math.cos(S.mill.rot) * 10.6, S.mill.rot, 6, 24.2, 'mill wing']);
const inside = ([bx, bz, rot, hw, hd], x, z, pad) => {
  const lx = (x - bx) * Math.cos(rot) - (z - bz) * Math.sin(rot), lz = (x - bx) * Math.sin(rot) + (z - bz) * Math.cos(rot);
  return Math.abs(lx) < hw + pad && Math.abs(lz) < hd + pad;
};

// a road the loads travel: sample it, check clearance (a vehicle is ~1.3 m each side of its line)
// and its running profile: grade, and bumps (a change of grade within a wagon's length)
const W = S.wharf, wd = [Math.sin(W.rot), Math.cos(W.rot)];
const onWharf = (x, z) => { const a = (x - W.x) * wd[0] + (z - W.z) * wd[1], c = (x - W.x) * wd[1] - (z - W.z) * wd[0]; return a > -3 && a < W.length + 1 && Math.abs(c) < W.width / 2 + 1; };
function road(name, path, { until = 1, maxGrade = 0.2, maxBump = 0.06, allowInside = null } = {}) {
  const n = Math.ceil(path.length * until / 1), ys = [], pts = [];
  for (let q = 0; q <= n; q++) { const p = path.at((q / n) * until); pts.push(p); ys.push(data.heightAt(p.x, p.z)); }
  let worstGrade = 0, worstBump = 0, gradeAt = null, bumpAt = null;
  for (let q = 0; q <= n; q++) {
    const p = pts[q];
    for (const b of boxes) if (inside(b, p.x, p.z, 1.3) && !(allowInside?.(b, q / n))) { fail(`${name}: drives through a ${b[5]} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`); break; }
    if (q >= 4 && q <= n - 4 && !Number.isFinite(data.inlandWaterAt(p.x, p.z)) && !data.isSea(p.x, p.z) && !onWharf(p.x, p.z)) {
      const g = Math.abs(ys[q + 2] - ys[q - 2]) / 4, bump = Math.abs(ys[q + 4] - 2 * ys[q] + ys[q - 4]) / 16; // over a wagon's length
      if (g > worstGrade) { worstGrade = g; gradeAt = p; }
      if (bump > worstBump) { worstBump = bump; bumpAt = p; }
    }
  }
  const where = (p) => (p ? ` at ${p.x.toFixed(0)},${p.z.toFixed(0)}` : '');
  console.log(`${name}: ${path.length.toFixed(0)} m, steepest ${(worstGrade * 100).toFixed(1)}%${where(gradeAt)}, worst bump ${(worstBump * 100).toFixed(2)}%/m${where(bumpAt)}`);
  if (worstGrade > maxGrade) fail(`${name}: grade ${(worstGrade * 100).toFixed(1)}% > ${maxGrade * 100}%`);
  if (worstBump > maxBump) fail(`${name}: bump ${(worstBump * 100).toFixed(2)}%/m > ${maxBump * 100}%/m`);
}
// the truck goes in at the side door: the last few metres are inside the mill on purpose
road('the haul from the landing', journey.paths.truck, { maxGrade: 0.1, allowInside: (b, u) => b[5] === 'mill' && u > 0.93 });
// the town's ground is a 10 m grid, so a road laid at 7% still shows a steeper facet or two where
// it turns or leaves a pad: these limits are for what a wagon actually drives over
road('the cart road to the wharf', journey.paths.cart, { maxGrade: 0.12 });

// the mill and its yard are level (drawn heights are the survey's x exag; a metre here is two there)
const ax = Math.sin(S.mill.rot), az = Math.cos(S.mill.rot), px = az, pz = -ax;
let lo = Infinity, hi = -Infinity, loAt = null, hiAt = null;
// [along from, to, across from, to] in the mill's frame: the floor from the end of its stone
// basement (the west end stands out over the falls on purpose), the wing, the north and east yards
for (const [a0, a1, c0, c1] of [[-24, 44, -9, 9], [-13, 35, -21, -9], [-24, 48, 9, 21], [44, 50, -9, 9]]) {
  for (let a = a0; a <= a1; a += 1) for (let c = c0; c <= c1; c += 1) {
    const h = data.heightAt(S.mill.x + ax * a + px * c, S.mill.z + az * a + pz * c);
    if (h < lo) { lo = h; loAt = [a, c]; }
    if (h > hi) { hi = h; hiAt = [a, c]; }
  }
}
console.log(`mill pad: ${lo.toFixed(2)}-${hi.toFixed(2)} m (floor ${S.mill.level}); lowest at along ${loAt[0]}, across ${loAt[1]}, highest at ${hiAt[0]}, ${hiAt[1]}`);
if (hi - lo > 0.6 || Math.abs(hi - S.mill.level) > 0.5 || Math.abs(lo - S.mill.level) > 0.5) fail(`mill pad is not level: ${lo.toFixed(2)}-${hi.toFixed(2)} m`);

// nothing stands in a street: no building's walls, and none of a shop's front (its awning posts,
// hitching rail, barrels) out in the street round the corner from the one it faces
const segs = [...meta.streets.filter((st) => !st.bridge), ...(meta.roads ?? [])].flatMap((st) => st.pts.slice(1).map((p, k) => [st.pts[k], p, st.half, st.name]));
const streetEdge = (x, z, skip) => {
  let best = [Infinity, ''];
  for (const [[x0, z0], [x1, z1], h, name] of segs) {
    if (name === skip || Math.min(x0, x1) - 40 > x || Math.max(x0, x1) + 40 < x || Math.min(z0, z1) - 40 > z || Math.max(z0, z1) + 40 < z) continue;
    const dx = x1 - x0, dz = z1 - z0, f = Math.min(Math.max(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1), 0), 1);
    const d = Math.hypot(x - x0 - f * dx, z - z0 - f * dz) - h;
    if (d < best[0]) best = [d, name];
  }
  return best;
};
const world2 = (x, z, rot, lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
let inStreet = 0;
for (const [x, z, rot, hw, hd, kind] of boxes) {
  if (kind.startsWith('mill')) continue;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const [d, name] = streetEdge(...world2(x, z, rot, a * hw, b * hd));
    if (d < 0) { fail(`a ${kind} at ${x.toFixed(0)},${z.toFixed(0)} stands ${(-d).toFixed(1)} m into ${name}`); inStreet++; break; }
  }
}
meta.buildings.filter(([k, x, z]) => k === 'store' && data.inTown(x, z)).forEach(([, x, z, rot, v], k) => {
  const own = streetEdge(...world2(x, z, rot, 0, 12))[1]; // the street it faces
  const front = [[-4.3, 9.9], [4.3, 9.9], [3, 7.9], [-2.4, 7.9], ...(k % 3 === 0 ? [[-1.9, 11.2], [1.9, 11.2]] : [])];
  for (const [lx, lz] of front) {
    const [d, name] = streetEdge(...world2(x, z, rot, lx, lz), own);
    if (d < 0.3) { fail(`the shop at ${x.toFixed(0)},${z.toFixed(0)} (on ${own}) has its front out in ${name}`); break; }
  }
});
console.log(`buildings in streets: ${inStreet}`);

for (const p of problems) console.log('  x', p);
assert.equal(problems.length, 0, `${problems.length} town problems`);
console.log('Town checks passed.');
