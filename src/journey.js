// "The Stone's Journey": a block of red granite from the Bay of Fundy Red Granite Co.'s quarry to a
// schooner bound for Boston, summer 1874. Thirteen steps, each with a caption and its source.
//
// Nothing moves on its own: every hand-off is done by someone or something you can see. A horse
// derrick lifts the block onto a sled, a team drags the sled to the canal, men on shear legs swing
// it onto a scow, polers bring the scow down to the mill, another pair of shear legs and a team
// take it into the mill, men roll the finished column out to the lathe and up skids onto a wagon,
// and the schooner's own tackle swings it aboard.
//
// When the journey isn't playing, its props and crews wait at their places as part of the scene.
import * as THREE from 'three';

const MARTIN = 'Martin (2013), The Granite Industry of Southwestern New Brunswick';
const OHALLORAN = "O'Halloran (1968), History of the Granite Industry in St. George";

// A path over the map: arc-length positions and headings along a smoothed polyline of [x, z].
class Path {
  constructor(pts) {
    this.curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.length = this.curve.getLength();
  }
  at(u) {
    u = Math.min(Math.max(u, 0), 1);
    const p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
    return { x: p.x, z: p.z, heading: Math.atan2(t.x, t.z) };
  }
}
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const span = (t, a, b) => clamp01((t - a) / (b - a)); // 0..1 over the part of a step from a to b
const lerp = (a, b, t) => a + (b - a) * t;
// Horse teams move at a walk. A route too long to walk in its step's time gets a cut: the team
// walks off, the picture dips to paper for a moment, and the team walks the last stretch in.
const TEAM_WALK = 1.8; // m/s
const RAMP = 0.12; // share of a stretch spent starting or stopping
const walkIn = (t) => { const v = 1 / (1 - RAMP / 2); return t < RAMP ? (v * t * t) / (2 * RAMP) : v * (t - RAMP / 2); }; // from rest, ends walking
const walkOut = (t) => 1 - walkIn(1 - t); // arrives walking, ends at rest
const cruise = (t) => (t < 0.5 ? walkIn(t * 2) : 1 + walkOut(t * 2 - 1)) / 2; // start, walk steadily, stop
const DIP = 0.07; // half-width of the dip to paper, as a share of the step
function travel(t, len, seconds) {
  if (len <= TEAM_WALK * seconds * 0.85) return { u: cruise(t), fade: 0, side: 0 };
  const shown = (TEAM_WALK * seconds * 0.42) / len; // share of the route seen at each end
  const fade = 1 - Math.min(1, Math.abs(t - 0.5) / DIP);
  return t < 0.5 ? { u: shown * walkIn(t / 0.5), fade: fade * fade * (3 - 2 * fade), side: 0 }
    : { u: 1 - shown * (1 - walkOut((t - 0.5) / 0.5)), fade: fade * fade * (3 - 2 * fade), side: 1 };
}
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const unit = (ax, az, bx, bz) => { const d = Math.hypot(bx - ax, bz - az) || 1; return [(bx - ax) / d, (bz - az) / d]; };

