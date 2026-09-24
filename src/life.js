// Who is where, doing what: quarrymen, stonecutters, townspeople, stevedores, farmers, horses,
// a working derrick, a dory in the Basin and gulls. Everything is placed from the build's data
// (meta.structures, meta.streets, meta.buildings, meta.route) so it follows the map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Crowd, Herd, Chips, CARTOON } from './people.js';

// ------------------------------------------------------------------ what people wore

const SKIN = ['#f0cfb0', '#e8bf9c', '#e2b594', '#d9a982', '#c79270', '#a8734f'];
const OUTFITS = {
  quarryman: { coat: ['#6b5a44', '#5b4a3a', '#4a4f5a', '#7a6a55', '#5a5048'], legs: ['#3a3530', '#4a4540', '#4f4638'], hat: [['cap', 0.65], ['straw', 0.25], [null, 0.1]], hatColor: ['#4a4038', '#3a3a3f', '#5a4a3a'], beard: 0.5 },
  stonecutter: { coat: ['#e8e2d4', '#c9d3dc', '#d6cdb8', '#b8c4cf', '#e0d6c0'], legs: ['#4a4540', '#3a3530', '#55504a'], hat: [['cap', 0.6], [null, 0.4]], hatColor: ['#3a3a3f', '#4a4038'], beard: 0.6 },
  townsman: { coat: ['#3a3f4a', '#4a3a30', '#2f3a2f', '#5a4a3a', '#3a3530', '#6a5a4a'], legs: ['#4a4540', '#5a5048', '#3a3530', '#6a6258'], hat: [['bowler', 0.55], ['cap', 0.3], ['top', 0.1], [null, 0.05]], hatColor: ['#2a2622', '#3a3028', '#4a4038'], beard: 0.4 },
  gentleman: { coat: ['#23252b', '#2a2622'], legs: ['#3a3a40', '#4a4540'], hat: [['top', 1]], hatColor: ['#1f1c1a'], beard: 0.6 },
  woman: { dress: ['#6a3f4a', '#3f4f6a', '#5a6a4a', '#8a6a4a', '#4a3a3a', '#7a8aa0', '#8a4a3a', '#5a4a6a'], coat: null, hat: [['bonnet', 0.7], [null, 0.3]], hatColor: ['#efe9dc', '#5a4a3a', '#3a3a45', '#d9c89a'] },
  boy: { coat: ['#6a5a4a', '#4a5a6a', '#7a4a3a', '#5a6a5a'], legs: ['#4a4540', '#5a5048'], hat: [['cap', 0.5], [null, 0.5]], hatColor: ['#4a4038', '#3a3a3f'] },
  girl: { dress: ['#b06a6a', '#6a8ab0', '#8ab06a', '#c09a5a', '#9a7ab0'], hat: [[null, 0.7], ['bonnet', 0.3]], hatColor: ['#efe9dc'] },
  farmer: { coat: ['#8a7a64', '#a89878', '#6b5a44', '#7a8a9a'], legs: ['#4a4540', '#5a5048'], hat: [['straw', 0.8], ['cap', 0.2]], hatColor: ['#d9c27a', '#c9b06a'], beard: 0.5 },
  sailor: { coat: ['#2f3a4a', '#3a4a5a', '#e8e2d4'], legs: ['#2f2f35', '#3a3a40'], hat: [['cap', 0.8], [null, 0.2]], hatColor: ['#1f2530', '#2a2622'], beard: 0.6 },
};
const HAIR = ['#3a2a1e', '#5a4030', '#2a2420', '#8a6a4a', '#a0522d', '#6a6a6a'];
const HORSE_COLORS = ['#6b4226', '#8a4a26', '#2b2522', '#9a948c', '#5a3a26', '#7a5236'];

