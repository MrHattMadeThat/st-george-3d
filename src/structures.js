// Buildings and works of the 1870s, and the props the journey animation moves around.
//
// Buildings keep their real size (metres) while the ground is drawn taller than life, so each one
// sits on the lowest corner of its footprint on a granite foundation. Things that span the
// ground - dams, bridges, wharves, flumes - are built for the current hill height and rebuilt
// when it changes.
import * as THREE from 'three';
import { quarryLanding } from './landings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ geometry helpers

function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
/** a box sitting on y0, centred on x/z */
const box = (w, h, d, x = 0, y0 = 0, z = 0, color = '#ffffff') => tint(new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z), color);
const cyl = (r0, r1, h, x, y0, z, color, seg = 8) => tint(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y0 + h / 2, z), color);
const merge = (parts) => mergeGeometries(parts.filter(Boolean));

/** triangular gable ends for a roof running along z */
function gableEnds(w, d, h, rh, color) {
  const p = [];
  for (const s of [1, -1]) {
    const z = (s * d) / 2;
    const tri = s > 0 ? [-w / 2, h, z, w / 2, h, z, 0, h + rh, z] : [w / 2, h, z, -w / 2, h, z, 0, h + rh, z];
    p.push(...tri);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return tint(g, color);
}
/** two sloped roof boards over a w x d building whose walls are h tall, ridge rh above them */
function gableRoof(w, d, h, rh, color, over = 0.5) {
  const a = Math.atan2(rh, w / 2), run = w / 2 + over, len = run / Math.cos(a);
  const parts = [];
  for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(len, 0.35, d + over * 2);
    g.rotateZ(-s * a);
    g.translate((s * run) / 2 - s * Math.sin(a) * 0.2, h + rh - Math.tan(a) * (run / 2) + Math.cos(a) * 0.2, 0);
    parts.push(tint(g, color));
  }
  return merge(parts);
}
/** windows (and a door) on the long walls of a w x d building */
function windows(w, d, rows, color = '#34414d', door = true) {
  const parts = [];
  const n = Math.max(1, Math.round(d / 3.2));
  for (const s of [1, -1]) for (let r = 0; r < rows.length; r++) for (let k = 0; k < n; k++) {
    const z = -d / 2 + (d / n) * (k + 0.5);
    if (door && s > 0 && r === 0 && k === Math.floor(n / 2)) { parts.push(box(0.12, 2.2, 1.1, (s * w) / 2, 0.2, z, '#5b3a26')); continue; }
    parts.push(box(0.14, 1.58, 1.18, (s * w) / 2, rows[r] - 0.12, z, '#e8e0cb'));
    parts.push(box(0.18, 1.3, 0.9, (s * w) / 2, rows[r], z, color));
    parts.push(box(0.21, 0.06, 1.0, (s * w) / 2, rows[r]+0.62, z, '#eee5d1'));
    parts.push(box(0.21, 1.3, 0.055, (s * w) / 2, rows[r], z, '#eee5d1'));
  }
  for (const side of [-1, 1]) for (const y of rows) for (const x of [-w * 0.27, w * 0.27]) {
    parts.push(box(1.18, 1.58, 0.14, x, y-0.12, side*d/2, '#e8e0cb'));
    parts.push(box(0.9, 1.3, 0.18, x, y, side*d/2, color));
    parts.push(box(0.055, 1.3, 0.21, x, y, side*d/2, '#eee5d1'));
    parts.push(box(0.95, 0.06, 0.21, x, y+0.62, side*d/2, '#eee5d1'));
  }
  if (door) {
    parts.push(box(1.25, 2.3, 0.19, 0, 0.1, d/2, '#e6dbc0'), box(0.95, 2.15, 0.23, 0, 0.1, d/2, '#425b52'));
    parts.push(box(3.4, 0.3, 2.2, 0, 0, d/2+0.9, '#93856b'));
    parts.push(box(3.8, 0.18, 2.7, 0, 2.65, d/2+0.95, '#5b665a'));
    for (const x of [-1.4,1.4]) parts.push(box(0.12, 2.5, 0.12, x, 0.2, d/2+1.8, '#e5dbc5'));
  }
  // Corner boards and subtle horizontal clapboard courses catch the light.
  const height = Math.max(...rows) + 2;
  for (const x of [-w/2,w/2]) for (const z of [-d/2,d/2]) parts.push(box(0.18,height,0.18,x,0,z,'#dfd6bf'));
  for(let y=0.6;y<height;y+=0.48) {
    for(const side of [-1,1]) parts.push(box(0.025,0.035,d,side*(w/2+0.012),y,0,'#b9b4a0'));
  }
  return merge(parts);
}

// Red granite with joints and a speckle of feldspar and quartz, as a small canvas texture.
// Surfaces using it get world-scaled UVs (see worldUV), so the joints line up across faces.
let graniteTex = null;
function granite() {
  if (graniteTex) return graniteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#af7963'; g.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2600; k++) { // grains
    g.fillStyle = ['#b67b65', '#9f6656', '#c18c76', '#8c5d50', '#b17a64'][Math.floor(r() * 5)];
    g.fillRect(r() * 256, r() * 256, 0.5 + r() * 1.2, 0.5 + r() * 1.2);
  }
  // Granite grain is small and low contrast. Fractures are modeled in the face, never a brick texture.
  g.globalAlpha = 0.12; g.fillStyle = '#c49980'; g.fillRect(0, 0, 256, 256); g.globalAlpha = 1;
  graniteTex = new THREE.CanvasTexture(c);
  graniteTex.wrapS = graniteTex.wrapT = THREE.RepeatWrapping;
  graniteTex.colorSpace = THREE.SRGBColorSpace;
  graniteTex.anisotropy = 8;
  return graniteTex;
}
export const graniteMaterial = (toon) => new THREE.MeshToonMaterial({ map: granite(), gradientMap: toon });
/** UVs from world-ish position by each face's main axis, `size` metres per repeat */
function worldUV(geo, size) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (g.attributes.color) g.deleteAttribute('color');
  return g;
}

// Painted clapboard for walls and cedar shingles for roofs: near-white canvases that each
// building's own colour tints. Geometry gets planar UVs in metres (planarUV), so every house has
// boards the same size.
const texCache = {};
function canvasTex(key, size, draw, repeat = true) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (texCache[key] = t);
}
let rs = 5;
const rr = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
// 2 m of wall: ten 0.2 m boards, each lit on its face and shadowed under the lap above
const clapboard = () => canvasTex('clapboard', 256, (g, n) => {
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, n, n);
  const b = n / 10;
  for (let k = 0; k < 10; k++) {
    const y = k * b;
    const grd = g.createLinearGradient(0, y, 0, y + b);
    grd.addColorStop(0, '#d6d0c4'); grd.addColorStop(0.18, '#f7f4ee'); grd.addColorStop(1, '#ebe6dc');
    g.fillStyle = grd; g.fillRect(0, y, n, b);
    g.fillStyle = 'rgba(80,70,60,0.35)'; g.fillRect(0, y + b - 1.5, n, 1.5);
    for (let j = 0; j < 3; j++) { g.fillStyle = `rgba(120,110,95,${0.05 + rr() * 0.06})`; g.fillRect(rr() * n, y + 3, 30 + rr() * 80, b - 6); } // grain and weathering
  }
});
// 2 m of roof: rows of shingles, staggered, each a slightly different grey-brown. Rows run
// across u, because the roof UVs are planar in x (down the slope) and z (along the ridge).
const shingles = () => canvasTex('shingles', 256, (g, n) => {
  g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, n, n);
  const rows = 12, rw = n / rows;
  for (let r = 0; r < rows; r++) {
    let y = (r % 2) * 9 - 9;
    while (y < n) {
      const h = 14 + rr() * 16, v = 200 + rr() * 50;
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      g.fillRect(r * rw, y, rw - 1, h - 1.5);
      g.fillStyle = 'rgba(40,35,30,0.45)'; g.fillRect(r * rw + rw - 2.5, y, 2.5, h); // the shadow under each row's butt edge
      y += h;
    }
  }
});
function planarUV(geo, size) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------ building kinds

