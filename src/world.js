// The landscape itself: board, ground, water, trees, sky, clouds and the route preview.
//
// Units are metres. Heights are drawn with a vertical exaggeration: everything that sits on the
// ground lives in `ground` (scaled on y), and things that must keep their shape (trees, route,
// labels) are placed at `heightAt(x, z) * exag` in plain world space.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildStructures, makeProps } from './structures.js';

const SEABED_FLOOR = -60;
const BASE = -80;

export function buildWorld(data, { scene, quality = 'medium', exag = 2.5 }) {
  const { meta, height, water, paint, masks, town } = data;
  const T = meta.town;
  const townRect = new THREE.Vector4(T.x0, T.z0, T.x1, T.z1);
  const { w: MW, h: MH, cell } = meta.mesh;
  const { xmin, xmax, zmin, zmax } = meta.extent;
  const stride = quality === 'low' ? 2 : 1;

  const ground = new THREE.Group();
  ground.name = 'ground';
  ground.scale.y = exag;
  scene.add(ground);

  const clock = { t: 0 };
  const waterUniforms = [];

  // ------------------------------------------------------------------ ground

  paint.flipY = false;
  paint.colorSpace = THREE.SRGBColorSpace;
  paint.anisotropy = 8;
  const toon = toonRamp();

  const nx = Math.floor((MW - 1) / stride) + 1, nz = Math.floor((MH - 1) / stride) + 1;
  const hAt = (i, j) => Math.max(height[j * MW + i], SEABED_FLOOR);
  {
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const pw = meta.paint.w * meta.paint.cell, ph = meta.paint.h * meta.paint.cell;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = xmin + i * stride * cell, z = zmin + j * stride * cell;
      pos[k * 3] = x; pos[k * 3 + 1] = hAt(i * stride, j * stride); pos[k * 3 + 2] = z;
      uv[k * 2] = (x - xmin) / pw; uv[k * 2 + 1] = (z - zmin) / ph;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if ((i + j) & 1) { idx.set([a, c, b, b, c, d], q); } else { idx.set([a, c, d, a, d, b], q); }
      q += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const paintExt = new THREE.Vector4(xmin, zmin, 1 / pw, 1 / ph);
    const terrain = new THREE.Mesh(g, groundMaterial(paint, masks, paintExt, { hole: townRect }));
    terrain.name = 'terrain';
    ground.add(terrain);

    // The town around the falls at 10 m, drawn in the hole left in the ground above.
    const tpos = new Float32Array(town.nx * town.nz * 3), tuv = new Float32Array(town.nx * town.nz * 2);
    const tpw = T.pw * T.paintCell, tph = T.ph * T.paintCell;
    for (let j = 0; j < town.nz; j++) for (let i = 0; i < town.nx; i++) {
      const k = j * town.nx + i, x = T.x0 + i * T.cell, z = T.z0 + j * T.cell;
      tpos[k * 3] = x; tpos[k * 3 + 1] = town.h[k]; tpos[k * 3 + 2] = z;
      tuv[k * 2] = (x - T.x0) / tpw; tuv[k * 2 + 1] = (z - T.z0) / tph;
    }
    const tidx = new Uint32Array((town.nx - 1) * (town.nz - 1) * 6);
    q = 0;
    for (let j = 0; j < town.nz - 1; j++) for (let i = 0; i < town.nx - 1; i++) {
      const a = j * town.nx + i, b = a + 1, c = a + town.nx, d = c + 1;
      tidx.set((i + j) & 1 ? [a, c, b, b, c, d] : [a, c, d, a, d, b], q);
      q += 6;
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
    tg.setIndex(new THREE.BufferAttribute(tidx, 1));
    tg.computeVertexNormals();
    data.townPaint.flipY = false;
    data.townPaint.colorSpace = THREE.SRGBColorSpace;
    data.townPaint.anisotropy = 8;
    const townGround = new THREE.Mesh(tg, groundMaterial(data.townPaint, masks, paintExt, { townMasks: data.townMasks }));
    townGround.name = 'town-ground';
    ground.add(townGround);
  }

  // The board's cut edges, like a cake: topsoil, subsoil, red granite, dark rock.
  {
    const verts = [], cols = [];
    const edge = [];
    for (let i = 0; i < nx; i++) edge.push([i, 0]);
    for (let j = 1; j < nz; j++) edge.push([nx - 1, j]);
    for (let i = nx - 2; i >= 0; i--) edge.push([i, nz - 1]);
    for (let j = nz - 2; j >= 0; j--) edge.push([0, j]);
    const C = {
      soil: new THREE.Color('#5b4630'), sub: new THREE.Color('#8a6a48'), mud: new THREE.Color('#7a6b55'),
      granite: new THREE.Color('#a45e50'), rock: new THREE.Color('#5d5650'),
    };
    const layers = (top) => {
      const under = top < meta.highWater;
      const a = top - (under ? 1.5 : 2.5), b = top - 7, c = Math.min(b - 1, -38);
      return [[top, a, under ? C.mud : C.soil], [a, b, C.sub], [b, c, C.granite], [c, BASE, C.rock]];
    };
    for (let k = 0; k + 1 < edge.length; k++) {
      const [i0, j0] = edge[k], [i1, j1] = edge[k + 1];
      const x0 = xmin + i0 * stride * cell, z0 = zmin + j0 * stride * cell, x1 = xmin + i1 * stride * cell, z1 = zmin + j1 * stride * cell;
      const L0 = layers(hAt(i0 * stride, j0 * stride)), L1 = layers(hAt(i1 * stride, j1 * stride));
      for (let b = 0; b < 4; b++) {
        const [t0, u0, col] = L0[b], [t1, u1] = L1[b];
        if (t0 <= u0 && t1 <= u1) continue;
        verts.push(x0, t0, z0, x0, u0, z0, x1, t1, z1, x1, t1, z1, x0, u0, z0, x1, u1, z1);
        for (let r = 0; r < 6; r++) cols.push(col.r, col.g, col.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const skirt = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon, side: THREE.DoubleSide }));
    skirt.name = 'board-edge';
    ground.add(skirt);

    const pad = 220;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(xmax - xmin + pad * 2, 16, zmax - zmin + pad * 2),
      new THREE.MeshToonMaterial({ color: '#4a3326', gradientMap: toon }),
    );
    board.position.set((xmin + xmax) / 2, BASE - 8, (zmin + zmax) / 2);
    board.name = 'board';
    ground.add(board);
  }

  // ------------------------------------------------------------------ water

  const heightTex = new THREE.DataTexture(height, MW, MH, THREE.RedFormat, THREE.FloatType);
  heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  // 1 where the grid is tidal water, 0 elsewhere: the sea sheet only shows where this is set
  const seaMask = new Uint8Array(MW * MH);
  for (let k = 0; k < MW * MH; k++) seaMask[k] = water[k] === data.SEA ? 255 : 0;
  const seaTex = new THREE.DataTexture(seaMask, MW, MH, THREE.RedFormat, THREE.UnsignedByteType);
  seaTex.minFilter = seaTex.magFilter = THREE.LinearFilter;
  seaTex.needsUpdate = true;
  const extent = new THREE.Vector4(xmin, zmin, 1 / (cell * MW), 1 / (cell * MH));
  const half = new THREE.Vector2(0.5 / MW, 0.5 / MH);
  // the same two lookups for the 10 m town grid
  const townHeightTex = new THREE.DataTexture(town.h, town.nx, town.nz, THREE.RedFormat, THREE.FloatType);
  townHeightTex.minFilter = townHeightTex.magFilter = THREE.LinearFilter;
  townHeightTex.needsUpdate = true;
  const townSeaMask = new Uint8Array(town.nx * town.nz);
  for (let k = 0; k < townSeaMask.length; k++) townSeaMask[k] = town.w[k] === data.SEA ? 255 : 0;
  const townSeaTex = new THREE.DataTexture(townSeaMask, town.nx, town.nz, THREE.RedFormat, THREE.UnsignedByteType);
  townSeaTex.minFilter = townSeaTex.magFilter = THREE.LinearFilter;
  townSeaTex.needsUpdate = true;
  const townExt = new THREE.Vector4(1 / (T.cell * town.nx), 1 / (T.cell * town.nz), 0.5 / town.nx, 0.5 / town.nz);
  const seaLevel = { value: 1.5 };

  function waterMaterial(kind) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uHeight: { value: heightTex }, uSea: { value: seaTex }, uExt: { value: extent }, uHalf: { value: half },
      uTime: { value: 0 }, uKind: { value: kind === 'sea' ? 0 : kind === 'lake' ? 1 : 2 },
      uShallow: { value: new THREE.Color(kind === 'sea' ? '#6cc3bf' : '#78c2b8') },
      uDeep: { value: new THREE.Color(kind === 'sea' ? '#2f7fb0' : '#3a80a4') },
      uFoam: { value: new THREE.Color('#f4fbff') },
    }]);
    uniforms.uLevel = seaLevel; // shared, so the tide moves every sea surface at once
    uniforms.uHeight.value = heightTex;
    uniforms.uSea.value = seaTex;
    uniforms.uExt.value = extent;
    Object.assign(uniforms, {
      uTownH: { value: townHeightTex }, uTownSea: { value: townSeaTex }, uTownExt: { value: townExt }, uTownRect: { value: townRect },
    });
    const m = new THREE.ShaderMaterial({
      uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS,
      transparent: true, depthWrite: false, fog: true,
      side: kind === 'wall' || kind === 'river' ? THREE.DoubleSide : THREE.FrontSide, // ribbons wind either way
      defines: kind === 'wall' ? { WALL: 1 } : {},
    });
    waterUniforms.push(m.uniforms);
    return m;
  }

  // The sea: one flat sheet the size of the board; the tide raises and lowers it.
  {
    const g = new THREE.PlaneGeometry(xmax - xmin, zmax - zmin, 1, 1).rotateX(-Math.PI / 2);
    g.translate((xmin + xmax) / 2, 0, (zmin + zmax) / 2);
    addWaterAttrs(g);
    const sea = new THREE.Mesh(g, waterMaterial('sea'));
    sea.name = 'sea';
    sea.renderOrder = 2;
    ground.add(sea);
  }
  // The sea's cut edge around the board.
  {
    const pos = [], gnd = [], top = [];
    const sides = [
      [(i) => [xmin + i * stride * cell, zmin], nx, (i) => [i * stride, 0]],
      [(i) => [xmin + i * stride * cell, zmax], nx, (i) => [i * stride, (nz - 1) * stride]],
      [(j) => [xmin, zmin + j * stride * cell], nz, (j) => [0, j * stride]],
      [(j) => [xmax, zmin + j * stride * cell], nz, (j) => [(nx - 1) * stride, j * stride]],
    ];
    for (const [at, n, ij] of sides) for (let k = 0; k + 1 < n; k++) {
      const [x0, z0] = at(k), [x1, z1] = at(k + 1);
      const g0 = hAt(...ij(k)), g1 = hAt(...ij(k + 1));
      if (Math.min(g0, g1) > meta.highWater + 4) continue;
      const quad = [[x0, z0, g0, 1], [x0, z0, g0, 0], [x1, z1, g1, 1], [x1, z1, g1, 1], [x0, z0, g0, 0], [x1, z1, g1, 0]];
      for (const [x, z, h, t] of quad) { pos.push(x, 0, z); gnd.push(h); top.push(t); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('ground', new THREE.Float32BufferAttribute(gnd, 1));
    g.setAttribute('top', new THREE.Float32BufferAttribute(top, 1));
    addWaterAttrs(g);
    const wall = new THREE.Mesh(g, waterMaterial('wall'));
    wall.name = 'sea-edge';
    wall.renderOrder = 3;
    ground.add(wall);
  }

  // Lakes and the wider rivers: flat quads on the grid wherever the build found inland water.
  {
    const pos = [], lvl = [];
    const quads = (g, x0g, z0g, step, skip) => {
      for (let j = 0; j + step < g.nz; j += step) for (let i = 0; i + step < g.nx; i += step) {
        const x0 = x0g + i * g.cell, x1 = x0 + step * g.cell, z0 = z0g + j * g.cell, z1 = z0 + step * g.cell;
        if (skip(x0, z0, x1, z1)) continue;
        const k = [j * g.nx + i, j * g.nx + i + step, (j + step) * g.nx + i, (j + step) * g.nx + i + step];
        const w = k.map((q) => (g.w[q] === data.SEA ? NaN : g.w[q]));
        const have = w.filter((v) => !Number.isNaN(v));
        if (!have.length) continue;
        const avg = have.reduce((a, b) => a + b, 0) / have.length;
        const W = w.map((v) => (Number.isNaN(v) ? avg : v));
        pos.push(x0, W[0], z0, x0, W[2], z1, x1, W[1], z0, x1, W[1], z0, x0, W[2], z1, x1, W[3], z1);
        lvl.push(W[0], W[2], W[1], W[1], W[2], W[3]);
      }
    };
    const insideTown = (x0, z0, x1, z1) => x0 >= T.x0 && x1 <= T.x1 && z0 >= T.z0 && z1 <= T.z1;
    quads(data.main, xmin, zmin, stride, insideTown);
    quads(town, T.x0, T.z0, 1, () => false);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    addWaterAttrs(g, lvl);
    const lakes = new THREE.Mesh(g, waterMaterial('lake'));
    lakes.name = 'lakes';
    lakes.renderOrder = 1;
    ground.add(lakes);
  }

  // Streams and small rivers as ribbons, following the build's downhill water surface.
  {
    const pos = [], lvl = [], flow = [], rapid = [];
    for (const r of meta.rivers) {
      const P = r.pts;
      // runs of open river, plus one point either side so ribbons tuck into lakes and the sea
      let k = 0;
      while (k < P.length) {
        while (k < P.length && !P[k][3]) k++;
        if (k >= P.length) break;
        let e = k;
        while (e < P.length && P[e][3]) e++;
        const run = P.slice(Math.max(0, k - 1), Math.min(P.length, e + 1));
        k = e;
        if (run.length < 2) continue;
        const width = Math.max(r.width, 12);
        let dist = 0;
        const L = [], R = [];
        for (let q = 0; q < run.length; q++) {
          const a = run[Math.max(0, q - 1)], b = run[Math.min(run.length - 1, q + 1)];
          let tx = b[0] - a[0], tz = b[1] - a[1];
          const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
          if (q) dist += Math.hypot(run[q][0] - run[q - 1][0], run[q][1] - run[q - 1][1]);
          const drop = (a[2] - b[2]) / len;
          const s = run[q][2] + 0.05;
          L.push([run[q][0] - tz * width / 2, s, run[q][1] + tx * width / 2, dist, drop]);
          R.push([run[q][0] + tz * width / 2, s, run[q][1] - tx * width / 2, dist, drop]);
        }
        for (let q = 0; q + 1 < run.length; q++) {
          for (const v of [L[q], R[q], L[q + 1], L[q + 1], R[q], R[q + 1]]) {
            pos.push(v[0], v[1], v[2]); lvl.push(v[1]); flow.push(v[3]); rapid.push(smoothstep(0.03, 0.12, v[4]));
          }
        }
      }
    }
    // Magaguadavic Falls: white water down the Gorge, from the dam to the lower bridge.
    {
      const G = meta.gorge;
      const width = 24;
      let dist = 0;
      const side = G.map((p, q) => {
        const a = G[Math.max(0, q - 1)], b = G[Math.min(G.length - 1, q + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
        if (q) dist += Math.hypot(p[0] - G[q - 1][0], p[1] - G[q - 1][1]);
        const drop = Math.max(0, (a[2] - b[2]) / len);
        const w = width * (q === 0 ? 1.6 : 1);
        return [[p[0] - tz * w / 2, p[2] + 0.1, p[1] + tx * w / 2], [p[0] + tz * w / 2, p[2] + 0.1, p[1] - tx * w / 2], dist, 0.45 + smoothstep(0.01, 0.06, drop)];
      });
      for (let q = 0; q + 1 < side.length; q++) {
        const [L0, R0, d0, r0] = side[q], [L1, R1, d1, r1] = side[q + 1];
        for (const [v, d, r] of [[L0, d0, r0], [R0, d0, r0], [L1, d1, r1], [L1, d1, r1], [R0, d0, r0], [R1, d1, r1]]) {
          pos.push(...v); lvl.push(v[1]); flow.push(d); rapid.push(Math.min(1, r));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    addWaterAttrs(g, lvl, flow, rapid);
    const rivers = new THREE.Mesh(g, waterMaterial('river'));
    rivers.name = 'rivers';
    rivers.renderOrder = 1;
    ground.add(rivers);
  }

  // ------------------------------------------------------------------ trees

  const trees = buildTrees(data, toon);
  scene.add(trees.group);

  // ------------------------------------------------------------------ sky and clouds

  const sky = new THREE.Mesh(new THREE.SphereGeometry(90000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color('#5f9fd4') }, uHorizon: { value: new THREE.Color('#d9ecf2') }, uBelow: { value: new THREE.Color('#b7cdd2') } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop, uHorizon, uBelow; varying vec3 vDir; void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.7, h), 0.8)) : mix(uHorizon, uBelow, smoothstep(0.0, -0.3, h)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
  }));
  sky.name = 'sky';
  sky.renderOrder = -1;
  scene.add(sky);

  const clouds = buildClouds(meta, toon);
  scene.add(clouds);

  // ------------------------------------------------------------------ route preview

  const route = new THREE.Group();
  route.name = 'route';
  route.visible = false;
  scene.add(route);
  const routeMats = [];
  function buildRoute() {
    for (const m of route.children) { m.geometry.dispose(); m.material.dispose(); }
    route.clear();
    const ex = ground.scale.y;
    const legs = [
      { pts: meta.route.scow, color: '#d0533b', lift: 6, level: (x, z) => { const w = data.inlandWaterAt(x, z); return Number.isNaN(w) ? data.heightAt(x, z) : w; } },
      { pts: meta.route.schooner, color: '#fff6dc', lift: 6, level: (x, z) => Math.max(meta.highWater, data.heightAt(x, z)) },
    ];
    for (const leg of legs) {
      if (leg.pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(leg.pts.map(([x, z]) => new THREE.Vector3(x, (leg.level(x, z) + leg.lift) * ex, z)));
      const n = Math.min(3000, Math.ceil(curve.getLength() / 15));
      const pts = curve.getSpacedPoints(n).flatMap((p) => [p.x, p.y, p.z]);
      // a dark casing under a bright dashed line, a few pixels wide however far away
      for (const [color, width, dashed] of [['#2d2418', 7, false], [leg.color, 4, true]]) {
        const g = new LineGeometry().setPositions(pts);
        // the casing must not write depth, or the dashes drawn on top of it at the same depth lose
        const m = new LineMaterial({ color, linewidth: width, worldUnits: false, dashed, dashSize: 120, gapSize: 70, transparent: true, depthWrite: dashed });
        const line = new Line2(g, m);
        line.computeLineDistances();
        line.renderOrder = dashed ? 6 : 5;
        route.add(line);
        if (dashed) routeMats.push(m);
      }
    }
  }
  buildRoute();

  // ------------------------------------------------------------------ buildings and works

  // world y of the ground, or of a lake or river where there is one (not the tide)
  const surfaceY = (x, z) => {
    const w = data.inlandWaterAt(x, z);
    return Math.max(data.heightAt(x, z), Number.isNaN(w) ? -Infinity : w) * ground.scale.y;
  };
  let structures = null;
  function placeStructures() {
    if (structures) {
      scene.remove(structures);
      structures.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    structures = buildStructures(data, { exag: ground.scale.y, groundY: surfaceY, toon });
    scene.add(structures);
  }
  placeStructures();

  // ------------------------------------------------------------------ controls for the page

  function setExag(e) {
    ground.scale.y = e;
    trees.place(e);
    routeMats.length = 0;
    buildRoute();
    placeStructures();
  }
  trees.place(exag);

  function update(dt) {
    clock.t += dt;
    for (const u of waterUniforms) u.uTime.value = clock.t;
    for (const m of routeMats) m.dashOffset = -clock.t * 160; // marching toward the sea
    clouds.userData.update(dt);
  }

  return {
    ground, trees, clouds, sky, route, toon, surfaceY,
    get structures() { return structures; },
    props: makeProps(toon),
    get exag() { return ground.scale.y; },
    setExag,
    get tide() { return seaLevel.value; },
    setTide(v) { seaLevel.value = v; },
    update,
  };
}

// ------------------------------------------------------------------ trees

function buildTrees(data, toon) {
  const { trees: T } = data;
  const group = new THREE.Group();
  group.name = 'trees';

  // Heights in metres; bumped a little so a forest reads from a long way up.
  const CARTOON = 1.35;
  const kinds = [
    { name: 'spruce', h: 20, geo: spruce() },
    { name: 'fir', h: 17, geo: fir() },
    { name: 'white pine', h: 30, geo: pine() },
    { name: 'maple', h: 19, geo: roundTree('#5c9a3f', 0.36, 0.62) },
    { name: 'birch', h: 16, geo: roundTree('#8cbf52', 0.27, 0.68, '#e8e2d4') },
  ];
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon });

  // Shuffle once so showing only the first N trees thins the forest evenly.
  const order = new Uint32Array(T.n);
  for (let k = 0; k < T.n; k++) order[k] = k;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = T.n - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [order[k], order[r]] = [order[r], order[k]]; }

  const byKind = kinds.map(() => []);
  for (const k of order) byKind[T.info[k * 2]]?.push(k);
  const meshes = kinds.map((kind, t) => {
    const m = new THREE.InstancedMesh(kind.geo, mat, byKind[t].length);
    m.name = `trees:${kind.name}`;
    m.frustumCulled = false;
    const c = new THREE.Color();
    byKind[t].forEach((k, q) => {
      const s = T.info[k * 2 + 1] / 255;
      c.setScalar(0.82 + 0.3 * s);
      m.setColorAt(q, c);
    });
    group.add(m);
    return m;
  });

  let fraction = 1;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function place(exag) {
    kinds.forEach((kind, t) => {
      const m = meshes[t];
      byKind[t].forEach((k, q) => {
        const s = T.info[k * 2 + 1] / 255;
        const size = kind.h * CARTOON * (0.72 + 0.56 * s);
        P.set(T.pos[k * 3], T.pos[k * 3 + 2] * exag - 1.5, T.pos[k * 3 + 1]);
        Q.setFromAxisAngle(Y, s * 40);
        S.set(size * (0.9 + 0.2 * ((s * 7.3) % 1)), size, size * (0.9 + 0.2 * ((s * 3.1) % 1)));
        m.setMatrixAt(q, M.compose(P, Q, S));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
    setFraction(fraction);
  }
  function setFraction(f) {
    fraction = f;
    meshes.forEach((m, t) => { m.count = Math.round(byKind[t].length * f); });
  }
  return { group, place, setFraction, kinds: kinds.map((k) => k.name), count: T.n };
}

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
// Open-ended cones and trunks: nobody sees the undersides, and there are ~100,000 trees.
const trunk = (r, h, color = '#6b4a2e') => colored(new THREE.CylinderGeometry(r * 0.8, r, h, 4, 1, true).translate(0, h / 2, 0), color);
const cone = (r, h, y, color, seg = 6) => colored(new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, y + h / 2, 0), color);
function spruce() {
  return mergeGeometries([trunk(0.05, 0.22), cone(0.36, 0.42, 0.14, '#3a7a48'), cone(0.29, 0.38, 0.38, '#3d804b'), cone(0.2, 0.34, 0.62, '#468c52')]);
}
function fir() {
  return mergeGeometries([trunk(0.04, 0.2), cone(0.27, 0.55, 0.12, '#346e57'), cone(0.19, 0.45, 0.5, '#3a7a5e')]);
}
function pine() {
  const clump = (r, x, y, z, color) => colored(new THREE.IcosahedronGeometry(r, 0).scale(1.3, 0.55, 1.1).translate(x, y, z), color);
  return mergeGeometries([trunk(0.035, 0.82, '#5d4029'),
    clump(0.21, 0.06, 0.86, 0, '#3f6e46'), clump(0.17, -0.12, 0.68, 0.05, '#3a6641'), clump(0.15, 0.14, 0.56, -0.06, '#467a4c')]);
}
function roundTree(color, r, y, bark) {
  return mergeGeometries([trunk(0.045, y - r * 0.3, bark), colored(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.95, 1).translate(0, y, 0), color)]);
}

// ------------------------------------------------------------------ clouds

function buildClouds(meta, toon) {
  const { xmin, xmax, zmin, zmax } = meta.extent;
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toon, transparent: true, opacity: 0.94 });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const span = xmax - xmin + 12000;
  for (let c = 0; c < 8; c++) {
    const parts = [];
    const n = 4 + Math.floor(rnd() * 4), size = 260 + rnd() * 260;
    for (let p = 0; p < n; p++) {
      const r = size * (0.55 + rnd() * 0.5);
      parts.push(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.62, 1).translate((p - n / 2) * size * 0.7 + rnd() * 120, rnd() * 60, (rnd() - 0.5) * size * 0.9));
    }
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.position.set(xmin - 6000 + rnd() * span, 2800 + rnd() * 600, zmin - 2000 + rnd() * (zmax - zmin + 4000));
    m.rotation.y = rnd() * Math.PI;
    group.add(m);
  }
  group.userData.update = (dt) => {
    for (const m of group.children) {
      m.position.x += dt * 18;
      if (m.position.x > xmax + 6000) m.position.x -= span;
    }
  };
  return group;
}