export function buildLife({ scene, data, world, camera }) {
  const { meta } = data;
  const S = meta.structures;
  let seed = 1874;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const pickW = (a) => { let r = rnd(); for (const [v, w] of a) { if ((r -= w) <= 0) return v; } return a[a.length - 1][0]; };
  const exag = () => world.exag;
  const groundY = (x, z) => data.heightAt(x, z) * exag();

  const crowd = new Crowd(700, world.toon);
  const herd = new Herd(40, world.toon, crowd.material);
  const chips = new Chips(220, crowd.material);
  const mat = crowd.material;
  const life = new THREE.Group();
  life.name = 'life';
  life.add(crowd.group, herd.group, chips.mesh);
  scene.add(life);
  // chips of stone where stone is worked (not from axes)
  crowd.onStrike = (p, f) => { if (f.action === 'strike' || f.action === 'chisel') chips.burst(p, f.action === 'chisel' ? 3 : 6, f.action === 'chisel' ? 0.6 : 1); };

  function person(role, f) {
    const o = OUTFITS[role];
    const kind = role === 'woman' ? 'woman' : role === 'girl' ? 'girl' : role === 'boy' ? 'boy' : 'man';
    const dress = o.dress ? pick(o.dress) : null;
    return crowd.add({
      kind, hat: pickW(o.hat), beard: kind === 'man' && rnd() < (o.beard ?? 0),
      colors: { coat: dress ?? pick(o.coat), dress, legs: o.legs ? pick(o.legs) : '#3a3530', skin: pick(SKIN), hair: pick(HAIR), hat: pick(o.hatColor) },
      heading: 0, action: 'idle', seed: rnd(), ...f,
    });
  }
  const horse = (h) => herd.add({ color: pick(HORSE_COLORS), seed: rnd(), ...h });

  // ---- movers
  /** back and forth along a polyline [[x,z],...], optionally offset to one side */
  function pingpong(pts, { speed = 1.3, side = 0, onTurn } = {}) {
    const segs = [];
    let total = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.01) continue;
      segs.push({ x0, z0, dx: (x1 - x0) / L, dz: (z1 - z0) / L, L, s0: total });
      total += L;
    }
    let s = rnd() * total, dir = rnd() < 0.5 ? 1 : -1;
    return (f, dt) => {
      if (f.pause > 0) { f.pause -= dt; return; }
      s += dir * f.speed * dt;
      if (s > total || s < 0) { s = Math.min(Math.max(s, 0), total); dir = -dir; onTurn?.(f, dir); }
      const g = segs.find((q) => s <= q.s0 + q.L) ?? segs[segs.length - 1];
      const u = s - g.s0, off = side * (dir > 0 ? 1 : -1);
      f.x = g.x0 + g.dx * u - g.dz * off;
      f.z = g.z0 + g.dz * u + g.dx * off;
      f.heading = Math.atan2(g.dx * dir, g.dz * dir);
    };
  }
  /** a circle around a point */
  const circle = (cx, cz, r, w, a0 = 0) => (f, dt, t) => {
    const a = a0 + t * w;
    f.x = cx + Math.cos(a) * r; f.z = cz + Math.sin(a) * r;
    f.heading = Math.atan2(-Math.sin(a) * Math.sign(w), Math.cos(a) * Math.sign(w));
  };
  /** ride on something that moves (a scow, a wagon, a schooner) */
  const V = new THREE.Vector3();
  function rideOn(obj, lx, ly, lz, lh = 0) {
    let px = null, pz = null;
    return (f) => {
      obj.updateMatrixWorld();
      V.set(lx, ly, lz).applyMatrix4(obj.matrixWorld);
      f.moving = px !== null && Math.hypot(V.x - px, V.z - pz) > 0.004;
      px = V.x; pz = V.z;
      f.x = V.x; f.z = V.z; f.rideY = V.y;
      f.heading = obj.rotation.y + lh;
      f.hidden = !obj.visible;
    };
  }
  const rideY = (f) => f.rideY;

  // ---- a place's local frame: x across, z along its facing
  const frame = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  const facing = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

  // Double-jack drilling: one man kneels and turns the drill, two strike it in turn.
  function drillCrew(dx, dz, h, y) {
    const k = CARTOON;
    const fx = Math.sin(h), fz = Math.cos(h);
    person('quarryman', { x: dx - fx * 0.55 * k, z: dz - fz * 0.55 * k, heading: h, action: 'holdDrill', tool: 'drill', y });
    // strikers stand either side, a sledge's reach from the drill head
    for (const s of [1, -1]) {
      const sx = dx + fz * s * 1.3 * k, sz = dz - fx * s * 1.3 * k;
      person('quarryman', { x: sx, z: sz, heading: facing(sx, sz, dx, dz), action: 'strike', tool: 'sledge', phase: s > 0 ? 0 : 0.65, y });
    }
  }

  // ------------------------------------------------------------------ the quarry
  let derrick = null;
  if (S.quarry) {
    const { x, z, rot } = S.quarry;
    const q = frame(x, z, rot);
    // the quarry's benches step up the hill (see structures.js): tops 4, 9 and 14 m above its floor
    const floor = () => Math.max(groundY(x, z), (data.inlandWaterAt(x, z) || -Infinity) * exag()) - 1.5;
    drillCrew(...q(-7, -8), rot + Math.PI, () => floor() + 4);
    drillCrew(...q(4, -17), rot + Math.PI + 0.4, () => floor() + 9);
    drillCrew(...q(14, 3), rot + Math.PI - 0.5);
    // two men with bars working a block loose
    const [bx, bz] = q(-12, 4);
    for (const s of [-1, 1]) { const [px, pz] = q(-12 + s * 2.1, 4); person('quarryman', { x: px, z: pz, heading: facing(px, pz, bx, bz), action: 'pry', tool: 'crowbar' }); }
    // the foreman, and a water boy going between the shanty and the crews
    const [fx, fz] = q(2, 14);
    person('townsman', { x: fx, z: fz, heading: rot + Math.PI, action: 'chat', look: 0.4, hat: 'bowler', beard: true });
    person('boy', { action: 'walk', speed: 1.1, tool: 'basket', move: pingpong([q(-26, 12), q(-8, 1), q(9, 2)], { speed: 1.1 }) });

    // the horse derrick: mast, a swinging boom and a block on the fall; a horse walks the capstan
    const [mx, mz] = q(6, 2);
    const g = new THREE.Group();
    g.name = 'derrick';
    const wood = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color: '#6b4a2e', gradientMap: world.toon }));
    const mast = wood(0.7, 20, 0.7); mast.position.y = 10; g.add(mast);
    const boomPivot = new THREE.Group(); boomPivot.position.y = 3; g.add(boomPivot);
    const boom = wood(0.45, 0.45, 15); boom.position.set(0, 4.2, 7); boom.rotation.x = -0.58; boomPivot.add(boom);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), new THREE.MeshToonMaterial({ color: '#3b2a1c', gradientMap: world.toon }));
    boomPivot.add(rope);
    const load = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.9), new THREE.MeshToonMaterial({ color: '#b3503c', gradientMap: world.toon }));
    boomPivot.add(load);
    for (const s of [-1, 1]) { const guy = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 30, 3), rope.material); guy.position.set(s * 8, 10, -9); guy.rotation.set(0.6, 0, s * 0.45); g.add(guy); }
    life.add(g);
    const [cx, cz] = q(17, 9);
    const derrickHorse = horse({ x: cx, z: cz, heading: 0, walking: false, speed: 1.2, harness: true });
    let capAngle = 0;
    const leader = person('quarryman', { action: 'idle', hat: 'cap' });
    derrick = {
      update(dt, t) {
        g.position.set(mx, groundY(mx, mz) - 1.5, mz);
        g.rotation.y = rot;
        // 22 s: lower at the face, lift, swing out over the floor, lower, swing back empty
        const u = (t % 22) / 22;
        const sm = (a, b) => { const v = Math.min(Math.max((u - a) / (b - a), 0), 1); return v * v * (3 - 2 * v); };
        const swing = sm(0.36, 0.56) - sm(0.8, 0.98);
        boomPivot.rotation.y = Math.PI + 0.25 - swing * 2.1;
        const lift = sm(0.14, 0.34) - sm(0.58, 0.76);
        const tipY = 3 + 4.2 + Math.sin(0.58) * 7.5, tipZ = 7 + Math.cos(0.58) * 7.5;
        const loadY = 1 + lift * 6;
        load.position.set(0, loadY, tipZ);
        load.visible = u > 0.1 && u < 0.76;
        rope.position.set(0, (tipY + loadY) / 2, tipZ);
        rope.scale.y = tipY - loadY;
        // the horse walks the capstan round only while the fall is running
        const running = (u > 0.14 && u < 0.34) || (u > 0.58 && u < 0.76);
        if (running) capAngle += dt * 0.35;
        derrickHorse.walking = running;
        derrickHorse.x = cx + Math.cos(capAngle) * 4.5; derrickHorse.z = cz + Math.sin(capAngle) * 4.5;
        derrickHorse.heading = Math.atan2(-Math.sin(capAngle), Math.cos(capAngle));
        leader.x = cx + Math.cos(capAngle + 0.35) * 5.6; leader.z = cz + Math.sin(capAngle + 0.35) * 5.6;
        leader.heading = derrickHorse.heading;
        leader.action = running ? 'lead' : 'idle';
        leader.speed = 1.6;
      },
    };
  }

  // ------------------------------------------------------------------ the canal landing: loaders
  if (S.quarry?.landing) {
    const [lx, lz] = S.quarry.landing;
    const [qx, qz] = [S.quarry.x, S.quarry.z];
    const d = Math.hypot(qx - lx, qz - lz), ux = (qx - lx) / d, uz = (qz - lz) / d;
    for (let k = 0; k < 2; k++) {
      person('quarryman', { action: 'carry', tool: 'crate', speed: 1, move: pingpong([[lx + ux * 4 + uz * (k * 2 - 1), lz + uz * 4 - ux * (k * 2 - 1)], [lx + ux * 16, lz + uz * 16]], { speed: 1,
        onTurn: (f, dir) => { f.action = dir < 0 ? 'carry' : 'walk'; crowd.setTool(f, dir < 0 ? 'crate' : null); } }) });
    }
  }

  // ------------------------------------------------------------------ the mill yard: stonecutters at their bankers
  const yard = meta.route.cart[0];
  if (S.mill && yard) {
    const m = S.mill, ax = Math.sin(m.rot), az = Math.cos(m.rot), px = az, pz = -ax;
    // a banker: two granite pedestals and a slab, the stone on top at about waist height
    const banker = mergeGeometries([
      new THREE.BoxGeometry(0.45, 0.55, 0.45).translate(-0.7, 0.275, 0), new THREE.BoxGeometry(0.45, 0.55, 0.45).translate(0.7, 0.275, 0),
      new THREE.BoxGeometry(2.1, 0.2, 0.85).translate(0, 0.65, 0),
    ]);
    const stone = new THREE.BoxGeometry(1.3, 0.5, 0.65).translate(0, 1.0, 0);
    const bankers = new THREE.InstancedMesh(banker, new THREE.MeshToonMaterial({ color: '#8f8a82', gradientMap: world.toon }), 8);
    const stones = new THREE.InstancedMesh(stone, new THREE.MeshToonMaterial({ color: '#b8584a', gradientMap: world.toon }), 8);
    bankers.name = 'bankers'; stones.name = 'banker stones';
    const spots = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const along = -18 + c * 7, across = r ? 9 : -9;
      spots.push([yard[0] + ax * along + px * across, yard[1] + az * along + pz * across, r ? -1 : 1]);
    }
    life.add(bankers, stones);
    const placeBankers = () => {
      const Mx = new THREE.Matrix4(), Qy = new THREE.Quaternion();
      spots.forEach(([bx, bz], k) => {
        Mx.compose(new THREE.Vector3(bx, groundY(bx, bz), bz), Qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rot), new THREE.Vector3(1.35, 1.35, 1.35));
        bankers.setMatrixAt(k, Mx); stones.setMatrixAt(k, Mx);
      });
      bankers.instanceMatrix.needsUpdate = stones.instanceMatrix.needsUpdate = true;
    };
    placeBankers();
    life.userData.placeBankers = placeBankers;
    spots.forEach(([bx, bz, side]) => {
      // the banker's long side runs across the yard (along p); the cutter stands at that side
      const cx = bx - ax * side * 1.35, cz = bz - az * side * 1.35;
      person('stonecutter', { x: cx, z: cz, heading: Math.atan2(ax * side, az * side), action: 'chisel', tool: 'mallet', tool2: 'chisel' });
    });
    // men carrying stone between the mill door and the yard, a polisher at a slab
    const door = [m.x + ax * 44, m.z + az * 44];
    for (let k = 0; k < 2; k++) person('stonecutter', { action: 'carry', tool: 'crate', speed: 1.1, move: pingpong([door, [yard[0] + px * (k ? 5 : -5), yard[1] + pz * (k ? 5 : -5)]], { speed: 1.1 }) });
    const [sx, sz] = [yard[0] - ax * 26, yard[1] - az * 26];
    person('stonecutter', { x: sx, z: sz, heading: m.rot + Math.PI / 2, action: 'polish' });
    person('townsman', { x: yard[0] + px * 2, z: yard[1] + pz * 2, heading: m.rot + Math.PI, action: 'chat', hat: 'bowler' });
  }

  // ------------------------------------------------------------------ the town
  // walkers keep to the part of each street within the town proper
  const centre0 = data.toLocal(45.1288, -66.8255);
  const streets = (meta.streets ?? []).filter((s) => !s.bridge).map((s) => {
    const inner = s.pts.filter(([x, z]) => Math.hypot(x - centre0.x, z - centre0.z) < 650);
    return inner.length >= 2 ? { ...s, pts: inner } : null;
  }).filter(Boolean);
  const lengths = streets.map((s) => s.pts.slice(1).reduce((a, p, k) => a + Math.hypot(p[0] - s.pts[k][0], p[1] - s.pts[k][1]), 0));
  const centre = data.toLocal(45.1288, -66.8255);
  const near = streets.map((s) => Math.min(...s.pts.map(([x, z]) => Math.hypot(x - centre.x, z - centre.z))));
  const weights = lengths.map((L, k) => L * (1.4 - Math.min(1, near[k] / 1200)));
  const pickStreet = () => { let r = rnd() * weights.reduce((a, b) => a + b, 0); for (let k = 0; k < weights.length; k++) if ((r -= weights[k]) <= 0) return streets[k]; return streets[0]; };
  for (let k = 0; k < 24 && streets.length; k++) { // couples and friends walking side by side
    const s = pickStreet(), speed = 1.05 + rnd() * 0.3;
    const lead = { speed, pause: 0 };
    const mover = pingpong(s.pts, { speed, side: s.half + 1.4, onTurn: (g) => { g.pause = rnd() < 0.5 ? 3 + rnd() * 6 : 0; } });
    let last = -1;
    const share = (off) => (f, dt, t) => {
      if (last !== t) { mover(lead, dt); last = t; }
      f.speed = speed;
      f.x = lead.x + Math.cos(lead.heading) * off; f.z = lead.z - Math.sin(lead.heading) * off; f.heading = lead.heading;
      f.action = lead.pause > 0 ? 'chat' : 'walk';
      f.look = off > 0 ? 1.1 : -1.1;
    };
    const pair = rnd() < 0.5 ? ['townsman', 'woman'] : rnd() < 0.5 ? ['woman', 'woman'] : ['townsman', 'townsman'];
    person(pair[0], { action: 'walk', move: share(0.8) });
    person(pair[1], { action: 'walk', move: share(-0.8) });
  }
  for (let k = 0; k < 150 && streets.length; k++) {
    const s = pickStreet();
    const r = rnd();
    const role = r < 0.34 ? 'townsman' : r < 0.68 ? 'woman' : r < 0.74 ? 'gentleman' : r < 0.87 ? 'boy' : 'girl';
    const child = role === 'boy' || role === 'girl';
    const speed = child ? 1.6 + rnd() : 1.05 + rnd() * 0.45;
    const f = person(role, { action: child && rnd() < 0.4 ? 'run' : 'walk', speed, tool: role === 'woman' && rnd() < 0.35 ? 'basket' : null });
    if (f) f.move = pingpong(s.pts, { speed, side: s.half + 1.6 + rnd() * 0.8, onTurn: (g) => { g.pause = rnd() < 0.4 ? 2 + rnd() * 5 : 0; } });
  }
  // people talking outside the stores and churches
  const Bs = meta.buildings;
  const fronts = Bs.filter(([k, x, z]) => (k === 'store' || k === 'church') && data.inTown(x, z));
  for (const [kind, x, z, rot] of fronts) {
    const d = kind === 'church' ? 17 : 10, fx = x + Math.sin(rot) * d, fz = z + Math.cos(rot) * d;
    const n = kind === 'church' ? 4 : 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.4, r = 1.4;
      const px = fx + Math.cos(a) * r, pz = fz + Math.sin(a) * r;
      const role = pickW([['townsman', 0.45], ['woman', 0.4], ['gentleman', 0.1], ['girl', 0.05]]);
      person(role, { x: px, z: pz, heading: facing(px, pz, fx, fz), action: 'chat', tool: role === 'woman' && rnd() < 0.3 ? 'basket' : null });
    }
  }
  // children playing in yards near the middle of town
  const homes = Bs.filter(([k, x, z]) => (k === 'house' || k === 'cape') && data.inTown(x, z) && Math.hypot(x - centre.x, z - centre.z) < 900);
  for (let k = 0; k < 14 && homes.length; k++) {
    const [, x, z, rot] = homes[Math.floor(rnd() * homes.length)];
    const cx = x - Math.sin(rot + Math.PI / 2) * 13, cz = z - Math.cos(rot + Math.PI / 2) * 13;
    const n = 2 + Math.floor(rnd() * 2), w = (rnd() < 0.5 ? 1 : -1) * (1 + rnd() * 0.6);
    for (let j = 0; j < n; j++) person(rnd() < 0.5 ? 'boy' : 'girl', { action: 'run', speed: 2.6, move: circle(cx, cz, 3 + rnd() * 2, w, (j / n) * Math.PI * 2) });
    // someone keeping an eye on them from the doorstep
    if (rnd() < 0.5) person('woman', { x: x + Math.sin(rot) * 6, z: z + Math.cos(rot) * 6, heading: facing(x, z, cx, cz), action: 'idle' });
  }

  // on the doorstep, at the woodpile, at the washing line
  const stumps = [], lines = [];
  homes.forEach(([kind, x, z, rot], k) => {
    const r = rnd();
    const ox = Math.cos(rot), oz = -Math.sin(rot); // the house's local +x: the door side
    const w = kind === 'house' ? 4 : 4.25;
    if (r < 0.12) {
      person(rnd() < 0.5 ? 'townsman' : 'woman', { x: x + ox * (w + 0.9), z: z + oz * (w + 0.9), heading: rot + Math.PI / 2, action: 'sit' });
    } else if (r < 0.22) {
      const bx = x - ox * (w + 7) + Math.sin(rot) * 4, bz = z - oz * (w + 7) + Math.cos(rot) * 4;
      stumps.push([bx, bz]);
      person('townsman', { x: bx - ox * 1.9, z: bz - oz * 1.9, heading: rot + Math.PI / 2, action: 'chop', tool: 'axe', phase: rnd() * 2 });
    } else if (r < 0.3) {
      const bx = x - ox * (w + 9), bz = z - oz * (w + 9);
      lines.push([bx, bz, rot]);
      person('woman', { x: bx + ox * 0.7, z: bz + oz * 0.7, heading: rot - Math.PI / 2, action: 'reach', tool: 'cloth' });
    }
  });
  if (stumps.length) {
    const g = mergeGeometries([new THREE.CylinderGeometry(0.35, 0.4, 0.55, 8).translate(0, 0.27, 0), new THREE.CylinderGeometry(0.16, 0.16, 0.55, 6).translate(0, 0.8, 0),
      ...[0, 1, 2, 3, 4].map((k) => new THREE.CylinderGeometry(0.14, 0.14, 1.1, 5).rotateZ(Math.PI / 2).translate(1.2, 0.15 + (k > 2 ? 0.26 : 0), -0.6 + (k % 3) * 0.3))]);
    const m = new THREE.InstancedMesh(g, new THREE.MeshToonMaterial({ color: '#8a6a48', gradientMap: world.toon }), stumps.length);
    m.name = 'woodpiles';
    life.add(m);
    life.userData.placeStumps = () => { const Mx = new THREE.Matrix4(); stumps.forEach(([sx, sz], k) => m.setMatrixAt(k, Mx.makeScale(1.3, 1.3, 1.3).setPosition(sx, groundY(sx, sz), sz))); m.instanceMatrix.needsUpdate = true; };
    life.userData.placeStumps();
  }
  if (lines.length) {
    const cloths = ['#f2efe6', '#c9d6e3', '#e8c9c0', '#f2efe6', '#d9e0c0'];
    const parts = [new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5).translate(-3, 1.2, 0), new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5).translate(3, 1.2, 0), new THREE.CylinderGeometry(0.015, 0.015, 6, 3).rotateZ(Math.PI / 2).translate(0, 2.3, 0)];
    const posts = new THREE.InstancedMesh(mergeGeometries(parts), new THREE.MeshToonMaterial({ color: '#6b4a2e', gradientMap: world.toon }), lines.length);
    const wash = new THREE.InstancedMesh(mergeGeometries([0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.7 + (k % 2) * 0.3, 0.9 - (k % 3) * 0.2, 0.02).translate(-2.1 + k * 1.35, 1.85, 0))), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: world.toon, side: THREE.DoubleSide }), lines.length);
    posts.name = 'washing lines'; wash.name = 'washing';
    life.add(posts, wash);
    life.userData.placeLines = () => {
      const Mx = new THREE.Matrix4(), Qy = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S1 = new THREE.Vector3(1.35, 1.35, 1.35);
      lines.forEach(([lx, lz, rot], k) => {
        Mx.compose(new THREE.Vector3(lx, groundY(lx, lz), lz), Qy.setFromAxisAngle(Y, rot), S1);
        posts.setMatrixAt(k, Mx); wash.setMatrixAt(k, Mx); wash.setColorAt(k, new THREE.Color(cloths[k % cloths.length]));
      });
      posts.instanceMatrix.needsUpdate = wash.instanceMatrix.needsUpdate = true;
    };
    life.userData.placeLines();
    life.userData.wash = wash;
  }

  // chimney smoke over the middle of town: puffs that rise, drift and thin out
  const smoke = (() => {
    const chimneys = homes.filter((_, k) => k % 3 === 0).slice(0, 36).map(([kind, x, z, rot]) => {
      const lz = kind === 'house' ? 2.2 : 0, top = kind === 'house' ? 10.9 : 8.2;
      return { x: x + Math.sin(rot) * lz * 1, z: z + Math.cos(rot) * lz, top, next: rnd() * 2 };
    });
    const max = chimneys.length * 6;
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshToonMaterial({ color: '#e9e6df', gradientMap: world.toon, transparent: true, opacity: 0.75, depthWrite: false }), max);
    m.name = 'chimney smoke';
    m.frustumCulled = false;
    life.add(m);
    const puffs = Array.from({ length: max }, () => ({ age: 9, x: 0, y: 0, z: 0 }));
    let n = 0;
    const Mx = new THREE.Matrix4();
    return {
      update(dt, near) {
        for (const c of chimneys) {
          c.next -= dt;
          if (c.next > 0) continue;
          c.next = 1.3 + rnd() * 0.8;
          const p = puffs[n]; n = (n + 1) % max;
          p.age = 0; p.x = c.x; p.z = c.z; p.y = groundY(c.x, c.z) + c.top + 0.2;
        }
        puffs.forEach((p, k) => {
          p.age += dt;
          if (p.age > 7 || !near) { m.setMatrixAt(k, Mx.makeScale(0, 0, 0)); return; }
          p.y += dt * 0.9; p.x += dt * 0.6; p.z += dt * 0.25;
          const s = (0.6 + p.age * 0.45) * (1 - Math.max(0, (p.age - 5) / 2));
          m.setMatrixAt(k, Mx.makeScale(s, s * 0.8, s).setPosition(p.x, p.y, p.z));
        });
        m.instanceMatrix.needsUpdate = true;
      },
    };
  })();

  // wagons on the main streets: a team, a driver and a load
  const wagons = [];
  function wagonMesh(load) {
    const parts = [new THREE.BoxGeometry(2.3, 0.5, 4.6).translate(0, 1.15, 0), new THREE.BoxGeometry(0.1, 0.5, 4.6).translate(1.1, 1.6, 0), new THREE.BoxGeometry(0.1, 0.5, 4.6).translate(-1.1, 1.6, 0),
      new THREE.BoxGeometry(0.1, 0.1, 3.6).translate(0, 1.05, 3.7)];
    if (load === 'stone') parts.push(new THREE.BoxGeometry(1.6, 0.9, 2).translate(0, 1.85, -0.4));
    if (load === 'barrels') for (let k = 0; k < 3; k++) parts.push(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8).translate(0, 1.8, -1.3 + k * 1.1));
    const body = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshToonMaterial({ color: load === 'stone' ? '#9a7a55' : '#8a6a48', gradientMap: world.toon }));
    const g = new THREE.Group();
    g.add(body);
    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.18, 12).rotateZ(Math.PI / 2);
    const spokes = new THREE.MeshToonMaterial({ color: '#5b3a26', gradientMap: world.toon });
    g.userData.wheels = [];
    for (const [wx, wz] of [[1.3, -1.6], [-1.3, -1.6], [1.3, 1.6], [-1.3, 1.6]]) { const w = new THREE.Mesh(wheelGeo, spokes); w.position.set(wx, 0.8, wz); g.add(w); g.userData.wheels.push(w); }
    if (load === 'stone') { g.children[0].material = g.children[0].material.clone(); }
    return g;
  }
  function team(obj, { stand = false } = {}) {
    // two horses ahead of the wagon and a driver on the seat
    const hs = [-0.62, 0.62].map((sx) => horse({ harness: true, move: rideOn(obj, sx, 0, 5.3), y: rideY, walking: (h) => !stand && h.moving }));
    const drv = person('townsman', { action: 'drive', tool: 'reins', move: rideOn(obj, 0, 1.25, 1.9), y: rideY });
    return { horses: hs, driver: drv };
  }
  const traffic = streets.filter((s, k) => lengths[k] > 350).slice(0, 4);
  traffic.forEach((s, k) => {
    const w = wagonMesh(k % 2 ? 'barrels' : 'stone');
    life.add(w);
    const mover = pingpong(s.pts, { speed: 1.5, side: 1.4 });
    const state = { x: 0, z: 0, heading: 0, speed: 1.5 };
    wagons.push({ obj: w, update(dt) { mover(state, dt); w.position.set(state.x, groundY(state.x, state.z), state.z); w.rotation.y = state.heading; for (const wh of w.userData.wheels) wh.rotation.x += dt * state.speed / 0.8; } });
    team(w);
  });

  // ------------------------------------------------------------------ the main wharf, the Basin, the upper bridge
  const deckAt = (() => {
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
    return (x, z, fallback) => {
      const st = world.structures;
      if (!st) return fallback;
      from.set(x, 3000, z);
      ray.set(from, down);
      const hit = ray.intersectObjects(st.children.filter((o) => !o.isInstancedMesh), false)[0];
      return hit ? hit.point.y : fallback;
    };
  })();
  let wharfFolk = [];
  if (S.wharf) {
    const W = S.wharf, dx = Math.sin(W.rot), dz = Math.cos(W.rot);
    const at = (d, side) => [W.x + dx * d + dz * side, W.z + dz * d - dx * side];
    for (let k = 0; k < 4; k++) {
      const side = (k % 2 ? 1 : -1) * (2 + rnd() * 3);
      wharfFolk.push(person('sailor', { action: 'shoulder', tool: 'sack', speed: 1.1, y: (f) => deckAt(f.x, f.z, groundY(f.x, f.z)),
        move: pingpong([at(4, side), at(W.length * 0.72, side)], { speed: 1.1, onTurn: (f, dir) => { f.action = dir > 0 ? 'shoulder' : 'walk'; crowd.setTool(f, dir > 0 ? 'sack' : null); f.pause = 1.5; } }) }));
    }
    const [cx, cz] = at(W.length * 0.8, -3);
    wharfFolk.push(person('townsman', { x: cx, z: cz, heading: W.rot + Math.PI / 2, action: 'chat', hat: 'top', y: (f) => deckAt(f.x, f.z, groundY(f.x, f.z)) }));
    // a boy fishing off the end
    const [ex, ez] = at(W.length - 1.5, 2);
    wharfFolk.push(person('boy', { x: ex, z: ez, heading: W.rot, action: 'fish', tool: 'rod', y: (f) => deckAt(f.x, f.z, groundY(f.x, f.z)) }));
  }
  // a dory rowing about the Basin
  const dory = (() => {
    const g = new THREE.Group();
    const hull = new THREE.Shape();
    hull.moveTo(0, 3); hull.quadraticCurveTo(1, 1.5, 0.9, -1.8); hull.lineTo(-0.9, -1.8); hull.quadraticCurveTo(-1, 1.5, 0, 3);
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(hull, { depth: 0.6, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.6, 0), new THREE.MeshToonMaterial({ color: '#c9b48a', gradientMap: world.toon })));
    life.add(g);
    const [bx, bz] = meta.anchors.basin;
    const c = data.toLocal(45.1262, -66.8222);
    const cx = Number.isFinite(c.x) ? c.x : bx, cz = c.z;
    // two oars on thole pins, swept in time with the rower's stroke (ACTIONS.row, phase 0)
    const oarGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5).rotateZ(Math.PI / 2).translate(1.1, 0, 0);
    const blade = new THREE.BoxGeometry(0.7, 0.04, 0.2).translate(2.5, 0, 0);
    const oarMat = new THREE.MeshToonMaterial({ color: '#8a6a48', gradientMap: world.toon });
    const oars = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.85, 0.75, 0.2);
      const o = new THREE.Mesh(mergeGeometries([oarGeo, blade]), oarMat);
      o.scale.x = s;
      pivot.add(o);
      g.add(pivot);
      return { pivot, s };
    });
    return {
      g,
      update(t) {
        const a = t * 0.05;
        g.position.set(cx + Math.cos(a) * 55, world.tide * exag(), cz + Math.sin(a) * 35);
        g.rotation.y = Math.atan2(-Math.sin(a) * 55, Math.cos(a) * 35);
        const st = Math.sin(Math.PI * 2 * 0.5 * t), dip = Math.cos(Math.PI * 2 * 0.5 * t);
        for (const { pivot, s } of oars) { pivot.rotation.y = s * 0.55 * st; pivot.rotation.z = s * (dip > 0 ? -0.28 : 0.08); }
      },
    };
  })();
  person('sailor', { action: 'row', seed: 0, phase: 0, move: rideOn(dory.g, 0, 0.45, 0.8, Math.PI), y: rideY });
  // a boy fishing from the upper bridge, looking down into the falls
  if (S.upperBridge) {
    const [[ax, az], [bx, bz]] = S.upperBridge;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const px = mx - uz * 2.8, pz = mz + ux * 2.8;
    person('boy', { x: px, z: pz, heading: Math.atan2(-uz, ux) + Math.PI, action: 'fish', tool: 'rod', y: (f) => deckAt(f.x, f.z, groundY(f.x, f.z)) });
    person('townsman', { x: mx + uz * 2.5 + ux * 6, z: mz - ux * 2.5 + uz * 6, action: 'walk', speed: 1.2, move: pingpong([[ax - ux * 10 + uz * 2.4, az - uz * 10 - ux * 2.4], [bx + ux * 10 + uz * 2.4, bz + uz * 10 - ux * 2.4]], { speed: 1.2 }), y: (f) => deckAt(f.x, f.z, groundY(f.x, f.z)) });
  }

  // ------------------------------------------------------------------ the Red Store at Breadalbane
  if (S.redStore && S.redStoreWharf) {
    const R = S.redStore, RW = S.redStoreWharf;
    const front = [R.x + Math.sin(R.rot) * 10, R.z + Math.cos(R.rot) * 10];
    for (let k = 0; k < 2; k++) { const [px, pz] = [front[0] + (k ? 1.3 : -1.3) * Math.cos(R.rot), front[1] - (k ? 1.3 : -1.3) * Math.sin(R.rot)]; person(k ? 'townsman' : 'woman', { x: px, z: pz, heading: facing(px, pz, front[0], front[1]), action: 'chat' }); }
    const end = [RW.x + Math.sin(RW.rot) * RW.length * 0.8, RW.z + Math.cos(RW.rot) * RW.length * 0.8];
    person('quarryman', { action: 'shoulder', tool: 'sack', speed: 1.1, y: (f) => deckAt(f.x, f.z, groundY(f.x, f.z)), move: pingpong([front, end], { speed: 1.1, onTurn: (f, dir) => { f.action = dir > 0 ? 'shoulder' : 'walk'; crowd.setTool(f, dir > 0 ? 'sack' : null); } }) });
    // a team waiting at the store
    const w = wagonMesh('barrels');
    const wp = [R.x - Math.cos(R.rot) * 13 + Math.sin(R.rot) * 8, R.z + Math.sin(R.rot) * 13 + Math.cos(R.rot) * 8];
    life.add(w);
    wagons.push({ obj: w, update() { w.position.set(wp[0], groundY(wp[0], wp[1]), wp[1]); w.rotation.y = R.rot + Math.PI / 2; } });
    team(w, { stand: true });
  }

  // ------------------------------------------------------------------ farms and villages
  const outside = Bs.filter(([k, x, z]) => !data.inTown(x, z));
  const barns = outside.filter(([k]) => k === 'barn');
  barns.forEach(([, x, z, rot], k) => {
    if (k % 2) return;
    const a = rot + (rnd() - 0.5) * 2, d = 22 + rnd() * 15, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    if (data.isSea(px, pz) || !Number.isNaN(data.inlandWaterAt(px, pz))) return;
    person('farmer', { x: px, z: pz, heading: rnd() * Math.PI * 2, action: 'hoe', tool: 'hoe' });
    if (k % 6 === 0) horse({ x: x + Math.cos(rot) * 16, z: z - Math.sin(rot) * 16, heading: rnd() * 6, walking: false });
  });
  const cottages = outside.filter(([k]) => k === 'house' || k === 'cape');
  cottages.forEach(([, x, z, rot], k) => {
    if (k % 3) return;
    const px = x + Math.sin(rot + 1.2) * 9, pz = z + Math.cos(rot + 1.2) * 9;
    if (rnd() < 0.5) person('woman', { x: px, z: pz, heading: rnd() * 6, action: rnd() < 0.5 ? 'idle' : 'hoe', tool: rnd() < 0.4 ? 'basket' : null });
    else { const n = 2; for (let j = 0; j < n; j++) person(rnd() < 0.5 ? 'boy' : 'girl', { action: 'run', speed: 2.4, move: circle(px, pz, 2.5, 1.2, j * Math.PI) }); }
  });

  // ------------------------------------------------------------------ gulls over the water
  const gulls = [];
  {
    const body = new THREE.MeshToonMaterial({ color: '#f4f2ec', gradientMap: world.toon });
    const wingGeo = new THREE.BoxGeometry(1.1, 0.05, 0.4).translate(0.55, 0, 0);
    const spots = [meta.anchors.basin, [S.wharf?.x ?? 0, S.wharf?.z ?? 0], meta.anchors.redStore, meta.anchors.letetePassage];
    for (let k = 0; k < 16; k++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.7), body));
      const wl = new THREE.Mesh(wingGeo, body), wr = new THREE.Mesh(wingGeo, body);
      wr.rotation.y = Math.PI;
      g.add(wl, wr);
      g.scale.setScalar(1.6);
      life.add(g);
      const [cx, cz] = spots[k % spots.length];
      gulls.push({ g, wl, wr, cx, cz, r: 40 + rnd() * 90, h: 18 + rnd() * 30, w: (rnd() < 0.5 ? 1 : -1) * (0.12 + rnd() * 0.1), p: rnd() * 10 });
    }
  }

  // ------------------------------------------------------------------ each frame
  let t = 0;
  return {
    group: life, crowd, herd, chips,
    person, horse, rideOn, rideY,
    update(dt) {
      t += dt;
      derrick?.update(dt, t);
      for (const w of wagons) w.update(dt, t);
      dory.update(t);
      smoke.update(dt, Math.hypot(camera.position.x - centre.x, camera.position.z - centre.z) < 3000);
      for (const gl of gulls) {
        const a = gl.p + t * gl.w;
        gl.g.position.set(gl.cx + Math.cos(a) * gl.r, (world.tide + gl.h) * exag(), gl.cz + Math.sin(a) * gl.r);
        gl.g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) * Math.sign(gl.w) + (gl.w < 0 ? Math.PI : 0);
        const flap = Math.sin(t * 7 + gl.p) * 0.5 * (Math.sin(t * 0.4 + gl.p) > -0.2 ? 1 : 0.1);
        gl.wl.rotation.z = flap; gl.wr.rotation.z = -flap;
      }
      const ctx = { camera, groundY, range: 2000 };
      crowd.update(dt, t, ctx);
      herd.update(dt, t, ctx);
      chips.update(dt);
    },
    /** after the hill height changes */
    refresh() { life.userData.placeBankers?.(); life.userData.placeStumps?.(); life.userData.placeLines?.(); },
  };
}
