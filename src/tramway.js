// The Saint George Red Granite Co. quarry tramway, 1873.
//
// "By September 1873 [the company had] completed a railway from the quarries to the shed site on
// the Magaguadavic River" (Martin 2013, p. 10). Visitors in 1873 "relished the sluiceway that
// scooted huge blocks of stone downslope on wooden sleds to the railcars and loading derrick",
// then rode "downhill in the railcars" to the finishing shed (Martin, p. 13, from the Daily
// Telegraph). The quarries are the Front (Burpee) quarries, Map 3 Nos. 33–34, on the cliff west of
// the river; the shed is the yellow X, half a mile south, on the intervale. It opened in February
// 1874 and burned in June 1874.
//
// The line's exact course, the cars, the derrick and the horse that hauls the empties back up are
// not recorded: they are the ordinary gear of a gravity tramway, drawn to explain how it worked.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const QUARRY = [45.1640, -66.8490]; // Map 3, Nos. 33–34 (placed by eye)
const SHED = [45.1587, -66.8446]; // Map 3, yellow X: on the intervale ~130 m back from the river
const SLIDE = 95; // metres of sled slide (the "sluiceway") down the steep face to the platform

/** Where everything goes, in map metres. Pure data, so trees can be cleared before they are planted. */
export function tramwayLayout(data) {
  const q = data.toLocal(...QUARRY), s = data.toLocal(...SHED);
  const len = Math.hypot(s.x - q.x, s.z - q.z), dx = (s.x - q.x) / len, dz = (s.z - q.z) / len;
  const px = -dz, pz = dx; // to the right, looking downhill
  const at = (d, side = 0) => [q.x + dx * d + px * side, q.z + dz * d + pz * side];
  const platform = at(SLIDE + 4);
  // the line leaves the platform, bends a little to hold its grade along the slope, and runs
  // down the long side of the shed
  const track = [at(SLIDE + 1, 0), at(SLIDE + 40, 2), at(len * 0.45, 16), at(len * 0.72, 12), at(len - 34, 0), at(len + 12, -2)];
  const shed = at(len - 8, 24); // back from the line, its yard between (the shed's local +x faces the line)
  return {
    quarry: { x: q.x, z: q.z, rot: Math.atan2(dx, dz) },
    slide: [at(12), at(SLIDE - 3)],
    platform: { x: platform[0], z: platform[1], rot: Math.atan2(dx, dz) },
    track,
    shed: { x: shed[0], z: shed[1], rot: Math.atan2(dx, dz) },
    clearings: [
      { pts: [at(-10), at(SLIDE + 6)], r: 16 }, // the quarry and the slide
      { pts: track, r: 9 },
      { pts: [at(len - 45, 18), at(len + 25, 18)], r: 32 }, // the shed and its yard
    ],
  };
}