// ------------------------------------------------------------------ ground material

// Smooth-shaded ground coloured by the build's paint. Farm lots, cracked granite ledges and marsh
// reeds are drawn per pixel from masks.png so they stay crisp at any distance. The lot grid,
// hash and centre test match fieldAt() and the tree rule in the build.
const FIELD_COLORS = ['#d6c468', '#c4d06c', '#8cbe56', '#96724c', '#b6b868', '#e2d68c'];
function groundMaterial(paint, masks, paintExt, { hole = null, townMasks = null } = {}) {
  masks.flipY = false;
  masks.colorSpace = THREE.NoColorSpace;
  if (townMasks) { townMasks.flipY = false; townMasks.colorSpace = THREE.NoColorSpace; }
  const m = new THREE.MeshLambertMaterial({ map: paint });
  m.defines = { ...(hole ? { HOLE: 1 } : {}), ...(townMasks ? { TOWN: 1 } : {}) };
  const fields = FIELD_COLORS.map((c) => new THREE.Color(c));
  const hedge = new THREE.Color('#5c7840');
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMasks = { value: masks };
    shader.uniforms.uPaintExt = { value: paintExt };
    shader.uniforms.uHole = { value: hole ?? new THREE.Vector4() };
    shader.uniforms.uTownMasks = { value: townMasks };
    shader.uniforms.uFields = { value: fields };
    shader.uniforms.uHedge = { value: hedge };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uMasks; uniform vec4 uPaintExt; uniform vec3 uFields[6]; uniform vec3 uHedge;
        uniform vec4 uHole; uniform sampler2D uTownMasks;
        vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
        // distance to the nearest crack between Voronoi cells: blocky, jointed rock
        float cracks(vec2 p) {
          vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(x, y), o = h22(i + g); float d = length(g + o - f);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          return d2 - d1;
        }
        float lotHash(ivec2 c, uint s) {
          uint h = uint(c.x + 1000) * 374761393u + uint(c.y + 1000) * 668265263u + s * 1442695041u;
          h = (h ^ (h >> 13u)) * 1274126177u;
          return float(h ^ (h >> 16u)) / 4294967296.0;
        }`)
      .replace('#include <map_fragment>', `
        #ifdef HOLE
          if (vWPos.x > uHole.x + 0.2 && vWPos.x < uHole.z - 0.2 && vWPos.z > uHole.y + 0.2 && vWPos.z < uHole.w - 0.2) discard;
        #endif
        vec3 paintCol = texture2D(map, vMapUv).rgb;
        vec3 mk = texture2D(uMasks, (vWPos.xz - uPaintExt.xy) * uPaintExt.zw).rgb;
        float farmland = mk.r;
        #ifdef TOWN
          vec3 tm = texture2D(uTownMasks, vMapUv).rgb; // street, yard, rock
          if (tm.r > 0.3 || tm.g > 0.5) farmland = 0.0;
          mk.g = max(mk.g, tm.b) * (1.0 - tm.r);
        #endif
        const float ANG = 0.5;
        vec2 lot = vec2(vWPos.x * cos(ANG) - vWPos.z * sin(ANG), vWPos.x * sin(ANG) + vWPos.z * cos(ANG)) / vec2(150.0, 90.0);
        ivec2 cellId = ivec2(floor(lot));
        vec2 f = fract(lot) * vec2(150.0, 90.0);
        float edgeDist = min(min(f.x, 150.0 - f.x), min(f.y, 90.0 - f.y));
        float open = lotHash(cellId, 5u);
        vec2 cl = (vec2(cellId) + 0.5) * vec2(150.0, 90.0);
        vec2 cw = vec2(cl.x * cos(ANG) + cl.y * sin(ANG), -cl.x * sin(ANG) + cl.y * cos(ANG));
        float farmMid = texture2D(uMasks, (cw - uPaintExt.xy) * uPaintExt.zw).r;
        if (farmMid > max(0.35, open) && farmland > 0.12) {
          int kind = int(lotHash(cellId, 11u) * 6.0);
          vec3 fc = uFields[kind];
          // furrows: faint stripes along each lot
          fc *= 0.94 + 0.06 * sin(f.y * 1.3);
          float aa = fwidth(edgeDist) + 0.001;
          paintCol = mix(uHedge, fc, smoothstep(4.0 - aa, 4.0 + aa, edgeDist));
        }
        if (mk.g > 0.25) { // ledges: joints and a speckle of feldspar and quartz
          float c = cracks(vWPos.xz / 11.0);
          float aa2 = fwidth(c) + 0.002;
          float speck = h22(floor(vWPos.xz / 1.6)).x;
          vec3 rockCol = paintCol * (0.92 + 0.16 * speck);
          rockCol = mix(rockCol * 0.55, rockCol, smoothstep(0.04 - aa2, 0.04 + aa2, c));
          paintCol = mix(paintCol, rockCol, smoothstep(0.25, 0.6, mk.g));
        }
        if (mk.b > 0.5) { // marsh: tufts of sedge in little clumps, pools between
          vec2 tp = vWPos.xz / 7.0;
          vec2 o = h22(floor(tp));
          float tuft = length(fract(tp) - 0.3 - 0.4 * o);
          paintCol *= mix(0.78, 1.08, smoothstep(0.12, 0.3, tuft));
          float pool = smoothstep(0.78, 0.8, h22(floor(vWPos.xz / 23.0)).x) * (1.0 - smoothstep(0.25, 0.45, length(fract(vWPos.xz / 23.0) - 0.5)));
          paintCol = mix(paintCol, vec3(0.16, 0.3, 0.33), pool * 0.8);
        }
        diffuseColor.rgb *= paintCol;`);
  };
  return m;
}

// ------------------------------------------------------------------ helpers

function toonRamp() {
  const d = new Uint8Array([120, 170, 214, 245, 255]);
  const t = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
function smoothstep(a, b, v) { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }
function addWaterAttrs(g, level, flow, rapid) {
  const n = g.attributes.position.count;
  const fill = (arr) => new THREE.Float32BufferAttribute(arr ?? new Array(n).fill(0), 1);
  g.setAttribute('level', fill(level));
  g.setAttribute('flow', fill(flow));
  g.setAttribute('rapid', fill(rapid));
  if (!g.attributes.ground) g.setAttribute('ground', fill());
  if (!g.attributes.top) g.setAttribute('top', fill());
}

// ------------------------------------------------------------------ water shader

const WATER_VS = /* glsl */ `
  uniform float uLevel; uniform int uKind;
  attribute float level; attribute float flow; attribute float rapid; attribute float ground; attribute float top;
  varying vec3 vWorld; varying float vLevel; varying float vFlow; varying float vRapid; varying float vWall;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec3 p = position;
    float lv = level;
    #ifdef WALL
      lv = uLevel;
      p.y = top > 0.5 ? uLevel : min(ground, uLevel);
      vWall = top;
    #else
      if (uKind == 0) { p.y = uLevel; lv = uLevel; }
      vWall = 0.0;
    #endif
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz; vLevel = lv; vFlow = flow; vRapid = rapid;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;

const WATER_FS = /* glsl */ `
  uniform sampler2D uHeight; uniform sampler2D uSea; uniform vec4 uExt; uniform vec2 uHalf;
  uniform sampler2D uTownH; uniform sampler2D uTownSea; uniform vec4 uTownExt; uniform vec4 uTownRect;
  uniform float uTime; uniform int uKind;
  uniform vec3 uShallow, uDeep, uFoam;
  varying vec3 vWorld; varying float vLevel; varying float vFlow; varying float vRapid; varying float vWall;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    #include <logdepthbuf_fragment>
    #ifdef WALL
      float t = clamp(vWall, 0.0, 1.0);
      vec3 col = mix(uDeep * 0.7, uShallow, t * t);
      gl_FragColor = vec4(col, mix(0.88, 0.7, t));
    #else
      vec2 uv = vec2((vWorld.x - uExt.x) * uExt.z, (vWorld.z - uExt.y) * uExt.w) + uHalf;
      bool inTown = vWorld.x > uTownRect.x && vWorld.x < uTownRect.z && vWorld.z > uTownRect.y && vWorld.z < uTownRect.w;
      vec2 tuv = (vWorld.xz - uTownRect.xy) * uTownExt.xy + uTownExt.zw;
      float groundH = inTown ? texture2D(uTownH, tuv).r : texture2D(uHeight, uv).r;
      float depth = vLevel - groundH;
      if (uKind != 2 && depth < -0.05) discard;
      if (uKind == 0 && (inTown ? texture2D(uTownSea, tuv).r : texture2D(uSea, uv).r) < 0.5) discard; // lakes and low ground are not the sea
      float d = max(depth, 0.0);
      vec3 col = mix(uShallow, uDeep, smoothstep(0.4, uKind == 0 ? 22.0 : 9.0, d));

      // cartoon glints: two drifting noise layers cut into thin light bands
      vec2 q = vWorld.xz * 0.011;
      float n = vnoise(q + vec2(uTime * 0.05, uTime * 0.035)) * 0.6 + vnoise(q * 2.6 - vec2(uTime * 0.06, -uTime * 0.045)) * 0.4;
      float near = 1.0 - smoothstep(2500.0, 9000.0, vFogDepth); // glints only up close; far off they sparkle
      col += (smoothstep(0.66, 0.68, n) - smoothstep(0.7, 0.73, n)) * 0.08 * near;

      // a lacy foam edge where the water meets the shore
      float edge = 1.0 - smoothstep(0.0, uKind == 0 ? 1.1 : 0.6, d);
      float fn = vnoise(vWorld.xz * 0.06 + vec2(uTime * 0.25, -uTime * 0.2));
      float foam = step(0.5, edge * (0.55 + 0.7 * mix(0.5, fn, near)));

      if (uKind == 2) { // rivers: streaks running downstream, whitewater on the steep parts
        float s = fract(vFlow / 55.0 - uTime * 0.9 + vnoise(vWorld.xz * 0.04) * 0.7);
        col += smoothstep(0.86, 0.98, s) * 0.12;
        float white = vRapid * (0.65 + 0.6 * vnoise(vec2(vFlow * 0.08 - uTime * 4.0, vWorld.x * 0.08 + vWorld.z * 0.05)));
        foam = max(foam, step(0.5, white));
        col = mix(col, mix(uShallow, uFoam, 0.6), vRapid * 0.5);
      }
      if (uKind == 2) foam = max(step(0.5, edge * (0.55 + 0.7 * fn)) * 0.35, foam * step(0.3, vRapid));
      col = mix(col, uFoam, foam * 0.85);
      float alpha = mix(0.5, 0.94, smoothstep(0.2, 6.0, d));
      if (uKind == 2) alpha = max(alpha, 0.85);
      gl_FragColor = vec4(col, max(alpha, foam * 0.9));
    #endif
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