// Each kind: walls (painted per building), roof (per building), trim (windows, doors, foundation).
let contactMap;
function contactTexture() {
  if (contactMap) return contactMap;
  const canvas = document.createElement('canvas'); canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'), gradient=ctx.createRadialGradient(32,32,8,32,32,32);
  gradient.addColorStop(0,'rgba(25,35,25,0.38)'); gradient.addColorStop(0.65,'rgba(25,35,25,0.22)'); gradient.addColorStop(1,'rgba(25,35,25,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);contactMap=new THREE.CanvasTexture(canvas);return contactMap;
}
const GRANITE = '#b07a6c';
function kinds() {
  const house = { w: 8, d: 10.5, h: 6.4, rh: 3.3 };
  const cape = { w: 8.5, d: 7.5, h: 3.4, rh: 3.9 };
  const store = { w: 9, d: 14, h: 6.8, rh: 3 };
  const barn = { w: 10.5, d: 16, h: 5.4, rh: 4.6 };
  const church = { w: 11, d: 22, h: 7.5, rh: 5 };
  const found = (k) => box(k.w + 0.4, 10.6, k.d + 0.4, 0, -10, 0, GRANITE);
  return {
    house: {
      walls: merge([box(house.w, house.h, house.d), gableEnds(house.w, house.d, house.h, house.rh, '#ffffff')]),
      roof: merge([gableRoof(house.w, house.d, house.h, house.rh, '#ffffff'), box(0.9, 2.4, 0.9, 0, house.h + house.rh - 1.2, 2.2, '#ffffff')]),
      trim: merge([found(house), windows(house.w, house.d, [1.4, 4.2]), box(0.9, 1.2, 0.12, 0, house.h + 0.7, house.d / 2, '#34414d'), box(0.9, 1.2, 0.12, 0, house.h + 0.7, -house.d / 2, '#34414d')]),
      walls0: ['#f2efe6', '#efe2b8', '#f0d98a', '#d9dcd0', '#c9d6b3', '#b9c8d4', '#f2efe6'],
    },
    cape: {
      walls: merge([box(cape.w, cape.h, cape.d), gableEnds(cape.w, cape.d, cape.h, cape.rh, '#ffffff')]),
      roof: merge([gableRoof(cape.w, cape.d, cape.h, cape.rh, '#ffffff'), box(0.9, 2.2, 0.9, 0, cape.h + cape.rh - 1.3, 0, '#ffffff')]),
      trim: merge([found(cape), windows(cape.w, cape.d, [1.2])]),
      walls0: ['#f2efe6', '#e8e1cc', '#f0d98a', '#c8c3b6', '#d8b8a0', '#f2efe6'],
    },
    store: {
      // gable to the street with a square false front: the classic country store
      walls: merge([box(store.w, store.h, store.d), gableEnds(store.w, store.d, store.h, store.rh, '#ffffff'), box(store.w + 0.6, store.h + store.rh + 0.6, 0.4, 0, 0, store.d / 2 + 0.2)]),
      roof: gableRoof(store.w, store.d - 0.9, store.h, store.rh, '#ffffff').translate(0, 0, -0.45), // stops behind the false front
      trim: merge([found(store), windows(store.w, store.d, [1.5, 4.3], '#34414d', false),
        box(store.w * 0.7, 2.4, 0.15, 0, 0.3, store.d / 2 + 0.45, '#34414d'), box(store.w + 0.8, 0.5, 0.5, 0, store.h + store.rh + 0.6, store.d / 2 + 0.2, '#5b3a26')]),
      walls0: ['#efe2b8', '#f2efe6', '#b24a3a', '#d9dcd0', '#9fb0bd'],
    },
    barn: {
      walls: merge([box(barn.w, barn.h, barn.d), gableEnds(barn.w, barn.d, barn.h, barn.rh, '#ffffff')]),
      roof: gableRoof(barn.w, barn.d, barn.h, barn.rh, '#ffffff', 0.7),
      trim: merge([box(barn.w + 0.4, 1.6, barn.d + 0.4, 0, -1.2, 0, GRANITE), box(0.14, 4, 4, barn.w / 2, 0, 0, '#4a3326'), box(0.14, 4, 4, -barn.w / 2, 0, 0, '#4a3326')]),
      walls0: ['#9c3b2e', '#8d8478', '#7a5a3c', '#a4473a', '#8d8478'],
    },
    church: {
      walls: merge([box(church.w, church.h, church.d), gableEnds(church.w, church.d, church.h, church.rh, '#ffffff'),
        box(4.4, church.h + 7, 4.4, 0, 0, church.d / 2 + 1.6), tint(new THREE.ConeGeometry(2.6, 12, 8).translate(0, church.h + 7 + 6, church.d / 2 + 1.6), '#ffffff')]),
      roof: gableRoof(church.w, church.d, church.h, church.rh, '#ffffff'),
      trim: merge([found(church), windows(church.w, church.d, [2.2], '#6f8fa6', false), box(1.8, 3, 0.2, 0, 0, church.d / 2 + 3.9, '#5b3a26'),
        box(1.2, 1.6, 4.6, 0, church.h + 4, church.d / 2 + 1.6, '#34414d')]),
      walls0: ['#f7f5ee'],
    },
  };
}
const ROOFS = ['#4d4a48', '#5a4636', '#6b5a4a', '#3f4650', '#5c5652'];

// ------------------------------------------------------------------ the stage's structures

export function buildStructures(data, { exag, groundY, toon }) {
  const group = new THREE.Group();
  group.name = 'structures';
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon });
  const wallMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon, map: clapboard() });
  const roofMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon, map: shingles() });
  const { meta } = data;
  const S = meta.structures;
  const h = (x, z) => groundY(x, z); // world y of ground or water surface

  // ground under a rotated footprint: the middle of its corners, a little toward the low side;
  // the granite foundation reaches down to cover the rest
  const baseY = (x, z, rot, w, d) => {
    const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => {
      const lx = (a * w) / 2, lz = (b * d) / 2;
      return data.heightAt(x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)) * exag;
    }).sort((p, q) => p - q);
    return ys[1] * 0.5 + ys[2] * 0.5;
  };

  // ---- houses, stores, barns and churches (instanced by kind)
  const K = kinds();
  const byKind = {};
  for (const b of meta.buildings) (byKind[b[0]] ??= []).push(b);
  const shadows = [];
  for (const [kind,x,z,rot] of meta.buildings) {
    const size = {house:[14,16],cape:[14,13],store:[15,20],barn:[17,23],church:[18,32]}[kind];
    if (!size) continue;
    const g = new THREE.PlaneGeometry(...size, 3, 3).rotateX(-Math.PI/2).rotateY(rot).translate(x,0,z);
    const pos = g.attributes.position;
    for (let i=0;i<pos.count;i++) pos.setY(i,data.heightAt(pos.getX(i),pos.getZ(i))*exag+0.08);
    shadows.push(g);
  }
  const shade = new THREE.Mesh(mergeGeometries(shadows),new THREE.MeshBasicMaterial({map:contactTexture(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  shade.name='Building contact shadows'; group.add(shade); shadows.forEach(g=>g.dispose());
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), C = new THREE.Color();
  for (const [kind, list] of Object.entries(byKind)) {
    const k = K[kind];
    if (!k) continue;
    const size = { house: [8, 10.5], cape: [8.5, 7.5], store: [9, 14], barn: [10.5, 16], church: [11, 26] }[kind];
    const parts = [['walls', (b) => k.walls0[Math.floor(b[4] * k.walls0.length) % k.walls0.length]], ['roof', (b) => ROOFS[Math.floor(b[4] * 97) % ROOFS.length]], ['trim', null]];
    for (const [part, color] of parts) {
      const geo = part === 'walls' ? planarUV(k[part], 2) : part === 'roof' ? planarUV(k[part], 2) : k[part];
      const m = new THREE.InstancedMesh(geo, part === 'walls' ? wallMat : part === 'roof' ? roofMat : mat, list.length);
      m.name = `${kind}:${part}`;
      list.forEach((b, q) => {
        const [, x, z, rot] = b;
        P.set(x, baseY(x, z, rot, size[0], size[1]) + 0.15, z);
        m.setMatrixAt(q, M4.compose(P, Q.setFromAxisAngle(Y, rot), ONE));
        m.setColorAt(q, C.set(color ? color(b) : '#ffffff'));
      });
      m.computeBoundingSphere();
      group.add(m);
    }
  }

  townDressing(data, { group, exag, toon, mat, baseY });
  countryRoads(data, { group, exag, toon, mat });

  const add = (geo, x, y, z, rot = 0, name = '') => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.name = name;
    group.add(m);
    return m;
  };

  // ---- the Bay of Fundy Red Granite Co. finishing mill, 1873-74 (Map 4, No. 1)
  if (S.mill) {
    const { x, z, rot, length: L, width: W } = S.mill;
    const wall = '#8d8478', roof = '#4d4a48', h1 = 9, rh = 4.5;
    const geo = merge([
      box(W + 0.6, 20, L + 0.6, 0, -19.4, 0, GRANITE),
      box(W, h1, L, 0, 0, 0, wall), gableEnds(W, L, h1, rh, wall),
      gableRoof(W, L, h1, rh, roof, 0.8),
      // a clerestory lantern along the ridge lets light onto the polishing beds
      box(3.4, 2.2, L * 0.7, 0, h1 + rh - 0.6, 0, wall), gableRoof(3.4, L * 0.7, h1 + rh + 1.6, 0.9, roof, 0.4),
      // second, lower wing (Map 4 draws the mill as two ranges)
      box(12, 6, L * 0.55, -W / 2 - 6, 0, L * 0.12, '#978e82'), gableRoof(12, L * 0.55, 6, 3, roof, 0.5).translate(-W / 2 - 6, 0, L * 0.12),
      gableEnds(12, L * 0.55, 6, 3, '#978e82').translate(-W / 2 - 6, 0, L * 0.12),
      windows(W, L, [2, 5.6], '#34414d', false), windows(12, L * 0.55, [2], '#34414d', false).translate(-W / 2 - 6, 0, L * 0.12),
      box(4.5, 4.5, 0.3, 0, 0, L / 2 + 0.05, '#4a3326'), // big doors at both ends: rough stone in at the west,
      box(4.5, 4.5, 0.3, 0, 0, -L / 2 - 0.05, '#4a3326'), // finished work out at the east
      // yard stock: rough blocks and finished columns
      box(3, 1.8, 2, W / 2 + 6, 0, L / 2 - 6, '#b3503c'), box(2.4, 1.6, 2.6, W / 2 + 6.5, 0, L / 2 - 11, '#a8483a'), box(2, 1.2, 2, W / 2 + 5.5, 1.8, L / 2 - 6, '#c0604a'),
      tint(new THREE.CylinderGeometry(0.55, 0.55, 7, 10).rotateX(Math.PI / 2).translate(W / 2 + 10, 0.6, L / 2 - 20), '#c4574a'),
      tint(new THREE.CylinderGeometry(0.55, 0.55, 7, 10).rotateX(Math.PI / 2).translate(W / 2 + 11.4, 0.6, L / 2 - 20), '#c4574a'),
    ]);
    // the mill's long axis runs along its local z
    add(geo, x, baseY(x, z, rot, W, L), z, rot, 'Bay of Fundy mill');
  }

  // ---- the dam across the river below the upper bridge, and the flume to the mill wheel
  if (S.dam) {
    const { x, z, rot, level } = S.dam;
    const top = (level + 0.6) * exag, bed = Math.min(data.heightAt(x, z), level - 5) * exag;
    const parts = [];
    const span = 46;
    for (let k = 0; k < 8; k++) parts.push(box(span / 8 - 0.3, top - bed, 3, -span / 2 + (span / 8) * (k + 0.5), 0, 0, k % 2 ? '#6b4a2e' : '#7a5636'));
    parts.push(box(span, 0.5, 3.6, 0, top - bed, 0, '#5b3a26'));
    add(merge(parts), x, bed, z, rot, 'dam'); // local x spans the river, across the flow
  }
  if (S.flume && S.dam) {
    const [[x0, z0], [x1, z1]] = S.flume, lvl = S.dam.level;
    const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
    const y0 = (lvl + 0.3) * exag, y1 = y0 - 1.5 * exag;
    const parts = [box(2.6, 1.6, len, 0, 0, len / 2, '#7a5636'), box(2, 1.2, len, 0, 0.35, len / 2, '#4d7f98')];
    const n = Math.max(2, Math.round(len / 8));
    for (let k = 0; k <= n; k++) {
      const t = k / n, gx = x0 + (x1 - x0) * t, gz = z0 + (z1 - z0) * t;
      const legTop = y0 + (y1 - y0) * t, legBot = data.heightAt(gx, gz) * exag;
      if (legTop - legBot > 0.5) parts.push(box(0.5, legTop - legBot + 1, 0.5, 0, legBot - legTop - 1, len * t, '#5b3a26'));
    }
    const m = add(merge(parts), x0, y0, z0, rot, 'flume');
    m.rotation.x = Math.atan2(y0 - y1, len);
    // the wheel house where the flume meets the mill
    add(merge([box(8, 9, 7, 0, 0, 0, '#7a6f64'), gableRoof(8, 7, 9, 2.5, '#4d4a48')]), x1, baseY(x1, z1, rot, 8, 7), z1, rot, 'wheel house');
  }

  // ---- bridges: timber stringers on cribs, with a rail
  for (const key of ['upperBridge', 'lowerBridge']) {
    const b = S[key];
    if (!b) continue;
    const [[xa, za], [xb, zb]] = b;
    const L = Math.hypot(xb - xa, zb - za) + 16, rot = Math.atan2(xb - xa, zb - za);
    const cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const deck = Math.max(h(xa, za), h(xb, zb), (key === 'upperBridge' ? S.dam?.level ?? 9 : meta.highWater) * exag) + 2.5;
    const parts = [box(7, 0.6, L, 0, 0, 0, '#8a6a48'), box(0.3, 1.1, L, 3.4, 0.6, 0, '#5b3a26'), box(0.3, 1.1, L, -3.4, 0.6, 0, '#5b3a26')];
    for (let k = -2; k <= 2; k++) {
      const pz = (k / 2) * (L / 2 - 6), wx = cx + Math.sin(rot) * pz, wz = cz + Math.cos(rot) * pz;
      const bot = Math.min(data.heightAt(wx, wz) * exag, deck - 3);
      parts.push(box(6, deck - bot, 2.4, 0, bot - deck, pz, '#6b4a2e'));
    }
    // Approach planks follow the ground beyond each bridge end, closing both road gaps.
    for (const sign of [-1, 1]) {
      const run = 24, samples = 12;
      let prev = new THREE.Vector3(0, 0.6, sign * L / 2);
      for (let i = 1; i <= samples; i++) {
        const d = run * i / samples, localZ = sign * (L / 2 + d);
        const ground = h(cx + Math.sin(rot) * localZ, cz + Math.cos(rot) * localZ) - deck + 0.15;
        const y = THREE.MathUtils.lerp(0.6, ground, Math.min(1, d / 16));
        const next = new THREE.Vector3(0, y, localZ), delta = next.clone().sub(prev);
        const g = new THREE.BoxGeometry(7, 0.3, delta.length());
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize()));
        g.translate(0, (y + prev.y) / 2 - 0.15, (localZ + prev.z) / 2);
        parts.push(tint(g, '#8a6a48')); prev = next;
      }
    }
    add(merge(parts), cx, deck, cz, rot, key);
  }

  // ---- wharves: timber cribs filled with stone, a plank deck at high-water height plus a margin
  const wharf = (w, name) => {
    const { x, z, rot, length: L, width: W } = w;
    const deck = (meta.highWater + 1.6) * exag;
    const parts = [box(W, 0.6, L, 0, 0, L / 2, '#887455')];
    for (let z=0.4;z<L;z+=0.65) parts.push(box(W-0.1,0.035,0.025,0,0.6,z,'#63563f'));
    for (let i=0;i<7;i++) {
      const side=i%2?1:-1;
      parts.push(box(1.2,0.9+(i%3)*0.25,1.2,side*(W/2-1.5),0.62,8+i*5,'#9a7f58'));
      parts.push(box(1.24,0.08,1.24,side*(W/2-1.5),1.1,8+i*5,'#605b47'));
    }
    // Interlocking horizontal log courses around stone-filled cribs.
    const log = (length, x, y, z, across) => {
      const g = new THREE.CylinderGeometry(0.28, 0.3, length, 8);
      g.rotateX(Math.PI / 2);
      if (across) g.rotateY(Math.PI / 2);
      g.translate(x, y, z);
      return tint(g, '#6b4a2e');
    };
    for (let k = 0; k < L; k += 6) {
      const len = Math.min(6, L - k), pz = k + len / 2;
      const wx = x + Math.sin(rot) * pz, wz = z + Math.cos(rot) * pz;
      const bot = Math.max(Math.min(data.heightAt(wx, wz), -2), -8) * exag;
      parts.push(box(W - 1.3, deck - bot - 0.2, len - 1, 0, bot - deck, pz, '#777469'));
      for (let y = -0.3, course = 0; y > bot - deck; y -= 0.5, course++) {
        if (course % 2) {
          for (const end of [-1, 1]) parts.push(log(W, 0, y, pz + end * (len / 2 - 0.3), true));
        } else {
          for (const side of [-1, 1]) parts.push(log(len + 0.3, side * (W / 2 - 0.3), y, pz, false));
        }
      }
    }
    for (let k = 0; k < 4; k++) parts.push(box(0.6, 1, 0.6, (k % 2 ? 1 : -1) * (W / 2 - 0.6), 0.6, L * (0.35 + 0.2 * k), '#3b2a1c')); // bollards
    add(merge(parts), x, deck, z, rot, name);
  };
  if (S.wharf) wharf(S.wharf, 'main wharf');
  if (S.redStoreWharf) wharf(S.redStoreWharf, 'Red Store wharf');

  // ---- the Red Store at Breadalbane
  if (S.redStore) {
    const { x, z, rot } = S.redStore;
    const geo = merge([box(10.4, 10, 16.4, 0, -9.4, 0, GRANITE), box(10, 7, 16, 0, 0, 0, '#a4382c'), gableEnds(10, 16, 7, 3.4, '#a4382c'),
      gableRoof(10, 16, 7, 3.4, '#4d4a48'), windows(10, 16, [1.5, 4.5], '#f2efe6', true)]);
    add(geo, x, baseY(x, z, rot, 10, 16), z, rot + Math.PI / 2, 'The Red Store');
  }

  // Fractured rock banks give the Gorge a visible depth and silhouette.
  // Photo: Martin (2013), printed p.16 (c.1890s); form reference, not a measured 1874 survey.
  if (meta.gorge) {
    const rocks=[];
    for (let i=4;i<meta.gorge.length-4;i++) {
      const [x,z]=meta.gorge[i], a=meta.gorge[i-1], b=meta.gorge[i+1];
      const dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
      for (const side of [-1,1]) {
        const rx=x-side*dz/len*19, rz=z+side*dx/len*19;
        for (let layer=0;layer<2;layer++) {
          const rock = new THREE.IcosahedronGeometry(1,0).scale(6+(i%3),3.5+layer*1.5,5).rotateY(i*1.73);
          rock.translate(rx,data.heightAt(rx,rz)*exag-2-layer*3,rz);
          rocks.push(tint(rock,['#777769','#888577','#666c61'][i%3]));
        }
      }
    }
    group.add(new THREE.Mesh(merge(rocks),mat));
  }

  // ---- the old white pine by the Gorge
  if (S.oldPine) {
    const { x, z } = S.oldPine;
    const clump = (r, px, py, pz, c) => tint(new THREE.IcosahedronGeometry(r, 0).scale(1.6, 0.45, 1.1).translate(px, py, pz), c);
    const geo = merge([cyl(0.7, 1.1, 30, 0, 0, 0, '#5d4029', 6),
      clump(6, 3, 30, 0, '#3f6e46'), clump(5, 5.5, 24, 1, '#3a6641'), clump(4.5, 4, 18, -1.5, '#467a4c'), clump(3.6, 2, 33, -0.5, '#467a4c'),
      cyl(0.25, 0.4, 6, 0, 22, 0, '#5d4029', 5).rotateZ(-1.1).translate(2, 5, 0)]);
    add(geo, x, h(x, z) - 1, z, 0.6, 'old white pine');
  }

  // ---- the quarry: a stepped red granite face cut into the slope, a derrick and the landing
  if (S.quarry) {
    const { x, z, rot } = S.quarry;
    const red = ['#b3503c', '#a8483a', '#c0604a', '#9e4436'];
    const parts = [];
    // three benches, each stepped back into the hill (local -z is uphill), in jointed red granite
    const rock = [];
    // each bench reaches well down into the slope so none of them floats on the downhill side
    let seed = 43;
    const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    for (let b = 0; b < 3; b++) {
      const width = 40 - b * 6, n = 7, step = width / n;
      for(let i=0;i<n;i++) {
        const h = 11 + b * 5;
        const g = new THREE.BoxGeometry(step - 0.12, h, 10 + rnd()*2, 1, 1, 1);
        const pos = g.attributes.position;
        const lean = (rnd()-0.5)*0.8;
        for(let k=0;k<pos.count;k++) {
          const top = pos.getY(k)>0;
          pos.setX(k,pos.getX(k)+(top?lean:-lean));
          pos.setZ(k,pos.getZ(k)+(top ? Math.sin(i*4.3+b)*0.6 : 0));
        }
        g.computeVertexNormals(); g.translate(-width/2 + (i+0.5)*step,b*5+4-h/2,-8-b*9);
        rock.push(g);
      }
    }
    for (const side of [-1,1]) for (let i=0;i<5;i++) {
      rock.push(new THREE.IcosahedronGeometry(5+rnd()*2,0).scale(0.65,1.6,1).rotateY(rnd()).translate(side*(23+rnd()),2+i*1.5,-4-i*6));
    }
    // (the quarry floor is painted into the ground as bare rock by the build)
    for (let k = 0; k < 7; k++) rock.push(new THREE.BoxGeometry(2.6, 1.6, 1.8).translate(-12 + k * 3.8, -0.2 + 0.8, 4 + (k % 3) * 2.5)); // blocks split out, waiting
    const face = new THREE.Mesh(worldUV(mergeGeometries(rock.map((g) => g.index ? g.toNonIndexed() : g)), 4), new THREE.MeshToonMaterial({ map: granite(), gradientMap: toon }));
    face.name = 'quarry face';
    face.position.set(x, h(x, z) - 1.5, z);
    face.rotation.y = rot;
    group.add(face);
    // cut blocks on the floor, a spoil heap of grey rubble
    for (let k = 0; k < 6; k++) parts.push(tint(new THREE.IcosahedronGeometry(2.5 + (k % 3), 0).translate(24 + (k % 3) * 3, 0.5, 6 + k * 2.5), '#8f8a82'));
    // (the horse derrick is animated: see src/life.js)
    // quarrymen's shanty
    parts.push(box(5, 3, 4, -26, 0, 14, '#7a5a3c'), gableRoof(5, 4, 3, 1.6, '#4d4a48').translate(-26, 0, 14));
    add(merge(parts), x, h(x, z) - 1.5, z, rot, 'quarry');
    if (S.quarry.landing) {
      const { bank: [lx, lz], ux, uz, level } = quarryLanding(data);
      // A short bank-side platform, parallel to the berth and clear of the departing scow.
      const deck = Math.max(h(lx, lz), level * exag + 0.8);
      add(merge([box(6, 0.5, 12, 0, 0, 0, '#9a7a55')]), lx, deck, lz, Math.atan2(uz, -ux), 'canal landing');
    }
  }
  return group;
}