export function buildTramway({ data, world, scene, life, layout }) {
  const group = new THREE.Group();
  group.name = 'Saint George Red Granite Co. tramway, 1873';
  scene.add(group);
  const toon = world.toon;
  const mats = new Map();
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c, gradientMap: toon })); return mats.get(c); };
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const mesh = (geos, color, name) => { const m = new THREE.Mesh(mergeGeometries(geos), mat(color)); m.name = name; geos.forEach((g) => g.dispose()); return m; };
  const WOOD = '#8a6a48', DARK_WOOD = '#5e4632', IRON = '#4a4a4c', GRANITE = '#ad7f70', GRANITE_2 = '#977064';

  // ------------------------------------------------------------------ the line and its grade
  const curve = new THREE.CatmullRomCurve3(layout.track.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength();
  const STEP = 2;
  const N = Math.ceil(L / STEP);
  const pts = Array.from({ length: N + 1 }, (_, i) => curve.getPointAt(i / N));
  // Rails ride a smoothed profile that only ever falls toward the shed, a steady gravity grade,
  // on low trestles over the dips; over a rise they keep to the ground on their sleepers.
  const ground = pts.map((p) => data.heightAt(p.x, p.z));
  const smooth = ground.map((_, i) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - 12); k <= Math.min(N, i + 12); k++) { s += ground[k]; n++; }
    return s / n;
  });
  const rail = smooth.slice();
  for (let i = 1; i <= N; i++) rail[i] = Math.min(rail[i - 1] - 0.004 * STEP, rail[i]);
  for (let i = 0; i <= N; i++) rail[i] = Math.max(rail[i], ground[i] + 0.13);
  const railAt = (s) => { const u = THREE.MathUtils.clamp(s / STEP, 0, N - 1e-6), i = Math.floor(u); return THREE.MathUtils.lerp(rail[i], rail[i + 1], u - i); };
  const pointAt = (s) => curve.getPointAt(THREE.MathUtils.clamp(s / L, 0, 1));
  const tangentAt = (s) => curve.getTangentAt(THREE.MathUtils.clamp(s / L, 0, 1));

  const GAUGE = 1.2;
  let track = null;
  function buildTrack() {
    if (track) { group.remove(track); track.traverse((o) => o.geometry?.dispose()); }
    track = new THREE.Group();
    track.name = 'tramway track';
    const ex = world.exag, sleepers = [], rails = [], straps = [], bents = [];
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    for (let s = 0.5; s < L; s += 0.9) {
      const p = pointAt(s), t = tangentAt(s), y = railAt(s) * ex;
      q.setFromUnitVectors(Z, t);
      sleepers.push(new THREE.BoxGeometry(2.0, 0.16, 0.24).applyQuaternion(q).translate(p.x, y - 0.2, p.z));
      const g = data.heightAt(p.x, p.z) * ex;
      if (y - g > 0.9 && Math.round(s / 0.9) % 4 === 0) { // a trestle bent under the sleepers
        const side = new THREE.Vector3().crossVectors(up, t).normalize();
        for (const k of [-1, 1]) bents.push(new THREE.BoxGeometry(0.22, y - g, 0.22).translate(p.x + side.x * k * 0.8, g + (y - g) / 2 - 0.3, p.z + side.z * k * 0.8));
        bents.push(new THREE.BoxGeometry(2.0, 0.18, 0.18).applyQuaternion(q).translate(p.x, (g + y) / 2, p.z));
      }
    }
    // wooden stringers with an iron strap on top, as early tramways were laid
    for (let s = 0; s < L; s += STEP) {
      const a = pointAt(s), b = pointAt(Math.min(L, s + STEP));
      const ya = railAt(s) * ex, yb = railAt(Math.min(L, s + STEP)) * ex;
      const A = new THREE.Vector3(a.x, ya, a.z), B = new THREE.Vector3(b.x, yb, b.z);
      const d = B.clone().sub(A), span = d.length(), mid = A.clone().add(B).multiplyScalar(0.5);
      q.setFromUnitVectors(Z, d.normalize());
      const side = new THREE.Vector3().crossVectors(up, d).normalize();
      for (const k of [-1, 1]) {
        const o = side.clone().multiplyScalar((k * GAUGE) / 2);
        rails.push(new THREE.BoxGeometry(0.16, 0.16, span + 0.05).applyQuaternion(q).translate(mid.x + o.x, mid.y - 0.04, mid.z + o.z));
        straps.push(new THREE.BoxGeometry(0.1, 0.03, span + 0.05).applyQuaternion(q).translate(mid.x + o.x, mid.y + 0.055, mid.z + o.z));
      }
    }
    track.add(mesh(sleepers, DARK_WOOD, 'sleepers'), mesh(rails, WOOD, 'stringers'), mesh(straps, IRON, 'strap rails'));
    // the worn bed of the line, draped on the ground so the cut through the woods reads from afar
    const bed = [], W = 2.0;
    for (let s = 0; s <= L; s += STEP) {
      const p = pointAt(s), t = tangentAt(s);
      for (const k of [-1, 1]) { const x = p.x + t.z * k * W, z = p.z - t.x * k * W; bed.push(x, data.heightAt(x, z) * ex + 0.08, z); }
    }
    const bi = [];
    for (let i = 0; i + 1 < bed.length / 6; i++) { const a = i * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bed, 3));
    bg.setIndex(bi);
    bg.computeVertexNormals();
    const bedMesh = new THREE.Mesh(bg, new THREE.MeshToonMaterial({ color: '#9b8466', gradientMap: toon, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    bedMesh.name = 'tramway bed';
    track.add(bedMesh);
    if (bents.length) track.add(mesh(bents, DARK_WOOD, 'trestle'));
    group.add(track);
  }

  // ------------------------------------------------------------------ the quarry, slide and platform
  const Qd = layout.quarry, P = layout.platform, dir = [Math.sin(Qd.rot), Math.cos(Qd.rot)];
  const local = (o, lx, lz) => [o.x + lx * Math.cos(o.rot) + lz * Math.sin(o.rot), o.z - lx * Math.sin(o.rot) + lz * Math.cos(o.rot)];
  const placed = []; // [object, x, z, lift, rot] re-seated when the hills are raised or lowered
  const seat = (obj, x, z, lift = 0, rot = 0) => { placed.push([obj, x, z, lift, rot]); group.add(obj); return obj; };
  const reseat = () => { for (const [o, x, z, lift, rot] of placed) { o.position.set(x, data.heightAt(x, z) * world.exag + lift, z); o.rotation.y = rot; } };

  { // the quarry face: benches of red granite cut back into the hill, blocks on the floor
    const g = new THREE.Group(), faces = [], blocks = [];
    for (let b = 0; b < 3; b++) for (let i = 0; i < 5; i++) {
      const w = 26 - b * 5, st = w / 5;
      faces.push(box(st - 0.15, 4 + b * 3.2, 5, -w / 2 + (i + 0.5) * st, -2 + b * 1.2, -7 - b * 5).rotateY((i - 2) * 0.02));
    }
    for (const s of [-1, 1]) faces.push(box(4, 9, 18, s * 14, -3, -12));
    faces.push(box(28, 0.5, 14, 0, -0.6, 2)); // the quarry floor
    for (let k = 0; k < 7; k++) blocks.push(box(1.2 + (k % 3) * 0.4, 0.9 + (k % 2) * 0.4, 1.8, -9 + k * 3, -0.1, 3 + (k % 3) * 2.2).rotateY(k * 0.37));
    g.add(mesh(faces, GRANITE, 'quarry face'), mesh(blocks, GRANITE_2, 'quarry blocks'));
    seat(g, Qd.x, Qd.z, 0, Qd.rot);
  }
  { // the sluiceway: a timber chute of two greased runners down the steep face
    const [[ax, az], [bx, bz]] = layout.slide, parts = [];
    const n = 24;
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      const y0 = data.heightAt(x0, z0), y1 = data.heightAt(x1, z1);
      parts.push({ x0, z0, x1, z1, y0, y1 });
    }
    const chute = new THREE.Group();
    chute.name = 'sled slide';
    chute.userData.build = () => {
      chute.clear();
      const ex = world.exag, logs = [];
      for (const { x0, z0, x1, z1, y0, y1 } of parts) {
        const A = new THREE.Vector3(x0, y0 * ex + 0.55, z0), B = new THREE.Vector3(x1, y1 * ex + 0.55, z1);
        const d = B.clone().sub(A), span = d.length(), mid = A.clone().add(B).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
        const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
        for (const k of [-1, 1]) logs.push(new THREE.BoxGeometry(0.3, 0.3, span + 0.1).applyQuaternion(q).translate(mid.x + side.x * k * 0.9, mid.y, mid.z + side.z * k * 0.9));
        logs.push(new THREE.BoxGeometry(2.4, 0.14, 0.3).applyQuaternion(q).translate(mid.x, mid.y - 0.18, mid.z));
      }
      chute.add(mesh(logs, WOOD, 'runners'));
    };
    group.add(chute);
    group.userData.chute = chute;
  }
  // the loading derrick beside the head of the line, on a crib of logs: a mast and a boom that
  // luffs up and down to reach the sled at the foot of the slide and each car in turn
  const BOOM = 10.5;
  const derrick = new THREE.Group();
  const mast = new THREE.Mesh(mergeGeometries([box(0.4, 11.5, 0.4, 0, 0.4, 0), box(3.2, 0.4, 0.4, 0, 0, -1.2), box(3.2, 0.4, 0.4, 0, 0, 1.2), box(0.4, 0.4, 3.2, -1.2, 0.4, 0), box(0.4, 0.4, 3.2, 1.2, 0.4, 0)]), mat(DARK_WOOD));
  const boom = new THREE.Group();
  boom.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, BOOM).translate(0, 0, BOOM / 2), mat(WOOD)));
  boom.position.y = 1.4;
  boom.rotation.order = 'YXZ';
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4).translate(0, -0.5, 0), mat('#3b2a1c'));
  const hook = new THREE.Group();
  hook.add(rope);
  const hookBlock = new THREE.Mesh(box(1.3, 0.95, 1.9, 0, 0, 0), mat(GRANITE));
  hook.add(hookBlock);
  derrick.add(mast, boom, hook);
  for (const a of [0.5, 2.6, 4.7]) { // guy lines
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 3).translate(0, 0.5, 0), mat('#3b2a1c'));
    g.userData.a = a;
    derrick.add(g);
  }
  group.add(derrick);

  // ------------------------------------------------------------------ the shed
  const S = layout.shed;
  {
    const g = new THREE.Group(), walls = [], roof = [], trim = [], brick = [], yard = [];
    walls.push(box(14, 6, 46, 0, 0, 0)); // board-and-batten finishing shed, its long side on the line
    for (const s of [-1, 1]) roof.push(new THREE.BoxGeometry(8.2, 0.3, 47.5).rotateZ(s * 0.42).translate(s * 3.6, 7.6, 0));
    roof.push(box(4, 1.3, 30, 0, 8.6, 0)); // a monitor for light over the bankers
    for (const s of [-1, 1]) roof.push(new THREE.BoxGeometry(2.6, 0.2, 31).rotateZ(s * 0.35).translate(s * 1.2, 10.2, 0));
    for (let z = -20; z <= 20; z += 5) for (const s of [-1, 1]) trim.push(box(0.14, 1.4, 1.1, s * 7.02, 2.8, z));
    trim.push(box(0.2, 3.4, 4, 7.05, 0, -14), box(0.2, 3.4, 4, 7.05, 0, 10)); // big doors to the yard and the line
    walls.push(box(8, 4.5, 9, -1, 0, 27.5)); // the engine and boiler house
    brick.push(new THREE.CylinderGeometry(0.75, 1, 15, 8).translate(1.5, 7.5, 29)); // a steam-powered shed (Martin, p. 10)
    for (let k = 0; k < 9; k++) yard.push(box(1.3 + (k % 3) * 0.35, 0.9 + (k % 2) * 0.35, 2, 11 + (k % 3) * 2.6, 0, -18 + Math.floor(k / 3) * 3.4).rotateY((k % 4) * 0.2));
    for (const z of [2, 8]) yard.push(box(1.2, 0.9, 1.2, 11, 0, z)); // bankers for dressing stone outdoors
    g.add(mesh(walls, '#8e7f6b', 'shed walls'), mesh(roof, '#5a4a40', 'shed roof'), mesh(trim, '#3f3a34', 'shed openings'), mesh(brick, '#8a4a38', 'chimney'), mesh(yard, GRANITE_2, 'stone yard'));
    g.name = 'first Saint George Red Granite Co. shed (Feb.–June 1874)';
    seat(g, S.x, S.z, -0.3, S.rot);
  }
  const smoke = Array.from({ length: 7 }, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#e8e4d8', transparent: true, opacity: 0.25, depthWrite: false }));
    group.add(m);
    return m;
  });
  const chimneyTop = () => { const [x, z] = local(S, 1.5, 29); return new THREE.Vector3(x, data.heightAt(S.x, S.z) * world.exag + 15, z); };

  // ------------------------------------------------------------------ cars, blocks and sleds
  function flatCar(brake) {
    const g = new THREE.Group(), body = [box(1.8, 0.22, 3.1, 0, 0.5, 0)], iron = [];
    for (const z of [-1.4, 1.4]) body.push(box(1.8, 0.2, 0.22, 0, 0.3, z));
    for (const z of [-1, 1]) for (const s of [-1, 1]) iron.push(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10).rotateZ(Math.PI / 2).translate(s * (GAUGE / 2), 0.32, z));
    if (brake) iron.push(box(0.08, 1.4, 0.08, 0.7, 0.72, 1.45).rotateX(0), box(0.4, 0.06, 0.06, 0.7, 2.1, 1.45)); // brake staff and wheel
    g.add(mesh(body, WOOD, 'car'), mesh(iron, IRON, 'wheels'));
    const block = new THREE.Mesh(box(1.3, 0.95, 1.9, 0, 0.72, 0), mat(GRANITE));
    g.add(block);
    g.userData.block = block;
    group.add(g);
    return g;
  }
  const cars = [flatCar(true), flatCar(false)]; // [downhill end, uphill end]
  const CAR_GAP = 3.6;
  const sled = new THREE.Group();
  {
    sled.add(mesh([box(2.2, 0.3, 3.2, 0, 0, 0), box(0.25, 0.25, 3.6, -0.8, -0.1, 0.1), box(0.25, 0.25, 3.6, 0.8, -0.1, 0.1)], DARK_WOOD, 'sled'));
    sled.userData.blocks = [0, 1].map((k) => { const b = new THREE.Mesh(box(1.25, 0.9, 1.4, 0, 0.3, k ? -0.78 : 0.78), mat(GRANITE)); sled.add(b); return b; });
    group.add(sled);
  }

  // ------------------------------------------------------------------ the people and the horse
  const TOP = 6 + CAR_GAP; // where the lead car stands to load: both cars by the platform
  const BOTTOM = L - 4;
  const DOWN_SPEED = 2.2, UP_SPEED = 1.25;
  const T_LOAD = 36, T_DOWN = (BOTTOM - TOP) / DOWN_SPEED + 6, T_UNLOAD = 28, T_UP = (BOTTOM - TOP) / UP_SPEED + 4;
  const PERIOD = T_LOAD + T_DOWN + T_UNLOAD + T_UP;
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
  const state = { s: TOP, phase: 'load', u: 0 };
  function phaseAt(t) {
    let c = t % PERIOD;
    if (c < T_LOAD) return { phase: 'load', u: c / T_LOAD, s: TOP };
    c -= T_LOAD;
    if (c < T_DOWN) { // roll away gently, run at an even pace under the brake, ease into the yard
      const u = c / T_DOWN, a = 3 / T_DOWN; // 3 s either end to get going and to stop
      const f = u < a ? (u * u) / (2 * a) : u > 1 - a ? 1 - a - ((1 - u) * (1 - u)) / (2 * a) + a / 2 : u - a / 2;
      return { phase: 'down', u, s: TOP + (BOTTOM - TOP) * (f / (1 - a)) };
    }
    c -= T_DOWN;
    if (c < T_UNLOAD) return { phase: 'unload', u: c / T_UNLOAD, s: BOTTOM };
    c -= T_UNLOAD;
    const u = c / T_UP;
    return { phase: 'up', u, s: BOTTOM - (BOTTOM - TOP) * ease(u) };
  }
  const carPose = (obj, s) => {
    const p = pointAt(s), t = tangentAt(s), ex = world.exag;
    obj.position.set(p.x, railAt(s) * ex + 0.06, p.z);
    obj.rotation.set(0, 0, 0);
    obj.rotation.order = 'YXZ';
    obj.rotation.y = Math.atan2(t.x, t.z);
    obj.rotation.x = -Math.atan2((railAt(s + 1) - railAt(s - 1)) * ex, 2);
  };
  const beside = (s, side) => { // a point on the path beside the line
    const p = pointAt(s), t = tangentAt(s);
    return [p.x + t.z * side, p.z - t.x * side];
  };

  const horse = life.horse({ harness: true, walking: true, y: (h) => h.ty }); // legs are paced by how far it really moves
  const lad = life.person('boy', { action: 'idle', y: (f) => f.ty });
  const brakeman = life.person('quarryman', { action: 'idle', move: life.rideOn(cars[0], 0.45, 0.72, 1.1, Math.PI), y: life.rideY });
  const derrickMan = life.person('quarryman', { action: 'haul', y: (f) => f.ty });
  const slideMan = life.person('quarryman', { action: 'guide', y: (f) => f.ty });
  const quarrymen = [
    life.person('quarryman', { action: 'strike', tool: 'sledge', phase: 0, y: (f) => f.ty }),
    life.person('quarryman', { action: 'pry', tool: 'crowbar', y: (f) => f.ty }),
  ];
  const cutters = [0, 1].map(() => life.person('stonecutter', { action: 'chisel', tool: 'chisel', y: (f) => f.ty }));
  const stand = (f, x, z, heading, lift = 0) => { f.x = x; f.z = z; f.heading = heading; f.ty = data.heightAt(x, z) * world.exag + lift; };
  const faceTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

  let clock = 0;
  function update(dt) {
    if (!group.visible) return;
    clock += dt;
    const ph = phaseAt(clock);
    Object.assign(state, ph);
    const ex = world.exag;
    // cars: the lead car heads downhill, the second is coupled behind it
    carPose(cars[0], ph.s);
    carPose(cars[1], ph.s - CAR_GAP);
    // loads: loaded at the platform one by one, taken off in the yard
    const loaded = ph.phase === 'down' ? [true, true] : ph.phase === 'unload' ? [ph.u < 0.4, ph.u < 0.75] : ph.phase === 'up' ? [false, false] : [ph.u > 0.95, ph.u > 0.47];
    cars.forEach((c, k) => { c.userData.block.visible = loaded[k]; });
    brakeman.action = ph.phase === 'down' ? 'pry' : ph.phase === 'up' ? 'sit' : 'idle';

    // The horse: hitched ahead of the empties going up. At the top it steps off the line, follows
    // the loaded cars down on the path beside it, and steps back onto the line to be hitched.
    const HITCH = CAR_GAP + 4.2; // from the lead car's mark to the horse's
    const hs = ph.phase === 'up' || ph.phase === 'down' ? ph.s - HITCH : ph.phase === 'unload' ? BOTTOM - HITCH : TOP - HITCH;
    const sm = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const aside = ph.phase === 'load' ? sm(0, 0.15, ph.u) : ph.phase === 'down' ? 1 : ph.phase === 'unload' ? 1 - sm(0.75, 1, ph.u) : 0;
    const [hx, hz] = beside(hs, -4.5 * aside);
    const ht = tangentAt(hs);
    horse.x = hx; horse.z = hz;
    const downhill = ph.phase === 'down' || (ph.phase === 'load' && ph.u > 0.9) || (ph.phase === 'unload' && ph.u < 0.7);
    horse.heading = downhill ? Math.atan2(ht.x, ht.z) : Math.atan2(-ht.x, -ht.z);
    horse.harness = true;
    horse.ty = THREE.MathUtils.lerp(railAt(hs) * ex - 0.3, data.heightAt(hx, hz) * ex, aside);
    const [lx, lz] = beside(hs + (downhill ? 1.2 : -1.5), -1.4 - 4.5 * aside);
    stand(lad, lx, lz, horse.heading);
    lad.action = ph.phase === 'up' || ph.phase === 'down' ? 'lead' : 'idle';

    // the derrick swings each block from the sled at the foot of the slide onto a car
    const [sx, sz] = layout.slide[1];
    const mx = P.x - dir[1] * 6.5, mz = P.z + dir[0] * 6.5; // the mast stands beside the line
    const baseY = data.heightAt(mx, mz) * ex;
    derrick.position.set(mx, baseY, mz);
    // where the hook goes: [x, z, height of the block's underside]
    const sledAt = [sx, sz, data.heightAt(sx, sz) * ex + 1.1];
    const carAt = (k) => { const c = cars[k].position; return [c.x, c.z, c.y + 0.72]; };
    let from = sledAt, to = sledAt, turn = 0, low = 0, carry = false;
    if (ph.phase === 'load') {
      const k = ph.u < 0.5 ? 1 : 0, u = (ph.u % 0.5) * 2; // second car first, then the lead car
      to = carAt(k);
      turn = u < 0.3 ? 0 : u < 0.7 ? ease((u - 0.3) / 0.4) : 1;
      low = u < 0.15 ? u / 0.15 : u < 0.3 ? 1 - (u - 0.15) / 0.15 : u < 0.7 ? 0 : u < 0.9 ? (u - 0.7) / 0.2 : 1 - (u - 0.9) / 0.1;
      carry = u > 0.15 && u < 0.9;
    }
    let da = faceTo(mx, mz, to[0], to[1]) - faceTo(mx, mz, from[0], from[1]);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    boom.rotation.y = faceTo(mx, mz, from[0], from[1]) + da * turn;
    const reach = THREE.MathUtils.lerp(Math.hypot(from[0] - mx, from[1] - mz), Math.hypot(to[0] - mx, to[1] - mz), turn);
    boom.rotation.x = -Math.acos(THREE.MathUtils.clamp(reach / BOOM, 0.2, 0.98)); // luff to reach
    const tip = new THREE.Vector3(0, 0, BOOM).applyEuler(boom.rotation).add(boom.position);
    const seatY = THREE.MathUtils.lerp(from[2], to[2], turn) - baseY; // the block's underside when set down
    const drop = Math.max(0.6, tip.y - (seatY + 1.0 + 2.8 * (1 - low))); // hoisted 2.8 m clear, lowered to seat
    hook.position.set(tip.x, tip.y - drop, tip.z);
    rope.scale.y = drop;
    rope.position.y = drop;
    hookBlock.visible = carry;
    hookBlock.position.y = -1.0;
    for (const g of derrick.children) if (g.userData.a !== undefined) { // guys run from the masthead to stakes around it
      const a = g.userData.a, dx = Math.cos(a) * 14, dz = Math.sin(a) * 14, top = new THREE.Vector3(0, 11, 0), foot = new THREE.Vector3(dx, -3, dz);
      g.position.copy(top); g.scale.y = top.distanceTo(foot);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.sub(top).normalize());
    }
    stand(derrickMan, mx + dir[0] * 2.4 - dir[1] * 1.5, mz + dir[1] * 2.4 + dir[0] * 1.5, faceTo(mx, mz, P.x, P.z), 0);
    derrickMan.action = ph.phase === 'load' ? 'haul' : 'idle';

    // the sled: hauled back up empty while the cars run down, loaded in the quarry, eased down the
    // slide while the horse brings the empties up, and waiting at the foot when the cars arrive
    const [[ax, az], [bx, bz]] = layout.slide;
    let v = 1, full = [true, true];
    if (ph.phase === 'load') full = [ph.u < 0.08, ph.u < 0.58]; // the derrick takes one, then the other
    else if (ph.phase === 'down') { v = 1 - ease(Math.min(1, ph.u * 1.6)); full = [false, false]; }
    else if (ph.phase === 'unload') { v = 0; full = [ph.u > 0.4, ph.u > 0.7]; }
    else v = ease(Math.min(1, ph.u * 1.15));
    const slx = ax + (bx - ax) * v, slz = az + (bz - az) * v;
    sled.position.set(slx, data.heightAt(slx, slz) * ex + 0.8, slz);
    sled.rotation.order = 'YXZ';
    sled.rotation.y = Qd.rot;
    sled.rotation.x = -Math.atan2((data.heightAt(bx, bz) - data.heightAt(ax, az)) * ex, Math.hypot(bx - ax, bz - az));
    sled.userData.blocks.forEach((b, k) => { b.visible = full[k]; });
    const moving = ph.phase === 'down' || ph.phase === 'up';
    const [gx, gz] = [slx - dir[1] * 2.2, slz + dir[0] * 2.2];
    stand(slideMan, gx, gz, ph.phase === 'down' ? Qd.rot + Math.PI : Qd.rot);
    slideMan.action = moving && v > 0.02 && v < 0.98 ? 'walk' : 'idle';
    slideMan.speed = 0.6;

    // in the quarry and the yard
    const [q1x, q1z] = local(Qd, -4, -3), [q2x, q2z] = local(Qd, 5, 1);
    stand(quarrymen[0], q1x, q1z, Qd.rot + Math.PI, -0.4);
    stand(quarrymen[1], q2x, q2z, Qd.rot + Math.PI * 0.8, -0.4);
    [[2, 1], [8, -1]].forEach(([z, s], k) => { const [x0, z0] = local(S, 11 + s * 1.3, z); stand(cutters[k], x0, z0, S.rot + (s > 0 ? -Math.PI / 2 : Math.PI / 2)); });
    const top = chimneyTop();
    smoke.forEach((m, i) => {
      const age = (clock * 0.12 + i / smoke.length) % 1;
      m.position.set(top.x + age * 9, top.y + age * 14, top.z - age * 4);
      m.scale.setScalar(0.8 + age * 3.5);
      m.material.opacity = (1 - age) * 0.3;
    });
  }

  function refresh() {
    buildTrack();
    group.userData.chute.userData.build();
    reseat();
    update(0);
  }
  refresh();

  const mid = pointAt(L * 0.08);
  return {
    group, update, refresh, state,
    length: L,
    /** a view of the platform and the head of the line */
    location: new THREE.Vector3(mid.x, 0, mid.z),
    restart() { clock = 0; update(0); },
  };
}
