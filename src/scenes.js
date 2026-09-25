// Background life: little scenes that play on a loop at each place the stone passes, so there is
// always something going on besides men swinging hammers. Some are the everyday work of the
// trade (a blacksmith sharpening drills, men splitting a block with plugs and feathers, a herring
// weir); some are just funny (a dog steals a lunch pail, a goat eats a hat, a gull steals a fish).
// Farm animals graze at the farms along Riverview Avenue, and a peddler's cart works the road.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { trinket } from './critters.js';
import { CARTOON } from './people.js';

const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => Math.min(Math.max((t - a) / (b - a), 0), 1);
const sm = (t) => t * t * (3 - 2 * t);

export function buildScenes({ scene, data, world, life, critters, journey }) {
  const { meta } = data;
  const S = meta.structures;
  const toon = world.toon;
  const exag = () => world.exag;
  const gy = (x, z) => data.heightAt(x, z) * exag();
  const group = new THREE.Group();
  group.name = 'background scenes';
  scene.add(group);
  const mat = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toon });
  const mesh = (geo, color) => { const m = new THREE.Mesh(geo, mat(color)); group.add(m); return m; };
  const person = (role, f) => life.person(role, f);
  const loops = [];
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // a place's local frame: x across, z along its facing
  const frame = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  const face = (f, x, z) => { f.heading = Math.atan2(x - f.x, z - f.z); };
  const goTo = (c, a, b, w) => { c.x = lerp(a[0], b[0], w); c.z = lerp(a[1], b[1], w); if (w > 0 && w < 1) c.heading = Math.atan2(b[0] - a[0], b[1] - a[1]); };
  const hold = (thing, holder) => { if (thing.parent !== holder) holder.add(thing); thing.position.set(0, 0, 0); thing.rotation.set(0, 0, 0); };
  const drop = (thing, x, y, z) => { if (thing.parent !== group) group.add(thing); thing.position.set(x, y, z); };

  // ------------------------------------------------------------------ the quarry
  if (S.quarry) {
    const q = frame(S.quarry.x, S.quarry.z, S.quarry.rot);
    const floor = () => gy(S.quarry.x, S.quarry.z) - 1.5;
    // the blacksmith at his forge by the shanty: drills go blunt fast in granite, and he sharpens them all day
    {
      const [fx, fz] = q(-18, 19);
      const hearth = mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2).translate(0, 0.45, 0), '#6a625a');
      const coals = mesh(new THREE.BoxGeometry(1.1, 0.12, 0.7).translate(0, 0.95, 0), '#ff7a2a');
      coals.material = new THREE.MeshBasicMaterial({ color: '#ff8a3a' });
      const hood = mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5).translate(0, 2.2, -0.3), '#4a4540');
      const anvil = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.7).translate(0, 0.75, 0), '#3a3a3f');
      const stump = mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8).translate(0, 0.3, 0), '#6b4a2e');
      const [ax, az] = q(-18, 21.3);
      const smith = person('quarryman', { x: ax - 1.1, z: az, action: 'strike', tool: 'sledge', hat: null, beard: true });
      face(smith, ax, az);
      const boy = person('boy', { action: 'idle' }); // the drill boy, carrying blunt drills in and sharp ones out
      const drills = trinket('pail', toon); drills.visible = false;
      loops.push((t) => {
        const y = floor() + 1.5;
        for (const m of [hearth, coals, hood]) m.position.set(fx, gy(fx, fz), fz);
        for (const m of [anvil, stump]) m.position.set(ax, gy(ax, az), az);
        coals.material.color.setHSL(0.06, 1, 0.55 + 0.08 * Math.sin(t * 7) + 0.05 * Math.sin(t * 13));
        const u = (t % 30) / 30, crews = q(-4, -4), w = sm(span(u, 0.1, 0.45)) - sm(span(u, 0.6, 0.95));
        goTo(boy, [fx + 2, fz + 1], crews, w);
        boy.action = w > 0.02 && w < 0.98 ? 'carry' : 'idle';
        life.crowd.setTool(boy, boy.action === 'carry' ? 'crate' : null);
        void y;
      });
    }
    // the lunch-pail thief
    {
      const pail = trinket('pail', toon); group.add(pail);
      const dog = critters.add('dog', { color: '#c9a36b' });
      const [bx, bz] = q(-22, 9.5); // the block the pail sits on
      const block = mesh(new THREE.BoxGeometry(1.4, 0.6, 1.0).translate(0, 0.3, 0), '#b3503c');
      const man = person('quarryman', { action: 'sit', x: bx - 1.2, z: bz, hat: 'straw' });
      const boy = person('boy', { action: 'idle', hat: 'cap' });
      const home = q(-34, 22), lair = q(-10, 26);
      loops.push((t) => {
        const u = (t + 7) % 28;
        block.position.set(bx, gy(bx, bz), bz);
        man.heading = Math.atan2(1, 0) + S.quarry.rot;
        // 0-5 the dog creeps up; 5 grabs it; 5-16 off round the shanty with the boy after him; 16 drops it; 16-22 the boy brings it back
        if (u < 5) { goTo(dog, home, [bx + 0.5, bz + 1.2], sm(span(u, 0, 4.6))); dog.act = u > 4 ? 'sniff' : 'idle'; drop(pail, bx, gy(bx, bz) + 0.6, bz); }
        else if (u < 16) {
          const a = (u - 5) * 0.9, cx = (bx + lair[0]) / 2, cz = (bz + lair[1]) / 2;
          const p = [cx + Math.cos(a) * 9, cz + Math.sin(a) * 6];
          const d0 = [dog.x, dog.z]; dog.x = p[0]; dog.z = p[1]; dog.heading = Math.atan2(p[0] - d0[0], p[1] - d0[1]);
          dog.act = 'wag';
          hold(pail, dog.mouth);
        } else { dog.act = 'sit'; if (u < 16.1) drop(pail, dog.x, gy(dog.x, dog.z) + 0.1, dog.z); goTo(dog, [dog.x, dog.z], home, sm(span(u, 19, 27))); }
        // the boy chases, a few steps behind
        if (u > 5.4 && u < 16.5) { const lagA = (u - 6) * 0.9, cx = (bx + lair[0]) / 2, cz = (bz + lair[1]) / 2; const was = [boy.x, boy.z]; boy.x = cx + Math.cos(lagA) * 9.4; boy.z = cz + Math.sin(lagA) * 6.4; boy.heading = Math.atan2(boy.x - was[0], boy.z - was[1]); boy.action = 'run'; boy.speed = 2.6; }
        else if (u >= 16.5) { goTo(boy, [boy.x, boy.z], [bx + 1.4, bz + 0.6], sm(span(u, 16.5, 22))); boy.action = u < 22 ? 'walk' : 'idle'; if (u > 17 && u < 22) hold(pail, group), pail.position.set(boy.x, gy(boy.x, boy.z) + 0.85 * CARTOON * 0.66, boy.z); }
        else { boy.x = bx + 1.4; boy.z = bz + 0.6; boy.action = 'idle'; face(boy, bx, bz); }
        man.action = u > 5.2 && u < 9 ? 'shake' : 'sit';
      });
    }
    // two men splitting a block with plugs and feathers beside the sled road
    {
      const j = journey.places;
      const mx = lerp(j.S0[0], j.LB[0], 0.35), mz = lerp(j.S0[1], j.LB[1], 0.35);
      const ux = j.LB[0] - j.S0[0], uz = j.LB[1] - j.S0[1], l = Math.hypot(ux, uz);
      const bx = mx + (uz / l) * 9, bz = mz - (ux / l) * 9;
      const rock = mesh(new THREE.BoxGeometry(3.4, 1.6, 2.2).translate(0, 0.8, 0), '#b3503c');
      loops.push(() => { rock.position.set(bx, gy(bx, bz) - 0.2, bz); });
      for (const s of [-1, 1]) {
        const f = person('quarryman', { x: bx + s * 1.1, z: bz + 1.6, action: 'strike', tool: 'sledge', phase: s > 0 ? 0 : 0.65, y: () => gy(bx, bz) });
        face(f, bx + s * 0.4, bz);
      }
    }
  }

  // ------------------------------------------------------------------ the canal landing: a boy fishes up a boot
  {
    const j = journey.places;
    const [ux, uz] = [j.berth1[0] - j.LB[0], j.berth1[1] - j.LB[1]], l = Math.hypot(ux, uz);
    const px = j.LB[0] - (uz / l) * 16, pz = j.LB[1] + (ux / l) * 16;
    const boy = person('boy', { x: px, z: pz, action: 'fish', tool: 'rod', heading: Math.atan2(ux, uz) });
    const pal = person('girl', { x: px - (uz / l) * 1.3, z: pz + (ux / l) * 1.3, action: 'idle', heading: Math.atan2(ux, uz) });
    const boot = trinket('boot', toon); group.add(boot);
    loops.push((t) => {
      const u = t % 32;
      const caught = u > 22;
      boy.action = u > 21 && u < 24 ? 'wave' : 'fish';
      pal.action = caught && u < 29 ? 'laugh' : 'idle';
      boot.visible = caught;
      if (caught) boot.position.set(px + (ux / l) * 1.2, gy(px, pz) + lerp(0.5, 3.2, sm(span(u, 22, 23.5))), pz + (uz / l) * 1.2);
    });
  }

  // ------------------------------------------------------------------ the mill yard: the goat and the hat
  const yard = meta.route.cart[0];
  if (S.mill && yard) {
    const m = S.mill, ax = Math.sin(m.rot), az = Math.cos(m.rot), px = az, pz = -ax;
    const at = (a, c) => [yard[0] + ax * a + px * c, yard[1] + az * a + pz * c];
    const [bx, bz] = at(14, 16);
    const seat = mesh(new THREE.BoxGeometry(1.6, 0.5, 0.9).translate(0, 0.25, 0), '#b3503c');
    const man = person('stonecutter', { x: bx, z: bz, action: 'sit', hat: null });
    const hat = trinket('hat', toon); group.add(hat);
    const goat = critters.add('goat', { color: '#e8e2d4' });
    const post = at(24, 22);
    const stake = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5).translate(0, 0.5, 0), '#6b4a2e');
    loops.push((t) => {
      const u = (t + 3) % 36;
      seat.position.set(bx, gy(bx, bz), bz);
      stake.position.set(post[0], gy(...post), post[1]);
      man.heading = m.rot + Math.PI / 2;
      const hatSpot = [bx + ax * 0.6, bz + az * 0.6];
      // 0-9 the goat sidles over; 9 takes the hat; 9-14 chewing; 14-26 round the block and away, the man after him; 26-36 back to the post
      if (u < 9) { goTo(goat, post, [hatSpot[0] + px * 0.9, hatSpot[1] + pz * 0.9], sm(span(u, 1, 8.5))); goat.act = u > 7 ? 'sniff' : 'graze'; drop(hat, hatSpot[0], gy(bx, bz) + 0.5, hatSpot[1]); }
      else if (u < 14) { goat.act = 'idle'; hold(hat, goat.mouth); hat.rotation.x = 0.5 + 0.2 * Math.sin(u * 20); }
      else if (u < 26) { const a = (u - 14) * 0.8; const was = [goat.x, goat.z]; goat.x = bx + Math.cos(a) * 5; goat.z = bz + Math.sin(a) * 5; goat.heading = Math.atan2(goat.x - was[0], goat.z - was[1]); hold(hat, goat.mouth); }
      else { goTo(goat, [goat.x, goat.z], post, sm(span(u, 26, 34))); goat.act = 'graze'; hat.visible = u < 30; if (u > 30) hat.visible = false; }
      if (u < 26) hat.visible = true;
      if (u > 14 && u < 26) { const a = (u - 14.6) * 0.8; const was = [man.x, man.z]; man.x = bx + Math.cos(a) * 5.4; man.z = bz + Math.sin(a) * 5.4; man.heading = Math.atan2(man.x - was[0], man.z - was[1]); man.action = 'run'; man.speed = 2.4; man.y = null; }
      else if (u >= 11 && u <= 14) { man.x = bx; man.z = bz; man.action = 'shake'; man.y = null; }
      else if (u >= 26 && u < 31) { man.action = 'walk'; goTo(man, [man.x, man.z], [bx, bz], sm(span(u, 26, 30))); }
      else { man.x = bx; man.z = bz; man.action = 'sit'; man.heading = m.rot + Math.PI / 2; }
    });
  }

  // ------------------------------------------------------------------ the main wharf: a gull steals a fish
  if (S.wharf) {
    const W = S.wharf, dx = Math.sin(W.rot), dz = Math.cos(W.rot);
    const at = (d, side) => [W.x + dx * d + dz * side, W.z + dz * d - dx * side];
    const deck = () => (meta.highWater + 1.6) * exag() + 0.6;
    const [sx, sz] = at(W.length * 0.55, 4.5);
    const man = person('sailor', { x: sx, z: sz, action: 'sit', heading: W.rot - Math.PI / 2, y: () => deck() });
    const basket = mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.35, 10).translate(0, 0.17, 0), '#b08a4a');
    const fish = trinket('fish', toon); group.add(fish);
    const gull = new THREE.Group();
    const white = mat('#f4f2ec');
    gull.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.7), white));
    const wings = [1, -1].map((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.4).translate(0.55 * s, 0, 0), white); gull.add(w); return w; });
    gull.scale.setScalar(1.6);
    group.add(gull);
    loops.push((t) => {
      const u = (t + 11) % 30;
      const [bx, bz] = [sx + dx * 0.9, sz + dz * 0.9];
      basket.position.set(bx, deck(), bz);
      // 0-8 circling high; 8-10 dive; 10 snatch; 10-16 away over the Basin with it; the man shakes his fist
      const a = u * 0.6;
      let gx = bx + Math.cos(a) * 14, gz = bz + Math.sin(a) * 14, gyv = deck() + 14;
      if (u > 8 && u < 10) { const w = sm(span(u, 8, 10)); gx = lerp(gx, bx, w); gz = lerp(gz, bz, w); gyv = lerp(gyv, deck() + 0.8, w); }
      if (u >= 10 && u < 17) { const w = span(u, 10, 17); gx = bx + dx * 80 * w; gz = bz + dz * 80 * w; gyv = deck() + 0.8 + 20 * w; }
      const was = gull.position.clone();
      gull.position.set(gx, gyv, gz);
      if (was.distanceTo(gull.position) > 0.01) gull.rotation.y = Math.atan2(gx - was.x, gz - was.z);
      const flap = Math.sin(t * 9) * (u > 8 && u < 10 ? 0.1 : 0.5);
      wings[0].rotation.z = flap; wings[1].rotation.z = -flap;
      if (u < 10) fish.position.set(bx, deck() + 0.4, bz), fish.rotation.set(0, 1, 0), fish.visible = true;
      else if (u < 17) fish.position.set(gx, gyv - 0.4, gz), fish.visible = true;
      else fish.visible = u > 26;
      man.action = u > 10 && u < 15 ? 'shake' : 'sit';
    });
  }

  // ------------------------------------------------------------------ a herring weir off Breadalbane
  // Fences of stakes and brush in a heart shape: fish swim along the fence into the pound on the
  // flood tide and are trapped there as it falls.
  if (S.redStoreWharf) {
    const RW = S.redStoreWharf, dx = Math.sin(RW.rot), dz = Math.cos(RW.rot);
    const cx = RW.x + dx * (RW.length + 90), cz = RW.z + dz * (RW.length + 90);
    const parts = [];
    const stake = (x, z) => {
      const bot = Math.max(Math.min(data.heightAt(x, z), -1), -12), top = meta.highWater + 1.8;
      parts.push(new THREE.CylinderGeometry(0.12, 0.14, top - bot, 5).translate(x, (top + bot) / 2, z));
    };
    for (let k = 0; k < 44; k++) { // the pound: a circle, open on the shore side
      const a = (k / 44) * Math.PI * 2;
      if (Math.cos(a - RW.rot) > 0.93) continue;
      stake(cx + Math.cos(a) * 16, cz + Math.sin(a) * 16);
    }
    for (let k = 1; k < 16; k++) stake(cx - dx * (16 + k * 4), cz - dz * (16 + k * 4)); // the leader fence toward the shore
    const weir = new THREE.Mesh(mergeGeometries(parts), mat('#5d4029'));
    weir.name = 'herring weir';
    group.add(weir);
    loops.push(() => { weir.scale.y = exag(); });
  }

  // ------------------------------------------------------------------ the farms along Riverview Avenue
  for (const [k, f] of (meta.roadFarms ?? []).entries()) {
    const ox = Math.cos(f.rot), oz = -Math.sin(f.rot), ax = Math.sin(f.rot), az = Math.cos(f.rot);
    const at = (lx, lz) => [f.x + ox * lx + ax * lz, f.z + oz * lx + az * lz];
    // cows grazing out back, hens by the door, a dog on the step, a pig on some
    for (let c = 0; c < (k % 2 ? 2 : 1); c++) {
      const [x0, z0] = at(-30 - c * 8, -10 + c * 14);
      const cow = critters.add('cow', {});
      const p0 = rnd() * 50;
      loops.push((t) => {
        const u = (t + p0) % 50, w = sm(span(u, 20, 30)) - sm(span(u, 42, 50));
        goTo(cow, [x0, z0], [x0 - ox * 8 + ax * 5, z0 - oz * 8 + az * 5], w);
        cow.act = w > 0.02 && w < 0.98 ? 'idle' : 'graze';
      });
    }
    for (let h = 0; h < 3; h++) {
      const hen = critters.add('hen', {});
      const [hx, hz] = at(7 + h * 1.5, -4 + h * 3), p0 = rnd() * 20;
      loops.push((t) => {
        const a = (t + p0) * 0.25;
        hen.x = hx + Math.cos(a) * 2.2; hen.z = hz + Math.sin(a * 1.3) * 1.6;
        hen.heading = Math.atan2(-Math.sin(a), Math.cos(a) * 1.3) + (Math.sin(t * 0.7 + p0) > 0 ? 0 : Math.PI);
        hen.act = Math.sin(t * 1.3 + p0) > 0.2 ? 'graze' : 'idle';
      });
    }
    const [dx, dz] = at(5.5, 0.5);
    critters.add('dog', { x: dx, z: dz, heading: f.rot + Math.PI / 2, act: 'sit' });
    if (k % 3 === 0) { const [px, pz] = at(-6, 12); const pig = critters.add('pig', {}); loops.push((t) => { pig.x = px + Math.sin(t * 0.3 + k) * 2; pig.z = pz + Math.cos(t * 0.21 + k) * 1.5; pig.heading = t * 0.3 + k; pig.act = 'sniff'; }); }
  }

  // ------------------------------------------------------------------ a peddler's cart on Riverview Avenue
  const road = meta.roads?.[0]?.pts;
  if (road && road.length > 20) {
    const curve = new THREE.CatmullRomCurve3(road.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength();
    const cart = world.props.wagon();
    cart.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.2).translate(0, 2.0, -0.4), mat('#7a3b2e')));
    cart.add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 3.4).translate(0, 2.8, -0.4), mat('#3f4650')));
    group.add(cart);
    for (const sx of [-0.62, 0.62]) life.horse({ harness: true, move: life.rideOn(cart, sx, 0, 5.4), y: life.rideY, walking: (h) => h.moving });
    life.person('townsman', { action: 'drive', tool: 'reins', hat: 'top', move: life.rideOn(cart, 0, 1.3, 1.9), y: life.rideY });
    const roadY = (x, z) => world.structures?.userData.roadY?.(x, z) ?? gy(x, z) + 0.22;
    loops.push((t) => {
      // back and forth between the town and the canal at a walk, with a stop at every farm
      const period = (len / 1.7) * 2, u = ((t + 300) % period) / period;
      const d = u < 0.5 ? u * 2 : 2 - u * 2;
      const s = Math.min(0.999, Math.max(0.001, 0.08 + d * 0.9));
      const p = curve.getPointAt(s), tg = curve.getTangentAt(s);
      cart.position.set(p.x, roadY(p.x, p.z), p.z);
      cart.rotation.y = Math.atan2(tg.x, tg.z) + (u < 0.5 ? 0 : Math.PI);
    });
  }

  // ------------------------------------------------------------------ town: hens in the yards, dogs about the streets
  {
    const homes = meta.buildings.filter(([k, x, z]) => (k === 'house' || k === 'cape') && data.inTown(x, z));
    homes.forEach(([, x, z, rot], k) => {
      if (k % 9) return;
      const hx = x - Math.cos(rot) * 9, hz = z + Math.sin(rot) * 9;
      for (let h = 0; h < 2; h++) {
        const hen = critters.add('hen', {}), p0 = rnd() * 30;
        loops.push((t) => { const a = (t + p0) * 0.2; hen.x = hx + Math.cos(a) * 2.5 + h; hen.z = hz + Math.sin(a * 1.2) * 2; hen.heading = a + Math.PI / 2; hen.act = Math.sin(t + p0) > 0 ? 'graze' : 'idle'; });
      }
    });
    const streets = (meta.streets ?? []).filter((s) => !s.bridge && s.pts.length > 3);
    for (let k = 0; k < 4 && streets.length; k++) {
      const st = streets[(k * 3) % streets.length];
      const dog = critters.add('dog', {});
      let s = rnd() * 100, dir = 1;
      const pts = st.pts, segs = [];
      let total = 0;
      for (let q = 0; q + 1 < pts.length; q++) { const L = Math.hypot(pts[q + 1][0] - pts[q][0], pts[q + 1][1] - pts[q][1]); segs.push([pts[q], pts[q + 1], L, total]); total += L; }
      let lastT = 0;
      loops.push((t) => {
        const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
        const trot = Math.sin(t * 0.13 + k * 2) > -0.3;
        s += dir * (trot ? 1.6 : 0) * dt;
        if (s > total || s < 0) { dir = -dir; s = Math.min(Math.max(s, 0), total); }
        const g = segs.find((q) => s <= q[3] + q[2]) ?? segs[segs.length - 1];
        const w = (s - g[3]) / (g[2] || 1), side = st.half + 1.2;
        const tx = (g[1][0] - g[0][0]) / (g[2] || 1), tz = (g[1][1] - g[0][1]) / (g[2] || 1);
        dog.x = lerp(g[0][0], g[1][0], w) - tz * side; dog.z = lerp(g[0][1], g[1][1], w) + tx * side;
        dog.heading = Math.atan2(tx * dir, tz * dir);
        dog.act = trot ? 'idle' : 'sniff';
      });
    }
  }

  return { update(dt, t) { for (const l of loops) l(t, dt); } };
}