export function buildJourney({ scene, camera, controls, data, world, life, setTide }) {
  const { meta } = data;
  const S = meta.structures, R = meta.route;
  const exag = () => world.exag;
  const hAt = (x, z) => data.heightAt(x, z);            // metres, no exaggeration
  const groundAt = (x, z) => hAt(x, z) * exag();         // world y
  const toon = world.toon;
  const wood = new THREE.MeshToonMaterial({ color: '#6b4a2e', gradientMap: toon });
  const ropeMat = new THREE.MeshToonMaterial({ color: '#3b2a1c', gradientMap: toon });

  // ---- props
  const P = world.props;
  const block = P.block(), column = P.column(), scow = P.scow(), wagon = P.wagon(), truck = P.wagon(), schooner = P.schooner();
  const group = new THREE.Group();
  group.name = 'journey';
  scene.add(group);
  group.add(block, column, scow, wagon, truck, schooner);
  truck.name = 'stone truck';
  column.rotation.order = 'YXZ'; // turn to face its heading first, then spin about its own long axis
  const AXIS = 0.45; // the column's axis above whatever it rests on

  // a stone sled: two runners and a plank deck (the block sits on it; its top is 0.4 m up)
  const sled = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 4.2).translate(0, 0.3, 0), wood);
  sled.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4.6).translate(-1.05, 0.12, 0.1), wood), new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4.6).translate(1.05, 0.12, 0.1), wood));
  sled.name = 'sled';
  group.add(sled);

  // a rope between two points, redrawn every frame
  const ropes = [];
  function rope() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), ropeMat);
    group.add(m);
    ropes.push(m);
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    return (a, b) => {
      d.subVectors(b, a);
      const L = d.length();
      m.visible = L > 0.05;
      m.position.addVectors(a, b).multiplyScalar(0.5);
      m.scale.set(1, L, 1);
      m.quaternion.setFromUnitVectors(up, d.normalize());
    };
  }
  // shear legs: two spars leaning out over the water from the bank, lashed at the top
  function shearLegs(bank, water, height = 9.5) {
    const g = new THREE.Group();
    const legs = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 6), wood); g.add(m); return m; });
    group.add(g);
    const apex = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    const guy = rope();
    const place = () => {
      const [ux, uz] = unit(bank[0], bank[1], water[0], water[1]);
      const ax = bank[0] + ux * 3.2, az = bank[1] + uz * 3.2;
      apex.set(ax, groundAt(bank[0], bank[1]) + height, az);
      [-1, 1].forEach((s, k) => {
        const fx = bank[0] - uz * s * 2.4 - ux * 1.2, fz = bank[1] + ux * s * 2.4 - uz * 1.2;
        const foot = new THREE.Vector3(fx, groundAt(fx, fz), fz);
        d.subVectors(apex, foot);
        legs[k].position.addVectors(apex, foot).multiplyScalar(0.5);
        legs[k].scale.set(1, d.length() + 0.6, 1);
        legs[k].quaternion.setFromUnitVectors(up, d.normalize());
      });
      const bx = bank[0] - ux * 9, bz = bank[1] - uz * 9; // the back guy, pegged into the bank
      guy(apex, new THREE.Vector3(bx, groundAt(bx, bz), bz));
    };
    place();
    return { apex, place };
  }
  // log rollers under a load
  const rollers = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8).rotateZ(Math.PI / 2), wood); m.rotation.order = 'YXZ'; group.add(m); return m; });
  // the lathe: two iron-shod stands the column turns between, and a trough of Lake Utopia sand
  const lathe = new THREE.Group();
  lathe.name = 'lathe';
  for (const s of [-1, 1]) lathe.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.9).translate(s * 2.75, 0.7, 0), new THREE.MeshToonMaterial({ color: '#5a5a5e', gradientMap: toon })));
  lathe.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 1.2).translate(0, 0.18, 0), new THREE.MeshToonMaterial({ color: '#e8dcc0', gradientMap: toon })));
  group.add(lathe);
  // skids: two planks from the ground up to the wagon bed
  const skids = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 1).translate(0, 0, 0.5), wood); group.add(m); return m; });

  // ---- where everything happens

  // The quarry: the horse derrick picks the block up by the face and sets it on the sled.
  const Q = S.quarry, qrot = Q.rot;
  const qf = (lx, lz) => [Q.x + lx * Math.cos(qrot) + lz * Math.sin(qrot), Q.z - lx * Math.sin(qrot) + lz * Math.cos(qrot)];
  const derrick = life?.derrick ?? null;
  const dLocal = [6, 2]; // where life.js puts the derrick, in the quarry's frame
  const swing0 = Math.atan2(-6 - dLocal[0], -1 - dLocal[1]);  // toward the foot of the face
  const swing1 = Math.atan2(-2 - dLocal[0], 13 - dLocal[1]);  // out over the quarry floor
  const P0 = derrick ? derrick.hookXZ(swing0) : qf(-6, -1);
  const S0 = derrick ? derrick.hookXZ(swing1) : qf(-2, 13);

  // The canal landing: walk from the canal toward the quarry until the ground rises out of the water.
  const L = S.quarry.landing;
  const canalLevel = (() => { const w = data.inlandWaterAt(L[0], L[1]); return Number.isNaN(w) ? 11.7 : w; })();
  const [lqx, lqz] = unit(L[0], L[1], Q.x, Q.z);
  let bank1 = L;
  for (let d = 0; d < 120; d += 1) { const x = L[0] + lqx * d, z = L[1] + lqz * d; if (hAt(x, z) > canalLevel + 0.4) { bank1 = [x, z]; break; } }
  const LB = [bank1[0] + lqx * 3, bank1[1] + lqz * 3];       // shear legs and the sled's stop, on the bank
  const berth1 = [bank1[0] - lqx * 6, bank1[1] - lqz * 6];   // the scow, alongside
  const SL = [LB[0] + lqx * 6, LB[1] + lqz * 6];             // where the sled stops, its team still on the bank

  // The mill landing: the bank of the millpond nearest the mill's west door, clear of the Gorge.
  const M = S.mill, max = Math.sin(M.rot), maz = Math.cos(M.rot);
  const westDoor = [M.x - max * 44, M.z - maz * 44], eastDoor = [M.x + max * 44, M.z + maz * 44];
  const lvl = S.dam?.level ?? 8.7;
  const routeEnd = R.scow[R.scow.length - 1];
  const gorgeDist = (x, z) => Math.min(...meta.gorge.map(([gx, gz]) => Math.hypot(gx - x, gz - z)));
  let MB = null, berth2 = routeEnd;
  {
    let best = Infinity;
    for (let dx = -70; dx <= 70; dx += 2) for (let dz = -70; dz <= 70; dz += 2) {
      const x = westDoor[0] + dx, z = westDoor[1] + dz;
      const h = hAt(x, z);
      if (h < lvl + 0.6 || h > lvl + 6 || gorgeDist(x, z) < 18) continue;
      const [ux, uz] = unit(x, z, routeEnd[0], routeEnd[1]);
      const wx = x + ux * 10, wz = z + uz * 10;
      if (hAt(wx, wz) > lvl - 0.8 || gorgeDist(wx, wz) < 22) continue;
      const score = Math.hypot(dx, dz);
      if (score < best) { best = score; MB = [x, z]; berth2 = [x + ux * 11, z + uz * 11]; }
    }
    if (!MB) MB = [westDoor[0] - max * 12, westDoor[1] - maz * 12];
  }

  // Scow route: alongside at the canal landing, through the canal, down the river, across the
  // millpond to the mill landing. Its water level is carried along the route (the grid near the
  // Gorge reads as tidal, but the millpond sits at the dam's level).
  const scowPath = new Path([berth1, ...R.scow.slice(1), berth2]);
  const scowLevel = (() => {
    const n = 240, out = new Float32Array(n + 1);
    let last = canalLevel;
    for (let k = 0; k <= n; k++) {
      const p = scowPath.at(k / n), w = data.inlandWaterAt(p.x, p.z);
      if (!Number.isNaN(w) && gorgeDist(p.x, p.z) > 40) last = w;
      out[k] = k / n > 0.9 ? Math.max(Math.min(last, lvl + 3), lvl) : last;
    }
    return (u) => { const f = clamp01(u) * n, i = Math.floor(f), a = f - i; return lerp(out[i], out[Math.min(n, i + 1)], a); };
  })();
  const scowAt = (u) => { const p = scowPath.at(u); return { ...p, y: scowLevel(u) * exag() }; };

  // The mill: a truck brings the block up from the landing and in at the west door; the finished
  // column comes out of the east door, turns on the lathe beside the waiting wagon, and goes up
  // the skids onto it.
  const [mdx, mdz] = unit(MB[0], MB[1], westDoor[0], westDoor[1]);
  // cameras at the mill landing look back from out over the millpond (the Gorge is the other way)
  const overPond = (() => { const [ux, uz] = unit(MB[0], MB[1], berth2[0], berth2[1]); return Math.atan2(ux, uz); })();
  const truckStart = [MB[0] + mdx * 7, MB[1] + mdz * 7];
  const truckPath = new Path([truckStart, [lerp(truckStart[0], westDoor[0], 0.5), lerp(truckStart[1], westDoor[1], 0.5)], westDoor, [westDoor[0] + max * 16, westDoor[1] + maz * 16]]);
  const cartPath = new Path(R.cart);
  const c0 = cartPath.at(0);
  // the lathe stands beside the wagon, on whichever side leaves room to roll the column out to it
  let side = [Math.cos(c0.heading), -Math.sin(c0.heading)];
  if (Math.hypot(c0.x + side[0] * 5.5 - eastDoor[0], c0.z + side[1] * 5.5 - eastDoor[1]) < Math.hypot(c0.x - side[0] * 5.5 - eastDoor[0], c0.z - side[1] * 5.5 - eastDoor[1])) side = [-side[0], -side[1]];
  const latheAt = [c0.x + side[0] * 5.5, c0.z + side[1] * 5.5];

  // The wharf: the schooner lies alongside the end of the main wharf.
  const W = S.wharf;
  const wdir = [Math.sin(W.rot), Math.cos(W.rot)], wside = [wdir[1], -wdir[0]];
  const berth = [W.x + wdir[0] * W.length * 0.7 + wside[0] * 12, W.z + wdir[1] * W.length * 0.7 + wside[1] * 12];
  const sea = R.schooner;
  let k0 = 0;
  sea.forEach((p, k) => { if (Math.hypot(p[0] - berth[0], p[1] - berth[1]) < Math.hypot(sea[k0][0] - berth[0], sea[k0][1] - berth[1])) k0 = k; });
  const seaPath = new Path([berth, [berth[0] + wdir[0] * 40, berth[1] + wdir[1] * 40], ...sea.slice(k0 + 3)]);
  // the road surface: the ground, or the wharf's plank deck where the wagon drives out onto it
  const deckTop = () => (meta.highWater + 1.6) * exag() + 0.6;
  const roadAt = (x, z) => {
    const along = (x - W.x) * wdir[0] + (z - W.z) * wdir[1], across = (x - W.x) * wside[0] + (z - W.z) * wside[1];
    const onWharf = along > -2 && along < W.length + 1 && Math.abs(across) < W.width / 2 + 0.5;
    return onWharf ? Math.max(groundAt(x, z), deckTop()) : groundAt(x, z);
  };
  const rs = S.redStoreWharf;
  let redU = 0.3;
  { let best = Infinity; for (let u = 0; u <= 1; u += 0.002) { const p = seaPath.at(u); const d = Math.hypot(p.x - rs.x, p.z - rs.z); if (d < best) { best = d; redU = u; } } }

  // shear legs at both landings, and the ropes that work them
  const shears1 = shearLegs(LB, berth1), shears2 = shearLegs(MB, berth2);
  const fall1 = rope(), fall2 = rope(), tackle = rope(), derrickSling = rope();

  // ---- placing things
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  const put = (obj, x, y, z, heading = obj.rotation.y) => { obj.position.set(x, y, z); obj.rotation.y = heading; };
  const sledTo = (x, z, heading) => put(sled, x, groundAt(x, z), z, heading);
  const blockOn = (obj, top, heading = obj.rotation.y) => put(block, obj.position.x, obj.position.y + top, obj.position.z, heading);
  const deckOf = () => schooner.localToWorld(V2.set(0, 2.4 + AXIS, -1)).clone();
  const hang = (fall, from, obj, top) => fall(from, V.set(obj.position.x, obj.position.y + top, obj.position.z));
  const idleFall = (fall, apex) => fall(apex, V.copy(apex).add(new THREE.Vector3(0, -3, 0)));
  const rollersUnder = (x, y, z, heading, travelled, show = true) => {
    rollers.forEach((r, k) => {
      r.visible = show;
      const off = (k - 1) * 1.6;
      put(r, x + Math.sin(heading) * off, y + 0.2, z + Math.cos(heading) * off, heading);
      r.rotation.x = travelled / 0.2;
    });
  };
  const hideRollers = () => rollers.forEach((r) => { r.visible = false; });
  const placeSkids = (on) => {
    skids.forEach((s, k) => {
      s.visible = on;
      const off = (k ? 1 : -1) * 1.4;
      const ax = latheAt[0] + Math.sin(c0.heading) * off, az = latheAt[1] + Math.cos(c0.heading) * off;
      const bx = c0.x + side[0] * 1.1 + Math.sin(c0.heading) * off, bz = c0.z + side[1] * 1.1 + Math.cos(c0.heading) * off;
      const a = new THREE.Vector3(ax, groundAt(ax, az) + 0.1, az), b = new THREE.Vector3(bx, groundAt(c0.x, c0.z) + 1.35, bz);
      s.position.copy(a);
      s.scale.set(1, 1, a.distanceTo(b));
      s.lookAt(b);
    });
  };
  const releaseDerrick = () => { if (derrick) derrick.control = null; };
  const rope0 = (fall) => fall(V.set(0, -999, 0), V2.set(0, -999, 0.01)); // hide a rope out of sight

  // ---- the crews
  const state = { step: -1, t: 0, playing: false, speed: 1, fade: 0, onChange: () => {} };
  let lastSide = 0, sideStep = -1;
  const at = (k) => state.step === k;
  const running = { derrick: false, fall1: false, fall2: false, tackle: false };
  if (life) {
    const person = life.person;
    // The scow's polers walk the pole, one each side, taking turns: plant it by the bow, lean on
    // it and walk aft as fast as the scow goes (so he stays over the same spot of river bottom
    // while the boat slides on under him), then walk back to the bow with the pole trailing.
    const BOW = 5.5, STERN = -5;
    const scowWas = new THREE.Vector3(), scowV = { speed: 0, frame: -1 };
    const PV = new THREE.Vector3();
    [[-2.3, BOW, true], [2.3, 0.5, false]].forEach(([lx, lz0, push0], k) => {
      const st = { lz: lz0, push: push0 };
      person('quarryman', { tool: 'pole', y: life.rideY, move: (f, dt) => {
        if (k === 0) { // once a frame: how fast the scow is going
          const d = scowWas.distanceTo(scow.position);
          scowV.speed = d > 20 || dt <= 0 ? 0 : scowV.speed + (d / dt - scowV.speed) * Math.min(1, dt * 4);
          scowWas.copy(scow.position);
        }
        const going = scow.visible && scowV.speed > 0.15;
        const was = st.lz;
        if (going) {
          if (st.push) { st.lz -= Math.min(Math.max(scowV.speed, 0.5), 1.4) * dt; if (st.lz <= STERN) st.push = false; }
          else { st.lz += 1.3 * dt; if (st.lz >= BOW) st.push = true; }
        }
        f.onDeck = Math.abs(st.lz - was);
        scow.updateMatrixWorld();
        PV.set(lx, 1.4, st.lz).applyMatrix4(scow.matrixWorld);
        f.x = PV.x; f.z = PV.z; f.rideY = PV.y;
        f.heading = scow.rotation.y + (st.push ? Math.PI : 0); // pushing, he faces aft
        f.hidden = !scow.visible;
        f.poleOut = (lx < 0 ? 1 : -1) * (st.push ? 1 : -1); // which of his hands is the water side
        const want = going ? (st.push ? 'polePush' : 'poleCarry') : 'idle';
        if (f.action !== want) { f.action = want; life.crowd.setTool(f, going ? 'pole' : null); }
      } });
    });
    // at the quarry: a man steadies the block on the fall. He walks at a steady pace from the face
    // to the sled while the boom swings (the block itself swings faster than a man walks), and stays
    // at the quarry when the sled leaves.
    const beside = (x, z) => [x - Math.cos(qrot) * 2.6, z + Math.sin(qrot) * 2.6];
    person('quarryman', { move: (f) => {
      const u = state.step > 0 ? 1 : at(0) ? span(state.t, 0.3, 0.88) : 0;
      const w = u * u * (3 - 2 * u) * 0.3 + u * 0.7; // start and stop gently
      [f.x, f.z] = beside(lerp(P0[0], S0[0], w), lerp(P0[1], S0[1], w));
      f.heading = Math.atan2(block.position.x - f.x, block.position.z - f.z);
      f.action = at(0) && state.t > 0.12 && state.t < 0.92 ? 'guide' : 'idle';
    } });
    // the sled team and its teamster
    for (const sx of [-0.6, 0.6]) life.horse({ harness: true, move: life.rideOn(sled, sx, 0, 4.7), y: life.rideY, walking: (h) => h.moving });
    const teamster = life.rideOn(sled, 2.3, 0, 3.4);
    person('quarryman', { hat: 'straw', move: (f, dt) => { teamster(f, dt); f.action = f.moving ? 'lead' : 'idle'; f.speed = 1.5; }, y: (f) => groundAt(f.x, f.z) });
    // two crews on the shear legs: two men haul the fall, one steadies the load
    const shearCrew = (bank, water, key, busy) => {
      const [ux, uz] = unit(bank[0], bank[1], water[0], water[1]);
      for (const s of [-1, 1]) {
        const x = bank[0] - ux * 5 + uz * s * 1.2, z = bank[1] - uz * 5 - ux * s * 1.2;
        person('quarryman', { x, z, heading: Math.atan2(ux, uz) + Math.PI, move: (f) => { f.action = running[key] ? 'haul' : 'idle'; } });
      }
      const gx = bank[0] + uz * 3, gz = bank[1] - ux * 3;
      person('quarryman', { x: gx, z: gz, move: (f) => {
        f.heading = Math.atan2(block.position.x - gx, block.position.z - gz);
        f.action = busy() ? 'guide' : 'idle';
      } });
    };
    shearCrew(LB, berth1, 'fall1', () => at(2));
    shearCrew(MB, berth2, 'fall2', () => at(5));
    // the truck's team and driver
    for (const sx of [-0.62, 0.62]) life.horse({ harness: true, move: life.rideOn(truck, sx, 0, 5.4), y: life.rideY, walking: (h) => h.moving });
    person('townsman', { action: 'drive', tool: 'reins', move: life.rideOn(truck, 0, 1.3, 1.9), y: life.rideY });
    // two men who roll the column out of the mill and up the skids; a polisher at the lathe
    for (const s of [-1, 1]) {
      person('stonecutter', { move: (f) => {
        const cx = column.position.x, cz = column.position.z;
        const moving = (at(7) && state.t < 0.45) || (at(8) && state.t < 0.95);
        if (at(8)) { // behind the column, pushing it toward the wagon
          f.x = cx - side[0] * 1.3 + Math.sin(c0.heading) * s * 1.2; f.z = cz - side[1] * 1.3 + Math.cos(c0.heading) * s * 1.2;
          f.heading = Math.atan2(side[0], side[1]);
        } else if (at(7) && state.t < 0.45) {
          const [ux, uz] = unit(eastDoor[0], eastDoor[1], latheAt[0], latheAt[1]);
          f.x = cx - ux * 1.4 + uz * s * 1.2; f.z = cz - uz * 1.4 - ux * s * 1.2;
          f.heading = Math.atan2(ux, uz);
        } else {
          f.x = latheAt[0] - side[0] * 3 + Math.sin(c0.heading) * s * 2.5; f.z = latheAt[1] - side[1] * 3 + Math.cos(c0.heading) * s * 2.5;
          f.heading = Math.atan2(side[0], side[1]);
        }
        f.moving = moving;
        f.action = moving && state.playing ? 'push' : 'idle';
      } });
    }
    person('stonecutter', { move: (f) => {
      f.x = latheAt[0] + side[0] * 1.3; f.z = latheAt[1] + side[1] * 1.3;
      f.heading = Math.atan2(-side[0], -side[1]);
      f.action = at(7) && state.t > 0.45 ? 'polish' : 'idle';
    } });
    // on the wharf, a stevedore steadies the column on the tackle
    const wEnd = R.cart[R.cart.length - 1];
    person('sailor', { move: (f) => {
      f.x = wEnd[0] + wside[0] * 3.5; f.z = wEnd[1] + wside[1] * 3.5;
      f.heading = Math.atan2(column.position.x - f.x, column.position.z - f.z);
      f.action = at(10) && state.t < 0.6 ? 'guide' : 'idle';
    }, y: (f) => (meta.highWater + 1.6) * exag() + 0.6 });
    // hands on the schooner: one hauls the tackle, one at the wheel, one forward
    const hauler = life.rideOn(schooner, -1.3, 2.4, 3.2, Math.PI / 2);
    life.person('sailor', { move: (f, dt) => { hauler(f, dt); f.action = running.tackle || !at(10) ? 'haul' : 'idle'; }, y: life.rideY });
    life.person('sailor', { action: 'idle', move: life.rideOn(schooner, 1.4, 2.4, -9.5), y: life.rideY });
    life.person('sailor', { action: 'idle', move: life.rideOn(schooner, 0.9, 2.4, 10, Math.PI), y: life.rideY });
    // the wagon's team and driver
    for (const sx of [-0.62, 0.62]) life.horse({ harness: true, move: life.rideOn(wagon, sx, 0, 5.4), y: life.rideY, walking: (h) => h.moving });
    person('townsman', { action: 'drive', tool: 'reins', move: life.rideOn(wagon, 0, 1.3, 1.9), y: life.rideY });
  }

  // ---- resting places
  function rest() {
    releaseDerrick();
    for (const k of Object.keys(running)) running[k] = false;
    put(block, P0[0], groundAt(P0[0], P0[1]), P0[1], qrot + 0.3);
    block.visible = true;
    const [sx, sz] = unit(S0[0], S0[1], SL[0], SL[1]);
    sledTo(S0[0], S0[1], Math.atan2(sx, sz));
    const s0 = scowAt(0);
    put(scow, s0.x, s0.y, s0.z, s0.heading);
    const t0 = truckPath.at(0);
    put(truck, t0.x, groundAt(t0.x, t0.z), t0.z, t0.heading);
    put(wagon, c0.x, groundAt(c0.x, c0.z), c0.z, c0.heading);
    put(schooner, berth[0], world.tide * exag(), berth[1], W.rot);
    schooner.userData.setSails(false);
    put(lathe, latheAt[0], groundAt(latheAt[0], latheAt[1]), latheAt[1], c0.heading + Math.PI / 2);
    column.visible = false; column.rotation.x = 0;
    hideRollers(); placeSkids(false);
    shears1.place(); shears2.place();
    idleFall(fall1, shears1.apex); idleFall(fall2, shears2.apex);
    rope0(tackle); rope0(derrickSling);
  }

  // ---- the steps
  const steps = [
    {
      title: 'The quarry', seconds: 13, source: OHALLORAN,
      text: 'Summer 1874, north of the canal. Quarrymen have split a block from the ledge. The horse derrick lifts it: the horse walks round the capstan, winding up the rope, and the boom swings the block onto a wooden sled.',
      update(t) {
        const g0 = groundAt(P0[0], P0[1]), g1 = groundAt(S0[0], S0[1]);
        const [sx, sz] = unit(S0[0], S0[1], SL[0], SL[1]);
        sledTo(S0[0], S0[1], Math.atan2(sx, sz));
        // hook down to the block, lift, swing, lower onto the sled, hook back up
        const down = span(t, 0, 0.14), lift = ease(span(t, 0.2, 0.42)), swing = ease(span(t, 0.44, 0.7)), lower = ease(span(t, 0.72, 0.9)), up = span(t, 0.92, 1);
        const sw = lerpAngle(swing0, swing1, swing);
        const [hx, hz] = derrick ? derrick.hookXZ(sw) : [lerp(P0[0], S0[0], swing), lerp(P0[1], S0[1], swing)];
        const baseTop = lerp(g0, g1 + 0.4, swing) + 1.8;
        let hookY = baseTop + 6 * lift - lerp(0, 6, lower);
        if (t < 0.14) hookY = baseTop + 7 * (1 - down);
        if (t > 0.92) hookY = baseTop + 6 * up;
        if (derrick) derrick.control = { swing: sw, hookY, running: (t > 0.02 && t < 0.14) || (t > 0.2 && t < 0.42) || (t > 0.72 && t < 0.9) };
        if (t < 0.14) put(block, P0[0], g0, P0[1], qrot + 0.3);
        else if (t < 0.9) put(block, hx, hookY - 1.8, hz, lerpAngle(qrot + 0.3, Math.atan2(sx, sz), swing));
        else blockOn(sled, 0.4, Math.atan2(sx, sz));
        if (!derrick) hang(derrickSling, V2.set(hx, hookY + 8, hz), block, 1.8);
        return { target: [lerp(P0[0], S0[0], 0.5), lerp(P0[1], S0[1], 0.5)], dist: 50, from: qrot + 0.7, tilt: 0.32 };
      },
    },
    {
      title: 'Down to the canal', seconds: 16, source: `${MARTIN}, pp. 12–13 and Map 3`,
      text: 'A horse team drags the sled down to a landing on the natural canal that joins Lake Utopia to the Magaguadavic River. The teamster walks alongside.',
      update(t) {
        const go = travel(t, Math.hypot(SL[0] - S0[0], SL[1] - S0[1]), 16);
        const x = lerp(S0[0], SL[0], go.u), z = lerp(S0[1], SL[1], go.u);
        const [sx, sz] = unit(S0[0], S0[1], SL[0], SL[1]);
        sledTo(x, z, Math.atan2(sx, sz));
        blockOn(sled, 0.4);
        return { target: [x, z], dist: 45, from: Math.atan2(sx, sz) + 2.3, tilt: 0.32, fade: go.fade, side: go.side };
      },
    },
    {
      title: 'Loading the scow', seconds: 9, source: `${MARTIN}, p. 13`,
      text: 'At the landing, men haul on the fall of a pair of shear legs. The block rises off the sled, swings out over the water and settles onto a flat-bottomed scow.',
      update(t) {
        const s0 = scowAt(0);
        put(scow, s0.x, s0.y, s0.z, s0.heading);
        const [sx, sz] = unit(S0[0], S0[1], SL[0], SL[1]);
        sledTo(SL[0], SL[1], Math.atan2(sx, sz));
        const from = new THREE.Vector3(SL[0], groundAt(SL[0], SL[1]) + 0.4, SL[1]);
        const to = new THREE.Vector3(scow.position.x, scow.position.y + 1.4, scow.position.z);
        const lift = ease(span(t, 0.05, 0.3)), across = ease(span(t, 0.3, 0.65)), lower = ease(span(t, 0.68, 0.92));
        const top = Math.max(from.y, to.y) + 3.2;
        const x = lerp(from.x, to.x, across), z = lerp(from.z, to.z, across);
        const y = lerp(lerp(from.y, top, lift), to.y, lower);
        put(block, x, t >= 0.92 ? to.y : y, z, lerpAngle(Math.atan2(sx, sz), scow.rotation.y, across));
        running.fall1 = (t > 0.05 && t < 0.3) || (t > 0.68 && t < 0.92);
        if (t < 0.97) hang(fall1, shears1.apex, block, 1.8); else idleFall(fall1, shears1.apex);
        return { target: [lerp(LB[0], s0.x, 0.5), lerp(LB[1], s0.z, 0.5)], dist: 42, from: Math.atan2(-lqz, lqx) + 0.4, tilt: 0.3 };
      },
    },
    {
      title: 'By scow through the canal', seconds: 20, source: `${MARTIN}, p. 13`,
      text: 'In summer the rough stone went by water. The polers walk the scow along, pushing their poles against the bottom of the canal.',
      // the polers talk as they work: [when in the step, who, what]
      talk: [
        [0.08, 'The young hand', 'Why not haul the block to the mill by road?'],
        [0.36, 'The old hand', 'Over those hills? The roads are rough, and a block this heavy would wear out a team. On the water, it floats.'],
        [0.68, 'The old hand', 'The only rails here are the Red Granite Company’s tramway, down from their quarry to their shed. The main line won’t reach St. George until 1880.'],
      ],
      update(t) {
        running.fall1 = false; idleFall(fall1, shears1.apex);
        const s = scowAt(0.26 * ease(t));
        put(scow, s.x, s.y, s.z, s.heading);
        blockOn(scow, 1.4, s.heading);
        return { target: [s.x, s.z], dist: 45, from: s.heading + 2.4, tilt: 0.3 };
      },
    },
    {
      title: 'Down the Magaguadavic', seconds: 24, source: `${MARTIN}, p. 13`,
      text: '…then down the Magaguadavic River to the falls at St. George, and across the millpond to the landing below the company’s mill.',
      talk: [
        [0.06, 'The young hand', 'So the river is our road.'],
        [0.3, 'The old hand', 'Before the railways, rivers were the easiest roads in New Brunswick. Heavy loads float, and going downstream the current helps push us along to the falls.'],
      ],
      update(t) {
        const s = scowAt(0.26 + 0.74 * ease(t));
        put(scow, s.x, s.y, s.z, s.heading);
        blockOn(scow, 1.4, s.heading);
        return { target: [s.x, s.z], dist: 70 + 330 * Math.sin(Math.PI * Math.min(t, 0.85) / 0.85), from: s.heading + 2.8, tilt: 0.33 + 0.2 * Math.sin(Math.PI * Math.min(t, 0.85) / 0.85) };
      },
    },
    {
      title: 'Unloading at the mill', seconds: 9, source: `${MARTIN}, p. 13 and Map 4`,
      text: 'At the mill landing another pair of shear legs lifts the block off the scow and lowers it onto a heavy stone truck.',
      update(t) {
        const s = scowAt(1);
        put(scow, s.x, s.y, s.z, s.heading);
        const t0 = truckPath.at(0);
        put(truck, t0.x, groundAt(t0.x, t0.z), t0.z, t0.heading);
        const from = new THREE.Vector3(scow.position.x, scow.position.y + 1.4, scow.position.z);
        const to = new THREE.Vector3(truck.position.x, truck.position.y + 1.35, truck.position.z);
        const lift = ease(span(t, 0.05, 0.3)), across = ease(span(t, 0.3, 0.65)), lower = ease(span(t, 0.68, 0.92));
        const top = Math.max(from.y, to.y) + 3.2;
        put(block, lerp(from.x, to.x, across), t >= 0.92 ? to.y : lerp(lerp(from.y, top, lift), to.y, lower), lerp(from.z, to.z, across), lerpAngle(s.heading, t0.heading, across));
        running.fall2 = (t > 0.05 && t < 0.3) || (t > 0.68 && t < 0.92);
        if (t < 0.97) hang(fall2, shears2.apex, block, 1.8); else idleFall(fall2, shears2.apex);
        return { target: [lerp(MB[0], s.x, 0.5), lerp(MB[1], s.z, 0.5)], dist: 55, from: overPond + 0.5, tilt: 0.45 };
      },
    },
    {
      title: 'Into the mill', seconds: 26, source: `${MARTIN}, p. 13 and Map 4`,
      text: 'A horse team draws the truck up from the landing and in through the big doors of the Bay of Fundy Red Granite Co.’s mill.',
      update(t) {
        running.fall2 = false; idleFall(fall2, shears2.apex);
        const p = truckPath.at(travel(t, truckPath.length, 26).u);
        put(truck, p.x, groundAt(p.x, p.z), p.z, p.heading);
        blockOn(truck, 1.35, p.heading);
        block.visible = t < 0.97;
        return { target: [p.x, p.z], dist: 60, from: overPond + 0.3, tilt: 0.5 };
      },
    },
    {
      title: 'The finishing mill', seconds: 12, source: `${MARTIN}, p. 13`,
      text: 'The $75,000 mill ran on water from the falls. Inside, the block was cut and turned into a column. Men roll it out on logs to the polishing lathe, where it turns against wet sand from Lake Utopia until it shines.',
      update(t) {
        block.visible = false;
        const pt = truckPath.at(0);
        put(truck, pt.x, groundAt(pt.x, pt.z), pt.z, pt.heading);
        column.visible = true;
        const u = ease(span(t, 0.02, 0.45));
        const x = lerp(eastDoor[0], latheAt[0], u), z = lerp(eastDoor[1], latheAt[1], u);
        const heading = c0.heading + Math.PI / 2;
        const travelled = Math.hypot(latheAt[0] - eastDoor[0], latheAt[1] - eastDoor[1]) * u;
        if (t < 0.47) {
          put(column, x, groundAt(x, z) + 0.4 + AXIS, z, heading);
          column.rotation.x = -travelled / 0.42;
          rollersUnder(x, groundAt(x, z), z, c0.heading, travelled);
        } else {
          hideRollers();
          put(column, latheAt[0], groundAt(latheAt[0], latheAt[1]) + 0.92 + AXIS, latheAt[1], heading);
          column.rotation.x = -(t - 0.47) * 60;
        }
        return { target: [lerp(eastDoor[0], latheAt[0], 0.6), lerp(eastDoor[1], latheAt[1], 0.6)], dist: 34, from: c0.heading + 2.2, tilt: 0.3 };
      },
    },
    {
      title: 'Loading the wagon', seconds: 8, source: OHALLORAN,
      text: 'Two men roll the finished column up a pair of skids onto the wagon, ready for the road down to the wharf.',
      update(t) {
        hideRollers();
        placeSkids(t < 0.98);
        column.visible = true;
        const u = ease(span(t, 0.05, 0.9));
        const x = lerp(latheAt[0], c0.x, u), z = lerp(latheAt[1], c0.z, u);
        const y = lerp(groundAt(latheAt[0], latheAt[1]) + 0.1, groundAt(c0.x, c0.z) + 1.35, u) + AXIS;
        put(column, x, y, z, c0.heading + Math.PI / 2);
        column.rotation.x = u * Math.hypot(latheAt[0] - c0.x, latheAt[1] - c0.z) / 0.42;
        return { target: [lerp(latheAt[0], c0.x, 0.5), lerp(latheAt[1], c0.z, 0.5)], dist: 30, from: c0.heading + 1.1, tilt: 0.3 };
      },
    },
    {
      title: 'Through town to the wharf', seconds: 18, source: `${MARTIN}, Map 4; ${OHALLORAN}`,
      text: 'A horse team hauls the column down through the town, past the Gorge, to the main wharf on St. George Basin.',
      update(t) {
        placeSkids(false);
        const go = travel(t, cartPath.length, 18);
        const c = cartPath.at(go.u);
        put(wagon, c.x, roadAt(c.x, c.z), c.z, c.heading);
        column.rotation.x = 0;
        column.visible = true;
        put(column, c.x, roadAt(c.x, c.z) + 1.35 + AXIS, c.z, c.heading + Math.PI / 2);
        return { target: [c.x, c.z], dist: 42, from: c.heading + 2.4, tilt: 0.33, fade: go.fade, side: go.side };
      },
    },
    {
      title: 'Loading the schooner', seconds: 10, source: `${MARTIN}, pp. 12–15`,
      text: 'The schooner’s crew haul on a tackle from the foremast. The column swings up off the wagon and down onto the deck. That summer the company’s first orders included seven polished columns for a cathedral in Boston.',
      update(t) {
        const c = cartPath.at(1);
        put(wagon, c.x, roadAt(c.x, c.z), c.z, c.heading);
        put(schooner, berth[0], world.tide * exag(), berth[1], W.rot);
        schooner.userData.setSails(false); // furled alongside the wharf; set again to sail
        const from = new THREE.Vector3(c.x, roadAt(c.x, c.z) + 1.35 + AXIS, c.z), to = deckOf();
        const lift = ease(span(t, 0.05, 0.3)), across = ease(span(t, 0.3, 0.68)), lower = ease(span(t, 0.7, 0.92));
        const top = Math.max(from.y, to.y) + 4;
        column.position.set(lerp(from.x, to.x, across), t >= 0.92 ? to.y : lerp(lerp(from.y, top, lift), to.y, lower), lerp(from.z, to.z, across));
        column.rotation.y = lerpAngle(c.heading + Math.PI / 2, W.rot + Math.PI / 2, across);
        running.tackle = (t > 0.05 && t < 0.3) || (t > 0.7 && t < 0.92);
        if (t < 0.97) hang(tackle, schooner.localToWorld(V2.set(0, 22, 5.5)).clone(), column, 0.9 - AXIS); else rope0(tackle);
        // from above the wharf, looking across the deck at the ship, aimed at deck height (aimed at
        // the water, the camera sat low under the wharf and looked up at its piles)
        return { target: [lerp(c.x, berth[0], 0.5), lerp(c.z, berth[1], 0.5)], y: (from.y + to.y) / 2, dist: 72, from: Math.atan2(-wside[0], -wside[1]) + 0.85, tilt: 0.8 };
      },
    },
    {
      title: 'Down the estuary on the tide', seconds: 12, source: `${MARTIN}, p. 10`,
      text: 'At high water the schooner slips down the tidal Magaguadavic, past the Red Store wharf at Breadalbane…',
      enter() { setTide(3.2); },
      update(t) {
        rope0(tackle); running.tackle = false;
        const s = seaPath.at(redU * 1.25 * ease(t));
        put(schooner, s.x, world.tide * exag(), s.z, s.heading);
        schooner.userData.setSails(true);
        column.position.copy(deckOf()); column.rotation.y = s.heading + Math.PI / 2;
        return { target: [s.x, s.z], dist: 150, from: s.heading + 2.4, tilt: 0.33 };
      },
    },
    {
      title: 'Out to sea', seconds: 14, source: MARTIN,
      text: '…across Passamaquoddy Bay and out through Letete Passage to the Bay of Fundy, bound for Boston.',
      update(t) {
        const s = seaPath.at(redU * 1.25 + (1 - redU * 1.25) * ease(t));
        put(schooner, s.x, world.tide * exag(), s.z, s.heading);
        schooner.userData.setSails(true);
        column.position.copy(deckOf()); column.rotation.y = s.heading + Math.PI / 2;
        return { target: [s.x, s.z], dist: 200 + 5700 * ease(span(t, 0.2, 1)), from: s.heading + 2.6, tilt: 0.35 + 0.5 * span(t, 0.2, 1) };
      },
    },
  ];

  // ---- playing
  const want = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const wantWas = new THREE.Vector3(), V3 = new THREE.Vector3();
  let savedTide = null;
  // After a pause the camera is the viewer's. On resume it flies back, and the story waits for it.
  let settling = 0;
  // While the story plays the viewer can orbit and zoom. Their view is kept as an offset from the
  // story's own shot (a distance ratio and a turn and tilt), so the story's camera moves still
  // happen. Around each change of step the camera takes the story's shot for a moment ("guide"),
  // then hands it back.
  const user = { ratio: 1, turn: 0, tilt: 0 };
  const GUIDE_AFTER = 2.6, GUIDE_BEFORE = 1.2; // seconds of the story's shot after and before a change
  let guide = 0;
  const lastPos = new THREE.Vector3(), lastTarget = new THREE.Vector3();
  let placed = false; // the camera is where this code last put it
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function go(k) {
    k = Math.max(0, Math.min(steps.length - 1, k));
    if (savedTide === null) savedTide = world.tide;
    // replay earlier steps to their ends so every prop is where that step leaves it
    rest();
    for (let q = 0; q < k; q++) { state.step = q; steps[q].enter?.(); steps[q].update(1); }
    state.step = k; state.t = 0; settling = 0; guide = GUIDE_AFTER; placed = false;
    if (k !== 0) releaseDerrick();
    steps[k].enter?.();
    frame(0, true);
    state.onChange();
  }
  function stop() {
    state.playing = false; state.step = -1; state.fade = 0;
    if (savedTide !== null) { setTide(savedTide); savedTide = null; }
    rest();
    state.onChange();
  }
  function frame(dt, snap = false) {
    if (state.step < 0) return;
    const s = steps[state.step];
    if (state.playing && settling <= 0) state.t = Math.min(1, state.t + (dt * state.speed) / s.seconds);
    const view = s.update(state.t);
    state.fade = view.fade ?? 0;
    const side = view.side ?? 0;
    if (sideStep !== state.step) { sideStep = state.step; lastSide = side; }
    else if (side !== lastSide) { snap = true; lastSide = side; } // the cut: the camera jumps with it
    if (state.step !== 0) releaseDerrick();
    const y = groundAt(view.target[0], view.target[1]);
    want.target.set(view.target[0], view.y ?? Math.max(y, world.tide * exag()), view.target[1]); // a step may aim above the ground (a deck)
    if (snap) { user.ratio = 1; user.turn = 0; user.tilt = 0; guide = GUIDE_AFTER; }
    // did the viewer move the camera since the last frame (drag, wheel, buttons, damping)?
    const moved = placed && (camera.position.distanceToSquared(lastPos) > 1e-6 || controls.target.distanceToSquared(lastTarget) > 1e-6);
    if (moved && state.playing && !snap) {
      V3.subVectors(camera.position, controls.target);
      const d = V3.length();
      user.ratio = THREE.MathUtils.clamp(d / view.dist, 0.08, 12);
      user.turn = wrap(Math.atan2(V3.x, V3.z) - view.from);
      user.tilt = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(V3.y / d, -1, 1)), 0.05, 1.42) - view.tilt;
      guide = 0; // they've taken it: the story stops steering for now
    }
    // the story's shot for a moment either side of a change of step
    const left = ((1 - state.t) * s.seconds) / state.speed;
    const steering = state.playing && (guide > 0 || (left < GUIDE_BEFORE && state.step < steps.length - 1));
    if (steering) {
      const e = 1 - Math.exp(-dt * 2.4);
      user.ratio = Math.exp(Math.log(user.ratio) * (1 - e)); user.turn *= 1 - e; user.tilt *= 1 - e;
    }
    if (guide > 0 && state.playing && settling <= 0) guide -= dt;
    const dist = view.dist * user.ratio, from = view.from + user.turn;
    const tilt = THREE.MathUtils.clamp(view.tilt + user.tilt, 0.05, 1.42);
    const flat = Math.cos(tilt) * dist;
    want.pos.set(want.target.x + Math.sin(from) * flat, want.target.y + Math.sin(tilt) * dist, want.target.z + Math.cos(from) * flat);
    // the camera rides along with what it follows (a fast scow would leave an easing camera behind)
    const carry = !snap && state.playing && settling <= 0 && wantWas.lengthSq() > 0 ? V3.subVectors(want.target, wantWas) : null;
    wantWas.copy(want.target);
    if (carry && carry.lengthSq() < 400 * 400) { camera.position.add(carry); controls.target.add(carry); }
    if (state.playing || snap) {
      // settling after a pause flies back briskly; otherwise the camera follows the shot closely
      // (the viewer's own changes are already in it), easing a little so step changes don't jolt
      const k = snap ? 1 : 1 - Math.exp(-dt * (settling > 0 ? 3.5 : steering ? 2.2 : 6));
      camera.position.lerp(want.pos, k);
      controls.target.lerp(want.target, k);
      if (settling > 0) {
        settling -= dt;
        if (camera.position.distanceTo(want.pos) < Math.max(2, view.dist * 0.04)) settling = 0;
      }
    }
    lastPos.copy(camera.position); lastTarget.copy(controls.target); placed = true;
    if (state.t >= 1 && state.playing) {
      if (state.step < steps.length - 1) { state.step++; state.t = 0; guide = GUIDE_AFTER; steps[state.step].enter?.(); state.onChange(); }
      else { state.playing = false; state.onChange(); }
    }
  }

  rest();
  return {
    steps, state,
    play() {
      if (state.step < 0 || (state.step === steps.length - 1 && state.t >= 1)) go(0);
      else { settling = 3; guide = GUIDE_AFTER; user.ratio = 1; user.turn = 0; user.tilt = 0; } // resuming: back to the story's shot
      state.playing = true; state.onChange();
    },
    pause() { state.playing = false; placed = false; state.onChange(); },
    go, stop, frame,
    /** put props back after the hill height changes */
    refresh() { if (state.step < 0) rest(); else { shears1.place(); shears2.place(); } },
    get active() { return state.step >= 0; },
    /** where the hand-offs happen, for anyone scripting their own scenes */
    places: { P0, S0, LB, berth1, MB, berth2, westDoor, eastDoor, latheAt, berth },
  };
}