// ------------------------------------------------------------------ the town close up

// Shop signs, painted on a canvas atlas: one board a row. The trades of a small 1870s town; they
// are illustrations, not particular firms.
const TRADES = ['GENERAL STORE', 'DRY GOODS', 'HARDWARE', 'DRUGS & MEDICINES', 'BOOTS & SHOES', 'GROCERIES', 'TIN SHOP', 'HARNESS MAKER',
  'HOTEL', 'POST OFFICE', 'TAILOR', 'BAKERY', 'BOOKS & STATIONERY', 'FLOUR & FEED', 'WATCHMAKER', 'MILLINERY'];
const signAtlas = () => canvasTex('signs', 1024, (g, n) => {
  const h = n / TRADES.length;
  TRADES.forEach((t, k) => {
    const y = k * h;
    g.fillStyle = ['#2f3a2c', '#3a2622', '#23303b', '#efe6cf'][k % 4]; g.fillRect(0, y, n, h);
    g.strokeStyle = k % 4 === 3 ? '#5b3a26' : '#d9c89a'; g.lineWidth = 4; g.strokeRect(8, y + 6, n - 16, h - 12);
    g.fillStyle = k % 4 === 3 ? '#3a2622' : '#f3ead2';
    g.font = `bold ${Math.round(h * 0.56)}px Georgia, 'Times New Roman', serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, n / 2, y + h / 2 + 2, n - 60);
  });
}, false);
// picket fence: white pickets on a transparent canvas, 2 m to a repeat
const pickets = () => canvasTex('pickets', 128, (g, n) => {
  g.clearRect(0, 0, n, n);
  g.fillStyle = '#f4f1ea';
  const w = n / 13;
  for (let k = 0; k < 13; k++) {
    const x = k * w + 2;
    g.fillRect(x, n * 0.3, w - 5, n * 0.7);
    g.beginPath(); g.moveTo(x, n * 0.3); g.lineTo(x + (w - 5) / 2, n * 0.18); g.lineTo(x + w - 5, n * 0.3); g.fill();
  }
  g.fillRect(0, n * 0.42, n, 5); g.fillRect(0, n * 0.82, n, 5);
});
// planks across a sidewalk, 2 m to a repeat
const planks = () => canvasTex('planks', 128, (g, n) => {
  for (let k = 0; k < 10; k++) {
    const v = 150 + rr() * 40;
    g.fillStyle = `rgb(${v},${v * 0.78},${v * 0.55})`; g.fillRect(0, (k * n) / 10, n, n / 10);
    g.fillStyle = 'rgba(40,28,18,0.55)'; g.fillRect(0, (k * n) / 10, n, 1.5);
    g.fillStyle = 'rgba(40,28,18,0.4)'; g.fillRect(n * rr(), (k * n) / 10 + 4, 2, 2); g.fillRect(n * rr(), (k * n) / 10 + 4, 2, 2); // nail heads
  }
});

/** buildings' surroundings in town: the plank sidewalk, shop fronts and signs, fences, shade trees */
function townDressing(data, { group, exag, toon, mat, baseY }) {
  const { meta } = data;
  const gy = (x, z) => data.heightAt(x, z) * exag;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  const place = (geo, x, y, z, rot) => geo.applyMatrix4(M4.compose(P.set(x, y, z), Q.setFromAxisAngle(Y, rot), ONE));

  // ---- the plank sidewalk along Main Street's shops, both sides, on low sleepers
  const walkParts = [], edgeParts = [];
  for (const w of meta.sidewalks ?? []) {
    const pts = w.pts;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.5) continue;
      const tx = (x1 - x0) / L, tz = (z1 - z0) / L, n = Math.ceil(L / 2);
      for (let q = 0; q < n; q++) for (const side of [-1, 1]) {
        const a = (q / n) * L, b = ((q + 1) / n) * L, m = (a + b) / 2, len = b - a + 0.02;
        const off = w.half + 0.25 + w.width / 2;
        const cx = x0 + tx * m - tz * side * off, cz = z0 + tz * m + tx * side * off;
        const y = gy(cx, cz) + 0.28;
        const rot = Math.atan2(tx, tz);
        const deck = new THREE.BoxGeometry(w.width, 0.12, len);
        const uv = deck.attributes.uv; // planks run across the walk: v counts metres along it
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w.width) / 2, (uv.getY(i) * len + a) / 2);
        walkParts.push(place(deck.translate(0, -0.06, 0), cx, y, cz, rot));
        // the kerb beam on the street side, down to the ground
        const ex = cx + tz * side * (w.width / 2 - 0.1), ez = cz - tx * side * (w.width / 2 - 0.1);
        edgeParts.push(place(box(0.2, 0.45, len, 0, -0.45, 0, '#5b4330'), ex, y, ez, rot));
      }
    }
  }
  if (walkParts.length) {
    const m = new THREE.Mesh(mergeGeometries(walkParts), new THREE.MeshToonMaterial({ map: planks(), gradientMap: toon }));
    m.name = 'plank sidewalk';
    const kerb = new THREE.Mesh(mergeGeometries(edgeParts), mat);
    kerb.name = 'sidewalk kerb';
    group.add(m, kerb);
  }

  // ---- shop fronts: a signboard on the false front, a door, an awning over the sidewalk on some,
  // barrels and crates, a hitching rail at the kerb
  const stores = meta.buildings.filter(([k, x, z]) => k === 'store' && data.inTown(x, z));
  const signParts = [], front = [];
  stores.forEach(([, x, z, rot, v], k) => {
    const y = baseY(x, z, rot, 9, 14) + 0.15;
    const trade = Math.floor(v * 997 + k * 7) % TRADES.length;
    const sg = new THREE.PlaneGeometry(7.4, 1.25).translate(0, 8.3, 7.46);
    const uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (trade + 1 - uv.getY(i)) / TRADES.length);
    signParts.push(place(sg, x, y, z, rot));
    const parts = [box(1.3, 2.4, 0.18, 0, 0.1, 7.1, '#4a3326'), box(1.5, 0.15, 0.25, 0, 2.5, 7.12, '#e8e0cb')];
    if (v < 0.6) { // a shed roof over the sidewalk on two posts
      parts.push(tint(new THREE.BoxGeometry(8.6, 0.16, 3.1).rotateX(-0.16).translate(0, 3.3, 7.1 + 1.55), ['#5b665a', '#6b4a2e', '#7a3b2e', '#4d4a48'][k % 4]));
      for (const sx of [-4, 4]) parts.push(box(0.16, 3.1, 0.16, sx, 0, 9.9, '#e5dbc5'));
    }
    if (v > 0.25) { // barrels and a crate by the door
      parts.push(cyl(0.32, 0.36, 0.85, 2.2, 0.2, 7.8, '#8a6a48', 10), cyl(0.32, 0.36, 0.85, 2.95, 0.2, 7.9, '#7a5a3c', 10), box(0.7, 0.55, 0.6, -2.4, 0.2, 7.9, '#a08058'));
    }
    if (k % 3 === 0) { // a hitching rail at the kerb
      parts.push(box(0.14, 1.0, 0.14, -1.8, -0.2, 11.2, '#5b4330'), box(0.14, 1.0, 0.14, 1.8, -0.2, 11.2, '#5b4330'), box(3.8, 0.1, 0.1, 0, 0.7, 11.2, '#5b4330'));
    }
    front.push(place(merge(parts), x, y, z, rot));
  });
  if (signParts.length) {
    const m = new THREE.Mesh(mergeGeometries(signParts), new THREE.MeshToonMaterial({ map: signAtlas(), gradientMap: toon }));
    m.name = 'shop signs';
    const f = new THREE.Mesh(mergeGeometries(front), mat);
    f.name = 'shop fronts';
    group.add(m, f);
  }

  // ---- picket fences across the fronts of about half the town's houses, with a gate gap
  const streetSegs = (meta.streets ?? []).filter((st) => !st.bridge).flatMap((st) => st.pts.slice(1).map((p, k) => [st.pts[k], p, st.half]));
  const streetEdge = (x, z) => {
    let best = Infinity;
    for (const [[x0, z0], [x1, z1], h] of streetSegs) {
      if (Math.min(x0, x1) - 40 > x || Math.max(x0, x1) + 40 < x || Math.min(z0, z1) - 40 > z || Math.max(z0, z1) + 40 < z) continue;
      const dx = x1 - x0, dz = z1 - z0, f = Math.min(Math.max(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1), 0), 1);
      best = Math.min(best, Math.hypot(x - x0 - f * dx, z - z0 - f * dz) - h);
    }
    return best;
  };
  const fence = [];
  const homes = meta.buildings.filter(([k, x, z]) => (k === 'house' || k === 'cape') && data.inTown(x, z));
  homes.forEach(([, x, z, rot, v]) => {
    if ((v * 131) % 1 > 0.55) return;
    // the fence stands just inside the street's edge, across the house front (local +x)
    const ox = Math.cos(rot), oz = -Math.sin(rot), ax = Math.sin(rot), az = Math.cos(rot);
    const e = streetEdge(x, z);
    if (!(e > 5 && e < 20)) return;
    const lx = Math.min(e - 1.2, 14);
    for (const [a, b] of [[-11, -0.9], [0.9, 11]]) {
      for (let s0 = a; s0 < b - 0.01; s0 += 2) {
        const s1 = Math.min(b, s0 + 2);
        const p0 = [x + ox * lx + ax * s0, z + oz * lx + az * s0], p1 = [x + ox * lx + ax * s1, z + oz * lx + az * s1];
        const y0 = gy(...p0), y1 = gy(...p1), u0 = s0 / 2, u1 = s1 / 2;
        fence.push([p0[0], y0, p0[1], u0, 0], [p1[0], y1, p1[1], u1, 0], [p1[0], y1 + 1.1, p1[1], u1, 1],
          [p0[0], y0, p0[1], u0, 0], [p1[0], y1 + 1.1, p1[1], u1, 1], [p0[0], y0 + 1.1, p0[1], u0, 1]);
      }
    }
  });
  if (fence.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fence.flatMap((v) => v.slice(0, 3)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(fence.flatMap((v) => v.slice(3)), 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: pickets(), gradientMap: toon, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.name = 'picket fences';
    group.add(m);
  }

  // ---- shade trees: elms and maples in back yards and along Main Street
  const parts = [];
  const tree = (x, z, s, color) => {
    const y = gy(x, z);
    parts.push(cyl(0.22 * s, 0.34 * s, 5.5 * s, x, y - 0.3, z, '#5d4029', 6));
    for (let c = 0; c < 3; c++) {
      const a = c * 2.1 + x, r = (2.6 + (c % 2)) * s;
      parts.push(tint(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.8, 1).translate(x + Math.cos(a) * 1.4 * s, y + (6.2 + c * 0.9) * s, z + Math.sin(a) * 1.4 * s), color));
    }
  };
  homes.forEach(([, x, z, rot, v], k) => {
    if (k % 3) return;
    const ox = Math.cos(rot), oz = -Math.sin(rot), ax = Math.sin(rot), az = Math.cos(rot), sd = v > 0.5 ? 7 : -7;
    tree(x - ox * 11 + ax * sd, z - oz * 11 + az * sd, 0.85 + v * 0.4, ['#4f8a3c', '#5c9a3f', '#46803a'][k % 3]);
  });
  if (parts.length) {
    const m = new THREE.Mesh(merge(parts), mat);
    m.name = 'shade trees';
    group.add(m);
  }
}

// A country dirt road, 2 m of it to a repeat: two wheel tracks, grass down the crown, grassy verges.
const dirtRoad = () => canvasTex('dirt-road', 128, (g, n) => {
  g.fillStyle = '#a88a5c'; g.fillRect(0, 0, n, n);
  for (let k = 0; k < 900; k++) { const v = 120 + rr() * 70; g.fillStyle = `rgba(${v},${v * 0.82},${v * 0.58},0.5)`; g.fillRect(rr() * n, rr() * n, 1 + rr() * 2, 1 + rr() * 2); }
  const band = (x0, x1, style) => { g.fillStyle = style; g.fillRect(x0 * n, 0, (x1 - x0) * n, n); };
  band(0.2, 0.3, 'rgba(90,70,45,0.35)'); band(0.7, 0.8, 'rgba(90,70,45,0.35)'); // wheel tracks
  band(0.44, 0.56, 'rgba(110,140,70,0.45)'); // the crown
  band(0, 0.07, 'rgba(100,130,60,0.65)'); band(0.93, 1, 'rgba(100,130,60,0.65)'); // verges
  for (let k = 0; k < 120; k++) { g.fillStyle = 'rgba(90,125,55,0.6)'; const x = rr() < 0.5 ? rr() * 0.12 : 0.88 + rr() * 0.12; g.fillRect(x * n, rr() * n, 1.5, 3 + rr() * 4); }
});

/** Riverview Avenue and the Canal Road outside the town: a ribbon on the ground, and a timber
 * bridge wherever it crosses water */
function countryRoads(data, { group, exag, toon, mat }) {
  const { meta } = data;
  for (const road of meta.roads ?? []) {
    // resample every 3 m so the ribbon follows the ground's 30 m triangles
    const src = road.pts, pts = [];
    for (let k = 0; k + 1 < src.length; k++) {
      const [x0, z0] = src[k], [x1, z1] = src[k + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 3));
      for (let q = 0; q < n; q++) pts.push([x0 + ((x1 - x0) * q) / n, z0 + ((z1 - z0) * q) / n]);
    }
    pts.push(src[src.length - 1]);
    const water = (x, z) => { const w = data.inlandWaterAt(x, z); return Number.isNaN(w) || data.heightAt(x, z) > w + 0.3 ? null : w; };
    const pos = [], uv = [], bridges = [];
    let v = 0, run = null;
    for (let k = 0; k < pts.length; k++) {
      const [x, z] = pts[k];
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (k) v += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]) / 2;
      const w = water(x, z);
      if (w !== null) { if (!run) run = { k0: k, level: w }; run.k1 = k; run.level = Math.max(run.level, w); }
      else if (run) { bridges.push(run); run = null; }
      pos.push([x - tz * road.half, z + tx * road.half, x + tz * road.half, z - tx * road.half, data.inTown(x, z) || w !== null]);
      uv.push(v);
    }
    // the ribbon, in quads, skipping the town (its streets are painted) and the water
    const P = [], U = [];
    const yAt = (x, z) => data.heightAt(x, z) * exag + 0.22;
    for (let k = 0; k + 1 < pos.length; k++) {
      const [lx0, lz0, rx0, rz0, skip0] = pos[k], [lx1, lz1, rx1, rz1, skip1] = pos[k + 1];
      if (skip0 || skip1) continue;
      const q = [[lx0, lz0, 0, uv[k]], [lx1, lz1, 0, uv[k + 1]], [rx0, rz0, 1, uv[k]], [rx0, rz0, 1, uv[k]], [lx1, lz1, 0, uv[k + 1]], [rx1, rz1, 1, uv[k + 1]]]; // wound to face up
      for (const [x, z, u, vv] of q) { P.push(x, yAt(x, z), z); U.push(u, vv); }
    }
    // the surface of the road for anything driving along it: the ground, or a bridge and its ramps
    group.userData.roadY = (x, z) => {
      for (const b of group.userData.bridges ?? []) {
        const dx = x - b.cx, dz = z - b.cz, al = dx * Math.sin(b.rot) + dz * Math.cos(b.rot), ac = dx * Math.cos(b.rot) - dz * Math.sin(b.rot);
        if (Math.abs(ac) > b.half + 1) continue;
        if (Math.abs(al) <= b.L / 2) return b.deck + 0.25;
        const e = b.ends[Math.sign(al)], past = Math.abs(al) - b.L / 2;
        if (e && e.drop > 0.3 && past < e.run) return b.deck + 0.25 - (e.drop * past) / e.run;
      }
      return data.heightAt(x, z) * exag + 0.22;
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: dirtRoad(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = road.name;
    group.add(m);
    // bridges: a plank deck on timber cribs, a little longer than the water
    for (const r of bridges) {
      const a = pts[Math.max(0, r.k0 - 3)], b = pts[Math.min(pts.length - 1, r.k1 + 3)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      // high enough for a loaded scow and its polers to pass under, with a ramp down to the road at each end
      const deck = Math.max(yAt(...a), yAt(...b), (r.level + 2.4) * exag);
      const parts = [box(road.half * 2 + 1, 0.5, L, 0, 0, 0, '#8a6a48'), box(0.25, 0.9, L, road.half + 0.4, 0.5, 0, '#5b3a26'), box(0.25, 0.9, L, -road.half - 0.4, 0.5, 0, '#5b3a26')];
      const ends = {};
      for (const [end, sgn] of [[a, -1], [b, 1]]) {
        const drop = deck - yAt(...end);
        ends[sgn] = { run: Math.max(8, drop * 3.5), drop };
        if (drop < 0.3) continue;
        const run = Math.max(8, drop * 3.5), ang = Math.atan2(drop, run), len = Math.hypot(run, drop);
        const ramp = new THREE.BoxGeometry(road.half * 2 + 1, 0.5, len).rotateX(sgn * ang).translate(0, -drop / 2, sgn * (L / 2 + run / 2));
        parts.push(tint(ramp, '#8a6a48'));
      }
      for (let q = -1; q <= 1; q++) {
        const pz = (q * L) / 3, wx = cx + Math.sin(rot) * pz, wz = cz + Math.cos(rot) * pz;
        const bot = Math.min(data.heightAt(wx, wz) * exag, deck - 3);
        parts.push(box(road.half * 2 - 1, deck - bot, 1.6, 0, bot - deck, pz, '#6b4a2e'));
      }
      (group.userData.bridges ??= []).push({ cx, cz, rot, L, deck, half: road.half, ends });
      const br = new THREE.Mesh(merge(parts), mat);
      br.position.set(cx, deck, cz); br.rotation.y = rot; br.name = `${road.name} bridge`;
      group.add(br);
    }
  }
}

// ------------------------------------------------------------------ moving props

export function makeProps(toon) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon });
  const mesh = (geo, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; return m; };
  const person = (coat = '#2f4a6b', x = 0, z = 0, y = 0) => merge([cyl(0.35, 0.45, 1.3, x, y, z, coat, 6), tint(new THREE.SphereGeometry(0.32, 8, 6).translate(x, y + 1.6, z), '#e7c3a0'),
    cyl(0.4, 0.4, 0.14, x, y + 1.85, z, '#3b2a1c', 8), cyl(0.22, 0.26, 0.3, x, y + 1.95, z, '#3b2a1c', 8)]);

  // granite: a rough block, and the polished column made from it (its origin is on its own axis, so it spins true)
  const stoneMesh = (g, name) => { const m = new THREE.Mesh(worldUV(g, 4), graniteMaterial(toon)); m.name = name; return m; };
  const block = () => stoneMesh(new THREE.BoxGeometry(3.2, 1.8, 2.2).translate(0, 0.9, 0), 'granite block');
  const column = () => {
    const g = merge([tint(new THREE.CylinderGeometry(0.42, 0.42, 4.6, 14).rotateZ(Math.PI / 2), '#c85a4c'),
      tint(new THREE.CylinderGeometry(0.52, 0.52, 0.35, 14).rotateZ(Math.PI / 2).translate(2.2, 0, 0), '#b04c40'),
      tint(new THREE.CylinderGeometry(0.52, 0.52, 0.35, 14).rotateZ(Math.PI / 2).translate(-2.2, 0, 0), '#b04c40')]);
    return stoneMesh(g, 'polished column');
  };
  // a flat-bottomed scow, poled by two men (local +z is forward)
  const scow = () => mesh(merge([box(6, 1.1, 16, 0, 0, 0, '#6b4a2e'), box(6.3, 0.35, 16.3, 0, 1.05, 0, '#4a3326')]), 'scow');

  // a two-masted coasting schooner (local +z is forward)
  const schooner = () => {
    const hull = new THREE.Shape();
    hull.moveTo(0, 15); hull.quadraticCurveTo(3.4, 9, 3.4, 0); hull.lineTo(3.2, -12); hull.lineTo(-3.2, -12); hull.lineTo(-3.4, 0); hull.quadraticCurveTo(-3.4, 9, 0, 15);
    const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 3.4, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 2.2, 0);
    const stripe = new THREE.ExtrudeGeometry(hull, { depth: 0.5, bevelEnabled: false }).rotateX(Math.PI / 2).scale(1.02, 1, 1.02).translate(0, 2.7, 0);
    const sail = (w, hh, x, y0, z) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, y0, z, 0, y0, z - w, 0, y0 + hh, z, 0, y0 + hh, z, 0, y0, z - w, 0, y0 + hh * 0.85, z - w * 0.95], 3));
      g.computeVertexNormals();
      return tint(g.translate(x, 0, 0), '#f3ecd8');
    };
    const jib = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 4, 14.5, 0, 4, 5.8, 0, 20, 5.8], 3)); g.computeVertexNormals(); return tint(g, '#f3ecd8'); })();
    const g = merge([tint(hullGeo, '#23302b'), tint(stripe, '#e8dfc8'), box(6, 0.3, 25, 0, 2.1, 1.5, '#9a7a55'),
      cyl(0.25, 0.32, 22, 0, 2, 5.5, '#6b4a2e', 6), cyl(0.25, 0.32, 24, 0, 2, -4.5, '#6b4a2e', 6), cyl(0.12, 0.18, 9, 0, 0, 0, '#6b4a2e', 5).rotateX(1.35).translate(0, 5.4, 15.5),
      box(2.4, 1.6, 3.6, 0, 2.3, -8.5, '#7a5a3c')]);
    // Sails set, or furled along their booms (as at a wharf, loading). userData.setSails(on) swaps them.
    const set = merge([sail(9, 16, 0.1, 4, 5.3), sail(11, 18, 0.1, 4, -4.7), jib]);
    const furled = merge([cyl(0.38, 0.38, 9, 0, 0, 0, '#e6dcc2', 8).rotateX(Math.PI / 2).translate(0, 4.35, 5.3 - 4.5),
      cyl(0.42, 0.42, 11, 0, 0, 0, '#e6dcc2', 8).rotateX(Math.PI / 2).translate(0, 4.35, -4.7 - 5.5),
      cyl(0.3, 0.3, 8.5, 0, 0, 0, '#e6dcc2', 8).rotateX(Math.PI / 2).translate(0, 3.6, 10.2)]);
    const hullMesh = mesh(g, 'schooner hull');
    const sailMat = mat.clone(); sailMat.side = THREE.DoubleSide; // the sails need both faces
    const sails = new THREE.Mesh(set, sailMat); sails.name = 'sails';
    const stowed = new THREE.Mesh(furled, mat); stowed.name = 'furled sails'; stowed.visible = false;
    const ship = new THREE.Group();
    ship.name = 'schooner';
    ship.add(hullMesh, sails, stowed);
    ship.userData.setSails = (on) => { sails.visible = on; stowed.visible = !on; };
    return ship;
  };
  // a wagon with a pair of horses (local +z is forward)
  const wagon = () => {
    const horse = (x) => merge([box(1, 1.4, 2.6, x, 1.2, 0, '#6b4a2e'), box(0.6, 1.2, 1, x, 2, 1.5, '#6b4a2e').rotateX(0), cyl(0.12, 0.12, 1.2, x - 0.3, 0, -1, '#3b2a1c', 4), cyl(0.12, 0.12, 1.2, x + 0.3, 0, -1, '#3b2a1c', 4), cyl(0.12, 0.12, 1.2, x - 0.3, 0, 1, '#3b2a1c', 4), cyl(0.12, 0.12, 1.2, x + 0.3, 0, 1, '#3b2a1c', 4)]);
    const wheel = (x, z) => tint(new THREE.CylinderGeometry(0.8, 0.8, 0.25, 12).rotateZ(Math.PI / 2).translate(x, 0.8, z), '#5b3a26');
    // the team and the driver are animated figures (src/life.js), riding along with this mesh
    return mesh(merge([box(2.4, 0.5, 5, 0, 1.1, 0, '#8a6a48'), box(0.1, 0.5, 5, 1.15, 1.55, 0, '#6b4a2e'), box(0.1, 0.5, 5, -1.15, 1.55, 0, '#6b4a2e'),
      wheel(-1.3, -1.6), wheel(1.3, -1.6), wheel(-1.3, 1.6), wheel(1.3, 1.6), box(0.12, 0.12, 3.4, 0, 1.0, 4.1, '#3b2a1c'), box(1.6, 0.3, 0.6, 0, 1.6, 1.9, '#6b4a2e')]), 'wagon');
  };
  return { block, column, scow, schooner, wagon, person: (c) => mesh(person(c), 'person') };
}
