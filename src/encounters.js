// What the stone passes on its way: the beats of the long legs of the journey.
//
// The sled haul, the canal, the river and the haul through town each have "beats": a place
// along the way where the load slows (or stops) while something happens beside it and the people
// talk. The journey (journey.js) paces each leg from its beats: slow through a beat, quicker
// between. Every actor here is a function of its beat's clock, tau (seconds since the load
// reached the beat; -Infinity before, +Infinity after), so skipping about the story always
// puts everyone in the right place.
//
// A beat: { s (metres along its leg), slow (seconds at the slow pace), hold (seconds stopped),
// look: [x, z] (what the camera turns toward), talk: [[tau, who, line, seconds]] }.
// Speakers are looked up by name in `speakers` (who -> () => {x, y, z} above their head).
import * as THREE from 'three';
import { CARTOON } from './people.js';
import { trinket } from './critters.js';

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp01((t - a) / (b - a));
const sm = (t) => t * t * (3 - 2 * t);

export function buildEncounters(ctx) {
  const { life, critters, world, data, scene, toon } = ctx;
  const exag = () => world.exag;
  const groundAt = (x, z) => data.heightAt(x, z) * exag();
  const person = (role, f) => life.person(role, f);
  const speakers = {};
  const V = new THREE.Vector3();
  // a figure's speech point, a little above its hat
  const headOf = (f) => () => (f && !f.hidden ? { x: f.x, y: (f.lastY ?? groundAt(f.x, f.z)) + 2.25 * CARTOON * (f.scale ?? 1) - (f.action === 'swim' ? 1.5 : 0), z: f.z } : null);
  const critterHead = (c, up = 0.4) => () => { if (!c.g.visible) return null; c.head.getWorldPosition(V); return { x: V.x, y: V.y + up, z: V.z }; };
  const group = new THREE.Group();
  group.name = 'encounters';
  scene.add(group);
  const mesh = (geo, color) => { const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color, gradientMap: toon })); group.add(m); return m; };
  const updaters = [];

  // ---- splashes: white drops thrown up where something hits the water
  const splash = (() => {
    const n = 90, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshToonMaterial({ color: '#f4fbff', gradientMap: toon }), n);
    m.frustumCulled = false; m.name = 'splash';
    const Z = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4();
    const p = Array.from({ length: n }, () => ({ life: 0, x: new THREE.Vector3(), v: new THREE.Vector3() }));
    for (let i = 0; i < n; i++) m.setMatrixAt(i, Z);
    group.add(m);
    let next = 0;
    return {
      burst(x, y, z, count = 30, power = 1) {
        for (let k = 0; k < count; k++) {
          const q = p[next]; next = (next + 1) % n;
          const a = Math.random() * Math.PI * 2, r = Math.random();
          q.life = 0.9 + Math.random() * 0.5; q.x.set(x, y, z);
          q.v.set(Math.cos(a) * r * 2.4 * power, (3 + Math.random() * 3.5) * power, Math.sin(a) * r * 2.4 * power);
        }
      },
      update(dt) {
        p.forEach((q, i) => {
          if (q.life <= 0) return;
          q.life -= dt; q.v.y -= 9.8 * dt; q.x.addScaledVector(q.v, dt);
          m.setMatrixAt(i, q.life > 0 ? M.makeScale(1, 1, 1).setPosition(q.x) : Z);
        });
        m.instanceMatrix.needsUpdate = true;
      },
    };
  })();
  // fire a splash once, when tau passes a moment (and not when the story jumps past it)
  const once = () => { let last = -Infinity; return (tau, at, fire) => { if (tau >= at && last < at && tau - at < 0.5) fire(); last = tau; }; };

  // ------------------------------------------------------------------ the river and canal
  const { scowPath, L: riverL, U1, scowLevel } = ctx;
  const canalLen = U1 * riverL;
  const along = (s) => scowPath.at(s / riverL); // s: metres along the whole scow route
  const levelY = (s) => scowLevel(s / riverL) * exag();
  // the bank on one side of the channel: walk out from the middle until the ground is above the water
  const bank = (s, side, from = 2) => {
    const p = along(s), lv = scowLevel(s / riverL), nx = Math.cos(p.heading) * side, nz = -Math.sin(p.heading) * side;
    for (let d = from; d < 160; d += 0.75) {
      const x = p.x + nx * d, z = p.z + nz * d, w = data.inlandWaterAt(x, z);
      if (data.heightAt(x, z) > lv + 0.15 && (Number.isNaN(w) || data.heightAt(x, z) > w)) return { x, z, d, nx, nz, p };
    }
    return { x: p.x + nx * 20, z: p.z + nz * 20, d: 20, nx, nz, p };
  };
  // the nearest point of the route to a place, as metres along it (between a and b)
  const nearestS = ([x, z], a = 0, b = riverL) => { let best = a, bd = Infinity; for (let s = a; s <= b; s += 4) { const p = along(s), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = s; } } return best; };
  // where the bank on one side comes closest to the channel, between a and b: the best seat for a bank beat
  const narrowest = (a, b, side) => { let best = a, bd = Infinity; for (let s = a; s <= b; s += 8) { const d = bank(s, side).d; if (d < bd) { bd = d; best = s; } } return best; };
  const sideToward = (s, [x, z]) => { const p = along(s); return (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading) > 0 ? 1 : -1; };
  const road = data.meta.roads?.[0]?.pts ?? [];
  const roadY = (x, z) => world.structures?.userData.roadY?.(x, z) ?? groundAt(x, z) + 0.22;

  // ---- C1: where the Canal Road crosses the canal, a hay wagon rattles over the bridge
  const canal = [];
  {
    let bi = 0, bd = Infinity, bs = canalLen * 0.2;
    road.forEach((p, k) => { const s = nearestS(p, 0, canalLen), q = along(s), d = Math.hypot(q.x - p[0], q.z - p[1]); if (d < bd) { bd = d; bi = k; bs = s; } });
    const pts = road.slice(Math.max(0, bi - 7), bi + 8);
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength();
    const wagon = world.props.wagon();
    wagon.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 4.4).translate(0, 2.15, -0.3), new THREE.MeshToonMaterial({ color: '#d9c27a', gradientMap: toon })));
    wagon.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1).scale(1, 0.45, 1.6).translate(0, 2.95, -0.3), new THREE.MeshToonMaterial({ color: '#d4b96a', gradientMap: toon })));
    group.add(wagon);
    for (const sx of [-0.62, 0.62]) life.horse({ harness: true, move: life.rideOn(wagon, sx, 0, 5.4), y: life.rideY, walking: (h) => h.moving });
    const driver = person('farmer', { action: 'drive', tool: 'reins', move: life.rideOn(wagon, 0, 1.3, 1.9), y: life.rideY });
    const girlRide = life.rideOn(wagon, 0.4, 3.0, -1.2, Math.PI / 2);
    const girl = person('girl', { move: (f, dt) => { girlRide(f, dt); f.action = beat.tau() > -1 && beat.tau() < 3.5 ? 'wave' : 'sit'; }, y: life.rideY });
    speakers['The girl on the hay'] = headOf(girl);
    speakers['The farmer'] = headOf(driver);
    const beat = {
      name: 'The Canal Road', s: bs, slow: 13,
      look: pts[7] ?? pts[0],
      talk: [
        [0, 'The girl on the hay', 'Hello down there!', 2.6],
        [2.8, 'The young hand', 'Why not haul the block to the mill by road? There’s a road right up there.', 4.2],
        [7.2, 'The old hand', 'Look at that hay wagon. Put a block like ours on it and the wheels would sink to the hubs.', 4.6],
        [12, 'The old hand', 'On the water the block floats. Two men and two poles can move it.', 4],
      ],
    };
    updaters.push(() => {
      const tau = beat.tau();
      const u = clamp01((Math.min(Math.max(tau, -8), 16) + 8) / 24);
      const d = 0.25 + 0.55 * u; // across the bridge during the beat
      const p = curve.getPointAt(d), t = curve.getTangentAt(d);
      wagon.position.set(p.x, roadY(p.x, p.z), p.z);
      wagon.rotation.y = Math.atan2(t.x, t.z);
      void len;
    });
    canal.push(beat);
  }
  // ---- C2: a cow cooling off in the canal, and the farm boy calling her out
  {
    const s = Math.min(canalLen - 200, Math.max(canal[0].s + 380, canalLen * 0.55));
    const near = road.reduce((b, q) => (Math.hypot(q[0] - along(s).x, q[1] - along(s).z) < Math.hypot(b[0] - along(s).x, b[1] - along(s).z) ? q : b), road[0] ?? [0, 0]);
    const side = sideToward(s, near); // the farm side: toward the road
    const b = bank(s + 14, side), inWater = along(s + 14);
    const cow = critters.add('cow', { color: '#8a4a2a' });
    const boy = person('boy', { heading: 0, action: 'idle' });
    speakers.Bessie = critterHead(cow, 0.6);
    speakers['The farm boy'] = headOf(boy);
    const beat = {
      name: 'A cow in the canal', s, slow: 7, hold: 6,
      look: [inWater.x, inWater.z],
      talk: [
        [0, 'The young hand', 'There’s a cow in the canal.', 2.4],
        [2.5, 'The old hand', 'It’s July. She’s cooling off. Can’t say I blame her.', 3.4],
        [6, 'The farm boy', 'Bessie! Come out of there!', 2.6],
        [8.8, 'Bessie', 'Mooo.', 1.8],
        [10.8, 'The young hand', 'Does she have the right of way?', 2.6],
        [13.4, 'The old hand', 'She seems to think so.', 2.6],
      ],
    };
    const mid = [inWater.x + b.nx * 1.5, inWater.z + b.nz * 1.5], out = [b.x + b.nx * 6, b.z + b.nz * 6];
    updaters.push(() => {
      const tau = beat.tau();
      const w = sm(span(tau, 8.5, 14.5)); // she wades out while the scow waits
      cow.x = lerp(mid[0], out[0], w); cow.z = lerp(mid[1], out[1], w);
      cow.heading = w > 0 && w < 1 ? Math.atan2(b.nx, b.nz) : Math.atan2(-b.nz, b.nx);
      cow.act = tau > 8.5 && tau < 10 ? 'beg' : w >= 1 ? 'graze' : 'idle';
      const g = groundAt(cow.x, cow.z), wl = levelY(s + 14);
      cow.y = () => Math.max(g, wl - 1.35); // up to her belly
      boy.x = b.x + b.nx * 3 - b.nz * 4; boy.z = b.z + b.nz * 3 + b.nx * 4;
      boy.heading = Math.atan2(cow.x - boy.x, cow.z - boy.z);
      boy.action = tau > 5.8 && tau < 9 ? 'wave' : 'idle';
    });
    canal.push(beat);
  }
  // ---- C3: out of the canal and into the Magaguadavic
  {
    const s = canalLen - 30, p = along(s);
    canal.push({
      name: 'Into the Magaguadavic', s, slow: 15, look: [p.x, p.z],
      talk: [
        [0, 'The young hand', 'So the river is our road.', 2.6],
        [2.8, 'The old hand', 'Before the railways, rivers were the easiest roads in New Brunswick. And going downstream, the current helps.', 5],
        [8, 'The young hand', 'Are there any railways here at all?', 2.6],
        [10.8, 'The old hand', 'Only the Red Granite Company’s tramway, from their quarry down to their shed. The main line won’t reach St. George until 1880.', 5.5],
      ],
    });
  }

  // ---- the river beats, placed along the Magaguadavic between the canal and the millpond
  const river = [];
  const riverLen = riverL - canalLen;
  const R = (f) => canalLen + riverLen * f;
  // R1: the farm dog, and the family haying down to the bank
  {
    const farms = data.meta.roadFarms ?? [];
    let s = R(0.2);
    if (farms.length) {
      let bd = Infinity;
      for (const f of farms) { const q = nearestS([f.x, f.z], R(0.08), R(0.34)), p = along(q), d = Math.hypot(p.x - f.x, p.z - f.z); if (d < bd) { bd = d; s = q; } }
    }
    const farm = farms.reduce((b, f) => (Math.hypot(f.x - along(s).x, f.z - along(s).z) < Math.hypot(b.x - along(s).x, b.z - along(s).z) ? f : b), farms[0] ?? { x: along(s).x + 100, z: along(s).z });
    const side = sideToward(s, [farm.x, farm.z]);
    const dog = critters.add('dog', { color: '#2b2522' });
    const b0 = bank(s, side);
    const farmer = person('farmer', { action: 'idle', tool: 'hoe' });
    speakers.Rex = critterHead(dog, 0.5);
    speakers['The farmer on the bank'] = headOf(farmer);
    // two mowers and a haycock or two in the field behind
    const inland = (d, a) => [b0.x + b0.nx * d - b0.nz * a, b0.z + b0.nz * d + b0.nx * a];
    for (const [d, a] of [[26, -8], [30, 4]]) { const [x, z] = inland(d, a); person('farmer', { x, z, heading: Math.atan2(-b0.nz, b0.nx), action: 'mow', tool: 'scythe' }); }
    const cocks = [[36, -14], [40, 10], [46, -2]].map(([d, a]) => { const [x, z] = inland(d, a); const m = mesh(new THREE.ConeGeometry(1.4, 2, 9).translate(0, 1, 0), '#d4b96a'); m.userData.at = [x, z]; return m; });
    const beat = {
      name: 'The farm dog', s, slow: 16,
      look: [b0.x, b0.z],
      talk: [
        [0, 'Rex', 'Woof! Woof!', 2],
        [2.2, 'The young hand', 'That dog’s been following us since the bend.', 3],
        [5.4, 'The old hand', 'Every farm dog on this river thinks our scow is a burglar.', 3.6],
        [9.4, 'Rex', 'WOOF!', 1.4],
        [11.2, 'The young hand', 'He jumped in!', 2],
        [13.2, 'The farmer on the bank', 'Rex! Get back here, you wet mutt!', 3],
        [16.4, 'The old hand', 'They’re haying. The horses that haul our stone eat that hay all winter.', 4.4],
      ],
    };
    const jumped = once();
    updaters.push(() => {
      const tau = beat.tau();
      const scowS = ctx.scowS();
      for (const m of cocks) { const [x, z] = m.userData.at; m.position.set(x, groundAt(x, z) - 0.1, z); }
      farmer.x = b0.x + b0.nx * 5; farmer.z = b0.z + b0.nz * 5; farmer.heading = Math.atan2(-b0.nx, -b0.nz);
      farmer.action = tau > 12.8 && tau < 16.5 ? 'shake' : 'idle';
      if (tau < 10) { // running along the bank, level with the scow, barking
        const at = Number.isFinite(tau) ? Math.max(scowS + 4, s - 60) : s - 30;
        const b = bank(at, side);
        dog.x = b.x + b.nx * 1.2; dog.z = b.z + b.nz * 1.2;
        const n = along(at + 1); dog.heading = n.heading;
        dog.act = Number.isFinite(tau) && tau > -1 ? 'bark' : 'sit';
        dog.y = null;
        if (!Number.isFinite(tau)) { dog.x = b0.x + b0.nx * 8; dog.z = b0.z + b0.nz * 8; }
      } else if (tau < 19) { // in with a splash, a swim out toward the scow, and back to the bank
        const b = bank(s + 18, side), wl = levelY(s + 18);
        const jump = span(tau, 10, 10.6), out = sm(span(tau, 10.6, 13)), back = sm(span(tau, 13.5, 18.5));
        const j = [b.x - b.nx * 3, b.z - b.nz * 3], far = [b.x - b.nx * 11, b.z - b.nz * 11];
        if (tau < 10.6) { dog.x = lerp(b.x, j[0], jump); dog.z = lerp(b.z, j[1], jump); dog.heading = Math.atan2(-b.nx, -b.nz); }
        else if (tau < 13.5) { dog.x = lerp(j[0], far[0], out); dog.z = lerp(j[1], far[1], out); dog.heading = Math.atan2(-b.nx, -b.nz); }
        else { dog.x = lerp(far[0], b.x + b.nx, back); dog.z = lerp(far[1], b.z + b.nz, back); dog.heading = Math.atan2(b.nx, b.nz); }
        dog.y = () => (tau < 10.6 ? groundAt(b.x, b.z) + Math.sin(Math.PI * jump) * 1.4 : Math.max(wl - 0.55, groundAt(dog.x, dog.z)));
        dog.act = 'idle';
        jumped(tau, 10.6, () => splash.burst(j[0], wl, j[1], 30, 0.9));
      } else { // shaking himself off on the bank
        const b = bank(s + 18, side);
        dog.x = b.x + b.nx * 2; dog.z = b.z + b.nz * 2; dog.y = null;
        dog.heading = Math.atan2(-b.nx, -b.nz) + 0.3 * Math.sin(tau * 30) * (tau < 21 ? 1 : 0);
        dog.act = 'wag';
      }
    });
    river.push(beat);
  }
  // R2: a canoe coming up the river
  {
    const s = R(0.42), p = along(s + 6);
    const side = bank(s + 6, 1).d > bank(s + 6, -1).d ? 1 : -1; // the wider side of the channel
    const hull = new THREE.Shape();
    hull.moveTo(0, 3.1); hull.quadraticCurveTo(0.55, 1.5, 0.45, -2.8); hull.quadraticCurveTo(0, -3.2, -0.45, -2.8); hull.quadraticCurveTo(-0.55, 1.5, 0, 3.1);
    const canoe = new THREE.Group();
    canoe.add(new THREE.Mesh(new THREE.ExtrudeGeometry(hull, { depth: 0.45, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.35, 0), new THREE.MeshToonMaterial({ color: '#c9a86a', gradientMap: toon })));
    canoe.add(new THREE.Mesh(new THREE.ExtrudeGeometry(hull, { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2).scale(1.04, 1, 1.02).translate(0, 0.4, 0), new THREE.MeshToonMaterial({ color: '#5a3a26', gradientMap: toon })));
    group.add(canoe);
    const paddlers = [[1.7, 'townsman'], [-1.6, 'woman']].map(([lz, role], k) => {
      const ride = life.rideOn(canoe, 0, 0.1, lz);
      return person(role, { tool: 'paddle', action: 'paddle', phase: k * 0.8, move: ride, y: life.rideY });
    });
    speakers['The paddler'] = headOf(paddlers[0]);
    const beat = {
      name: 'A canoe', s, slow: 15, look: [p.x + Math.cos(p.heading) * 7 * side, p.z - Math.sin(p.heading) * 7 * side],
      talk: [
        [0, 'The young hand', 'A canoe! And they’re going upstream, against the current.', 3.4],
        [3.8, 'The old hand', 'The Peskotomuhkati have travelled this river by canoe for thousands of years.', 4.2],
        [8.4, 'The old hand', 'Long before there was a St. George, the Magaguadavic was a road inland.', 4],
        [12.6, 'The paddler', 'Good day!', 2],
        [13.2, 'The young hand', 'Good day to you!', 2.2],
      ],
    };
    updaters.push(() => {
      const tau = beat.tau();
      // paddling up the river at a steady pace; it comes alongside the scow about eight seconds in
      const t = Math.min(Math.max(tau, -20), 40);
      const cs = s + 2 - 1.4 * (t - 8); // the scow reaches the beat's middle about eight seconds after it arrives
      const q = along(cs), off = Math.min(9, bank(cs, side).d - 3) * side;
      canoe.position.set(q.x + Math.cos(q.heading) * off, levelY(cs) + 0.02, q.z - Math.sin(q.heading) * off);
      canoe.rotation.y = q.heading + Math.PI; // heading upstream
    });
    river.push(beat);
  }
  // R3: a fisherman with a dip net on a rock at the bank
  {
    const side = sideToward(R(0.55), [1e5, 0]) || 1, s = narrowest(R(0.5), R(0.6), side), b = bank(s, side);
    const rock = mesh(new THREE.IcosahedronGeometry(1.6, 0).scale(1.3, 0.7, 1.1), '#7d7a70');
    const fisher = person('farmer', { tool: 'net', action: 'fish' });
    const fish = trinket('fish', toon); group.add(fish);
    speakers['The fisherman'] = headOf(fisher);
    const beat = {
      name: 'Salmon', s, slow: 14, look: [b.x, b.z],
      talk: [
        [0.4, 'The old hand', 'Salmon come up the Magaguadavic every summer, all the way from the sea.', 4.2],
        [5.2, 'The fisherman', 'Supper!', 2],
        [7.4, 'The young hand', 'Can we stop and fish?', 2.4],
        [10, 'The old hand', 'Not with a block of granite on board. Keep poling.', 3.4],
      ],
    };
    updaters.push(() => {
      const tau = beat.tau();
      const rx = b.x - b.nx * 1, rz = b.z - b.nz * 1;
      rock.position.set(rx, Math.max(groundAt(rx, rz), levelY(s)) - 0.2, rz);
      fisher.x = rx; fisher.z = rz; fisher.heading = Math.atan2(-b.nx, -b.nz);
      fisher.y = () => rock.position.y + 0.95;
      const caught = tau > 5;
      fisher.action = caught && tau < 8 ? 'wave' : 'fish';
      fish.visible = caught && Number.isFinite(tau);
      if (fish.visible) fish.position.set(fisher.x - Math.sin(fisher.heading - 0.4) * 0.5, rock.position.y + 0.95 + 2.6 * CARTOON * (tau < 8 ? 1 : 0.55), fisher.z - Math.cos(fisher.heading - 0.4) * 0.5), fish.rotation.set(Math.PI / 2, 0, tau * 2);
    });
    river.push(beat);
  }
  // R4: the swimming hole and the rope swing
  {
    const side = sideToward(R(0.69), [-1e5, 0]) || 1, s = narrowest(R(0.63), R(0.76), side), b = bank(s, side);
    const tx = b.x + b.nx * 3, tz = b.z + b.nz * 3;
    const trunk = mesh(new THREE.CylinderGeometry(0.35, 0.5, 9, 7).translate(0, 4.5, 0), '#5d4029');
    const crown = mesh(new THREE.IcosahedronGeometry(4, 1).scale(1.2, 0.8, 1.2).translate(0, 10, 0), '#4f8a3c');
    const limb = mesh(new THREE.CylinderGeometry(0.18, 0.25, 7, 6).rotateZ(Math.PI / 2).translate(3.5, 0, 0), '#5d4029');
    const rope = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), '#c8b894');
    const boys = [person('boy', { action: 'idle' }), person('boy', { action: 'swim' }), person('boy', { action: 'idle' })];
    speakers['The boys'] = headOf(boys[0]);
    speakers['The boy on the rope'] = headOf(boys[0]);
    speakers['The boy in the water'] = headOf(boys[1]);
    const beat = {
      name: 'The swimming hole', s, slow: 14, look: [b.x - b.nx * 3, b.z - b.nz * 3],
      talk: [
        [0, 'The boy on the rope', 'Watch this!', 2],
        [2.1, 'The young hand', 'Don’t you dare—', 1.8],
        [4.3, 'The boy on the rope', 'CANNONBALL!', 1.8],
        [6.3, 'The young hand', 'I’m soaked!', 2],
        [8.4, 'The boy in the water', 'Ha ha ha!', 1.8],
        [10.4, 'The old hand', 'Cheaper than a bath. Keep poling.', 3],
      ],
    };
    const hit = once();
    updaters.push(() => {
      const tau = beat.tau(), wl = levelY(s);
      const gy = groundAt(tx, tz);
      trunk.position.set(tx, gy - 0.3, tz); crown.position.set(tx, gy - 0.3, tz);
      const ang = Math.atan2(-b.nx, -b.nz); // the limb reaches out over the water
      limb.position.set(tx, gy + 7.6, tz); limb.rotation.y = ang - Math.PI / 2;
      const px = tx - b.nx * 6, pz = tz - b.nz * 6, py = gy + 7.6; // where the rope hangs from
      const [lx, lz] = [b.x + b.nx * 1.5, b.z + b.nz * 1.5];
      const f = boys[0];
      let hx, hy, hz;
      if (tau < 3.4 || !Number.isFinite(tau)) { // on the bank, rope in hand
        f.x = lx; f.z = lz; f.y = null; f.heading = ang; f.action = tau > -1 && tau < 3.4 ? 'wave' : 'idle';
        hx = lx; hz = lz; hy = groundAt(lx, lz) + 1.9;
        if (tau >= 1e9) { f.x = px - b.nx * 1; f.z = pz - b.nz * 1; f.action = 'swim'; f.y = () => wl; }
      } else if (tau < 4.4) { // out over the river on the rope
        const w = span(tau, 3.4, 4.4);
        const x = lerp(lx, px - b.nx * 3, w), z = lerp(lz, pz - b.nz * 3, w), y = lerp(groundAt(lx, lz), wl + 2.5, w) + Math.sin(Math.PI * w) * 2;
        f.x = x; f.z = z; f.y = () => y; f.action = 'sit'; f.heading = ang;
        hx = x; hz = z; hy = y + 1.9;
      } else { // in the water
        const w = span(tau, 4.4, 4.9);
        const x = px - b.nx * 3, z = pz - b.nz * 3;
        f.x = x; f.z = z; f.y = () => lerp(wl + 2.5, wl, w); f.action = w >= 1 ? 'swim' : 'sit'; f.heading = ang + Math.PI;
        hx = px; hz = pz; hy = py - 5;
        hit(tau, 4.4, () => splash.burst(x, wl, z, 60, 1.25));
      }
      // the rope from the limb to his hands (or swinging free)
      const a = new THREE.Vector3(px, py, pz), bb = new THREE.Vector3(hx, hy, hz), d = bb.clone().sub(a);
      rope.position.copy(a).add(bb).multiplyScalar(0.5); rope.scale.set(1, d.length(), 1); rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      const g1 = boys[1]; g1.x = px - b.nx * 1 + b.nz * 3; g1.z = pz - b.nz * 1 - b.nx * 3; g1.y = () => wl; g1.action = 'swim'; g1.heading = ang;
      const g2 = boys[2]; g2.x = lx + b.nz * 3; g2.z = lz - b.nx * 3; g2.heading = ang; g2.action = tau > 4.5 && tau < 11 ? 'laugh' : 'idle';
    });
    river.push(beat);
  }
  // R5: sawlogs in a boom above the falls, and a river driver walking them with a pike pole
  {
    const side = sideToward(R(0.86), [1e5, 0]) || 1, s = narrowest(R(0.81), R(0.9), side), b = bank(s, side);
    const logs = [];
    for (let k = 0; k < 16; k++) logs.push(mesh(new THREE.CylinderGeometry(0.3, 0.34, 7 + (k % 3), 7).rotateX(Math.PI / 2), k % 2 ? '#7a5a3c' : '#6b4a2e'));
    const drivers = [person('quarryman', { tool: 'pole', action: 'pole', hat: 'straw' }), person('quarryman', { tool: 'pole', action: 'pole' })];
    speakers['The river driver'] = headOf(drivers[0]);
    const beat = {
      name: 'Sawlogs', s, slow: 14, look: [b.x - b.nx * 5, b.z - b.nz * 5],
      talk: [
        [0, 'The young hand', 'What are all those logs?', 2.4],
        [2.6, 'The old hand', 'Sawlogs, waiting for the sawmills at the falls. This town was cutting lumber long before it cut granite.', 5],
        [8, 'The river driver', 'Mind your poles, boys! Don’t knock my logs loose!', 3.2],
        [11.4, 'The old hand', 'Two trades, one river.', 2.6],
      ],
    };
    updaters.push(() => {
      const wl = levelY(s);
      logs.forEach((m, k) => {
        const r = Math.floor(k / 8), c = k % 8;
        const q = along(s - 24 + c * 6.4);
        const off = (b.d - 2.2 - r * 0.8) * side;
        m.position.set(q.x + Math.cos(q.heading) * off, wl + 0.05 + 0.05 * Math.sin(ctx.time() * 1.3 + k), q.z - Math.sin(q.heading) * off);
        m.rotation.y = q.heading + 0.1 * Math.sin(k * 3.1);
      });
      drivers.forEach((f, k) => {
        const m = logs[2 + k * 4];
        f.x = m.position.x; f.z = m.position.z; f.y = () => m.position.y + 0.3; f.heading = m.rotation.y + (k ? Math.PI : 0);
      });
    });
    river.push(beat);
  }
  // R6: a mother duck and her ducklings cross ahead of the scow, near the landing
  {
    const s = riverL - 110, p = along(s + 26);
    const ducks = [critters.add('duck', { color: '#8a6a48' }), ...[0, 1, 2, 3, 4].map(() => critters.add('duck', { size: 0.5, color: '#c8a860' }))];
    speakers['The duck'] = critterHead(ducks[0], 0.3);
    const beat = {
      name: 'Ducklings', s, slow: 5, hold: 7, look: [p.x, p.z],
      talk: [
        [0, 'The old hand', 'Hold up. Hold your pole.', 2.2],
        [2.3, 'The young hand', 'Why are we stopping?', 2],
        [4.4, 'The old hand', 'Ducklings. We can wait.', 2.4],
        [7, 'The duck', 'Quack.', 1.6],
        [9, 'The young hand', 'A block of granite this size, and a duck makes us wait.', 3.4],
      ],
    };
    const a = bank(s + 26, 1), c = bank(s + 26, -1);
    updaters.push(() => {
      const tau = beat.tau();
      const w = Number.isFinite(tau) ? span(tau, -2, 12) : tau > 0 ? 1 : 0;
      ducks.forEach((d, k) => {
        const lag = k * 0.045;
        const u = clamp01(w * 1.25 - lag);
        d.x = lerp(a.x - a.nx * 1.5, c.x - c.nx * 1.5, u) - Math.sin(p.heading) * 0.3 * k;
        d.z = lerp(a.z - a.nz * 1.5, c.z - c.nz * 1.5, u) - Math.cos(p.heading) * 0.3 * k;
        d.heading = Math.atan2(c.x - a.x, c.z - a.z);
        d.y = () => levelY(s + 26) + 0.1 * d.g.scale.y;
      });
    });
    river.push(beat);
  }

  // ------------------------------------------------------------------ the sled haul
  const sledBeats = [];
  {
    const { S0, SL, sled } = ctx;
    const len = Math.hypot(SL[0] - S0[0], SL[1] - S0[1]), ux = (SL[0] - S0[0]) / len, uz = (SL[1] - S0[1]) / len;
    const at = (d, side = 0) => [S0[0] + ux * d + uz * side, S0[1] + uz * d - ux * side];
    const boyRide = life.rideOn(sled, -2.4, 0, 1.2);
    const boy = person('boy', { hat: 'cap', move: (f, dt) => { boyRide(f, dt); f.rideY = undefined; f.action = f.moving ? 'walk' : sledBeats[1]?.tau() > 4 && sledBeats[1]?.tau() < 11 ? 'laugh' : 'idle'; f.speed = 1.3; } });
    speakers['The water boy'] = headOf(boy);
    speakers['The teamster'] = () => ctx.teamsterHead?.();
    sledBeats.push({
      name: 'Why a sled?', s: len * 0.18, slow: 12, look: at(len * 0.18),
      talk: [
        [0, 'The water boy', 'Why a sled? Wouldn’t wheels be faster?', 3],
        [3.3, 'The teamster', 'Wheels sink under a load this heavy. Runners spread the weight and slide.', 4.4],
        [8, 'The teamster', 'And the horses only have to drag it downhill to the water.', 3.4],
      ],
    });
    const goose = critters.add('goose', {});
    const from = at(len * 0.6, -14), mid = at(len * 0.6 + 7, 0), to = at(len * 0.6 + 4, 16);
    speakers['The goose'] = critterHead(goose, 0.35);
    const gb = {
      name: 'A goose', s: len * 0.58, slow: 3, hold: 8, look: mid,
      talk: [
        [0.4, 'The goose', 'HONK!', 1.4],
        [2, 'The teamster', 'Whoa! Whoa, boys.', 2],
        [4.2, 'The goose', 'HISSSS!', 1.6],
        [6, 'The teamster', 'Shoo! Go on, get!', 2.2],
        [8.4, 'The water boy', 'The goose is winning!', 2.4],
        [11.2, 'The teamster', 'Walk on.', 1.8],
      ],
    };
    sledBeats.push(gb);
    updaters.push(() => {
      const tau = gb.tau();
      const w1 = sm(span(tau, -3, 3.5)), w2 = sm(span(tau, 7, 14));
      goose.x = w2 > 0 ? lerp(mid[0], to[0], w2) : lerp(from[0], mid[0], w1);
      goose.z = w2 > 0 ? lerp(mid[1], to[1], w2) : lerp(from[1], mid[1], w1);
      goose.heading = w2 > 0 ? Math.atan2(to[0] - mid[0], to[1] - mid[1]) : tau > 3.5 && tau < 7 ? Math.atan2(-ux, -uz) : Math.atan2(mid[0] - from[0], mid[1] - from[1]);
      goose.act = tau > 3.8 && tau < 7 ? 'hiss' : tau > 0 && tau < 1 ? 'flap' : 'idle';
    });
  }

  // ------------------------------------------------------------------ through town
  const townBeats = [];
  {
    const { cartPath } = ctx;
    const CL = cartPath.length;
    const at = (s, side) => { const c = cartPath.at(s / CL); return [c.x + Math.cos(c.heading) * side, c.z - Math.sin(c.heading) * side, c.heading]; };
    // T1: children with hoops running alongside
    const kids = [person('boy', { action: 'run' }), person('girl', { action: 'run' })];
    const hoops = kids.map(() => { const h = trinket('hoop', toon); group.add(h); return h; });
    speakers['A boy with a hoop'] = headOf(kids[0]);
    speakers['The driver'] = () => ctx.driverHead?.();
    const t1 = {
      name: 'Hoops', s: CL * 0.16, slow: 13, look: at(CL * 0.16, 4),
      talk: [
        [0, 'A boy with a hoop', 'What is it? Is it for a king’s palace?', 3],
        [3.3, 'The driver', 'A polished column, for a cathedral in Boston!', 3.2],
        [6.8, 'A boy with a hoop', 'Boston!', 1.6],
        [8.6, 'The driver', 'Mind the wheels, now.', 2.2],
      ],
    };
    townBeats.push(t1);
    updaters.push(() => {
      const tau = t1.tau(), ws = ctx.wagonS();
      kids.forEach((f, k) => {
        const run = tau > -4 && tau < 14;
        const s = run ? ws + 2 + k * 1.5 : t1.s + (tau > 0 ? 30 : -20) + k * 3;
        const [x, z, h] = at(s, 4.2 + k * 1.3);
        f.x = x; f.z = z; f.heading = h; f.action = run ? (ctx.wagonMoving() ? 'run' : 'idle') : 'idle'; f.speed = 2;
        const hp = hoops[k];
        hp.position.set(x + Math.sin(h) * 0.9, groundAt(x, z) + 0.4 * 1.22, z + Math.cos(h) * 0.9);
        hp.rotation.set(0, h + Math.PI / 2, 0);
        hp.rotateZ(-(ws * 3 + k));
      });
    });
    // T2: a man carrying a ladder turns round, and another ducks
    const ladder = trinket('ladder', toon); group.add(ladder);
    const lad = person('townsman', { action: 'walk' }), other = person('townsman', { action: 'idle', hat: 'bowler' });
    speakers['The man with the ladder'] = headOf(lad);
    speakers['The man in the bowler'] = headOf(other);
    const t2 = {
      name: 'The ladder', s: CL * 0.46, slow: 13, look: at(CL * 0.46, 8),
      talk: [
        [0.6, 'The man with the ladder', 'Coming through!', 2],
        [3, 'The man in the bowler', 'Whoa!', 1.4],
        [5, 'The man with the ladder', 'Sorry! Did I get you?', 2.6],
        [8, 'The man in the bowler', 'Watch where you point that thing!', 3],
      ],
    };
    townBeats.push(t2);
    updaters.push(() => {
      const tau = t2.tau();
      const w = sm(span(tau, -2, 2.6));
      const [ax, az, h] = at(t2.s + 3, 9), [bx, bz] = at(t2.s + 3, 13);
      lad.x = lerp(bx, ax, w); lad.z = lerp(bz, az, w);
      const turn = sm(span(tau, 2.4, 3.4)) - sm(span(tau, 5.2, 6.4));
      lad.heading = h + Math.PI / 2 + Math.PI * turn;
      lad.action = w > 0 && w < 1 ? 'carry' : 'idle';
      ladder.position.set(lad.x, groundAt(lad.x, lad.z) + 1.75 * CARTOON, lad.z);
      ladder.rotation.set(0, lad.heading + Math.PI / 2, 0);
      const [ox, oz] = at(t2.s + 3 + 2.4, 8.4);
      other.x = ox; other.z = oz; other.heading = h - Math.PI / 2;
      other.action = tau > 2.7 && tau < 4.6 ? 'duck' : tau > 7.8 && tau < 11 ? 'shake' : 'idle';
    });
    // T3: hens in the road
    const hens = [0, 1, 2, 3, 4].map(() => critters.add('hen', {}));
    speakers['The hens'] = critterHead(hens[0], 0.3);
    const t3 = {
      name: 'Hens', s: CL * 0.76, slow: 8, hold: 2, look: at(CL * 0.76, 0),
      talk: [
        [0, 'The hens', 'Bawk! Bawk-bawk!', 2],
        [2.2, 'The driver', 'Out of the way, ladies!', 2.4],
        [5, 'The driver', 'Every day. Every single day.', 2.6],
      ],
    };
    townBeats.push(t3);
    updaters.push(() => {
      const tau = t3.tau();
      hens.forEach((c, k) => {
        const [x0, z0, h] = at(t3.s + 6 + k * 1.3, -1.5 + (k % 3) * 1.4);
        const dir = k % 2 ? 1 : -1;
        const w = sm(span(tau, -0.5 + k * 0.15, 2.5 + k * 0.15));
        const [x1, z1] = at(t3.s + 9 + k * 2, dir * (8 + k));
        c.x = lerp(x0, x1, w); c.z = lerp(z0, z1, w);
        c.heading = w > 0 && w < 1 ? Math.atan2(x1 - x0, z1 - z0) : h + k;
        c.act = w > 0 && w < 1 ? 'flap' : 'graze';
      });
    });
  }

  return {
    speakers,
    beats: { sled: sledBeats, canal, river, town: townBeats },
    update(dt) { for (const u of updaters) u(dt); splash.update(dt); },
  };
}
