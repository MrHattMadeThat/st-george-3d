// "The Stone's Journey": a block of red granite from the Bay of Fundy Red Granite Co.'s quarry to a
// schooner bound for Boston, summer 1874. Nine steps, each with a caption and its source.
//
// When the journey isn't playing, its props wait at their starting places as part of the scene:
// a scow at the canal landing, a wagon in the mill yard, a schooner at the main wharf.
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

export function buildJourney({ scene, camera, controls, data, world, setTide }) {
  const { meta } = data;
  const S = meta.structures, R = meta.route;
  const exag = () => world.exag;
  const groundAt = (x, z) => data.heightAt(x, z) * exag();
  const waterAt = (x, z) => { const w = data.inlandWaterAt(x, z); return (Number.isNaN(w) ? world.tide : w) * exag(); };

  // ---- props
  const P = world.props;
  const block = P.block(), column = P.column(), scow = P.scow(), wagon = P.wagon(), schooner = P.schooner();
  const sled = P.block(); sled.scale.set(1.4, 0.2, 1.8); sled.material = sled.material.clone(); sled.material.color = new THREE.Color('#6b4a2e');
  const group = new THREE.Group();
  group.name = 'journey';
  group.add(block, column, scow, wagon, schooner, sled);
  scene.add(group);

  // ---- the paths
  const quarry = [S.quarry.x, S.quarry.z];
  const landing = S.quarry.landing;
  const scowPts = R.scow.slice(1);
  // stop the scow short of the dam, beside the mill's flume
  const scowPath = new Path(scowPts.slice(0, Math.max(2, scowPts.length - 3)));
  const cartPath = new Path(R.cart);
  const W = S.wharf;
  const wdir = [Math.sin(W.rot), Math.cos(W.rot)], wside = [wdir[1], -wdir[0]];
  const berth = [W.x + wdir[0] * W.length * 0.7 + wside[0] * 12, W.z + wdir[1] * W.length * 0.7 + wside[1] * 12];
  const sea = R.schooner;
  let k0 = 0;
  sea.forEach((p, k) => { if (Math.hypot(p[0] - berth[0], p[1] - berth[1]) < Math.hypot(sea[k0][0] - berth[0], sea[k0][1] - berth[1])) k0 = k; });
  const seaPts = [berth, [berth[0] + wdir[0] * 40, berth[1] + wdir[1] * 40], ...sea.slice(k0 + 3)];
  const seaPath = new Path(seaPts);
  // where along the voyage the Red Store is passed
  const rs = S.redStoreWharf;
  let redU = 0.3;
  { let best = Infinity; for (let u = 0; u <= 1; u += 0.002) { const p = seaPath.at(u); const d = Math.hypot(p.x - rs.x, p.z - rs.z); if (d < best) { best = d; redU = u; } } }

  // ---- helpers for placing things
  const put = (obj, x, y, z, heading = obj.rotation.y) => { obj.position.set(x, y, z); obj.rotation.y = heading; };
  const onScow = (obj, lift) => { obj.position.copy(scow.position).add(new THREE.Vector3(0, 1.3 + lift, 0)); obj.rotation.y = scow.rotation.y; };
  const deckOf = () => schooner.position.clone().add(new THREE.Vector3(Math.sin(schooner.rotation.y) * -2, 2.9, Math.cos(schooner.rotation.y) * -2));

  function rest() {
    const s0 = scowPath.at(0);
    put(scow, s0.x, waterAt(s0.x, s0.z), s0.z, s0.heading);
    const c0 = cartPath.at(0);
    put(wagon, c0.x, groundAt(c0.x, c0.z), c0.z, c0.heading);
    put(schooner, berth[0], world.tide * exag(), berth[1], W.rot);
    block.visible = false; column.visible = false; sled.visible = false;
  }

  // ---- the steps
  const steps = [
    {
      title: 'The quarry', seconds: 8, source: OHALLORAN,
      text: 'Summer 1874, north of the canal. Quarrymen drill a row of holes along a natural crack in the red granite and split out a block. A horse derrick lifts it clear.',
      update(t) {
        const [qx, qz] = quarry, rot = S.quarry.rot;
        const face = [qx - Math.sin(rot) * 10, qz - Math.cos(rot) * 10], front = [qx + Math.sin(rot) * 8, qz + Math.cos(rot) * 8];
        const u = ease(span(t, 0.25, 0.9));
        const x = face[0] + (front[0] - face[0]) * u, z = face[1] + (front[1] - face[1]) * u;
        block.visible = true; sled.visible = true;
        put(block, x, groundAt(qx, qz) + Math.sin(Math.PI * u) * 14 * (t > 0.25 ? 1 : 0) + 0.5, z, rot + u * 0.8);
        put(sled, front[0], groundAt(front[0], front[1]) + 0.2, front[1], rot);
        return { target: [qx, qz], dist: 150, from: rot + 0.6, tilt: 0.45 };
      },
    },
    {
      title: 'Down to the canal', seconds: 6, source: `${MARTIN}, pp. 12–13 and Map 3`,
      text: 'On a wooden sled, the block is dragged downhill to a landing on the natural canal that joins Lake Utopia to the Magaguadavic River.',
      update(t) {
        const rot = S.quarry.rot, [qx, qz] = quarry;
        const a = [qx + Math.sin(rot) * 8, qz + Math.cos(rot) * 8];
        const u = ease(t), x = a[0] + (landing[0] - a[0]) * u, z = a[1] + (landing[1] - a[1]) * u;
        const heading = Math.atan2(landing[0] - a[0], landing[1] - a[1]);
        put(sled, x, groundAt(x, z) + 0.3, z, heading);
        put(block, x, groundAt(x, z) + 0.7, z, heading);
        return { target: [x, z], dist: 260, from: heading + 2.3, tilt: 0.55 };
      },
    },
    {
      title: 'By scow through the canal', seconds: 10, source: `${MARTIN}, p. 13`,
      text: 'In summer the rough stone went by water. Men pole a flat-bottomed scow west along the canal, loaded with red granite.',
      update(t) {
        sled.visible = false;
        const s = scowPath.at(0.28 * ease(t));
        put(scow, s.x, waterAt(s.x, s.z), s.z, s.heading);
        onScow(block, 0);
        return { target: [s.x, s.z], dist: 170, from: s.heading + 2.6, tilt: 0.42 };
      },
    },
    {
      title: 'Down the Magaguadavic', seconds: 12, source: `${MARTIN}, p. 13`,
      text: '…then down the Magaguadavic River to the falls at St. George, where the company’s mill stood beside the dam.',
      update(t) {
        const s = scowPath.at(0.28 + 0.72 * ease(t));
        put(scow, s.x, waterAt(s.x, s.z), s.z, s.heading);
        onScow(block, 0);
        return { target: [s.x, s.z], dist: 260 + 160 * Math.sin(Math.PI * t), from: s.heading + 2.9, tilt: 0.5 };
      },
    },
    {
      title: 'The finishing mill', seconds: 10, source: `${MARTIN}, p. 13 and Map 4`,
      text: 'The Bay of Fundy Red Granite Co. built a $75,000 mill here, run by water from the falls. Its polishing machine turned blocks into columns, polished with white sand from Lake Utopia.',
      update(t) {
        const m = S.mill, a = [m.x - Math.sin(m.rot) * 40, m.z - Math.cos(m.rot) * 40];
        const s = scowPath.at(1);
        const u = ease(span(t, 0, 0.4));
        const x = s.x + (a[0] - s.x) * u, z = s.z + (a[1] - s.z) * u;
        block.visible = t < 0.45;
        put(block, x, Math.max(groundAt(x, z), waterAt(s.x, s.z) + 1.3) + Math.sin(Math.PI * u) * 10, z);
        // the finished column, turning on the lathe in the yard
        const y = cartPath.at(0);
        column.visible = t > 0.5;
        put(column, y.x - Math.sin(y.heading) * 8, groundAt(y.x, y.z) + 1.2, y.z - Math.cos(y.heading) * 8, y.heading + Math.PI / 2);
        column.rotation.x = t * 30;
        return { target: [m.x, m.z], dist: 260, from: m.rot + 2.2, tilt: 0.55 };
      },
    },
    {
      title: 'Through town to the wharf', seconds: 11, source: `${MARTIN}, Map 4; ${OHALLORAN}`,
      text: 'A horse team hauls the column down through the town, past the Gorge, to the main wharf on St. George Basin.',
      update(t) {
        const c = cartPath.at(ease(t));
        put(wagon, c.x, groundAt(c.x, c.z), c.z, c.heading);
        column.rotation.x = 0;
        column.visible = true;
        put(column, c.x, groundAt(c.x, c.z) + 2.1, c.z, c.heading + Math.PI / 2);
        return { target: [c.x, c.z], dist: 120, from: c.heading + 2.5, tilt: 0.5 };
      },
    },
    {
      title: 'Loading the schooner', seconds: 6, source: `${MARTIN}, pp. 12–15`,
      text: 'The column is swung aboard a schooner. That summer the company’s first orders included seven polished columns for a cathedral in Boston.',
      update(t) {
        const c = cartPath.at(1), d = deckOf(), u = ease(t);
        const from = new THREE.Vector3(c.x, groundAt(c.x, c.z) + 2.1, c.z);
        const p = from.clone().lerp(d, u);
        p.y += Math.sin(Math.PI * u) * 12;
        column.position.copy(p);
        column.rotation.y = schooner.rotation.y + Math.PI / 2;
        return { target: [berth[0], berth[1]], dist: 170, from: W.rot + 2.1, tilt: 0.5 };
      },
    },
    {
      title: 'Down the estuary on the tide', seconds: 12, source: `${MARTIN}, p. 10`,
      text: 'At high water the schooner slips down the tidal Magaguadavic, past the Red Store wharf at Breadalbane…',
      enter() { setTide(3.2); },
      update(t) {
        const s = seaPath.at(redU * 1.25 * ease(t));
        put(schooner, s.x, world.tide * exag(), s.z, s.heading);
        column.position.copy(deckOf()); column.rotation.y = s.heading + Math.PI / 2;
        return { target: [s.x, s.z], dist: 420, from: s.heading + 2.4, tilt: 0.45 };
      },
    },
    {
      title: 'Out to sea', seconds: 14, source: MARTIN,
      text: '…across Passamaquoddy Bay and out through Letete Passage to the Bay of Fundy, bound for Boston.',
      update(t) {
        const s = seaPath.at(redU * 1.25 + (1 - redU * 1.25) * ease(t));
        put(schooner, s.x, world.tide * exag(), s.z, s.heading);
        column.position.copy(deckOf()); column.rotation.y = s.heading + Math.PI / 2;
        return { target: [s.x, s.z], dist: 700 + 5200 * ease(span(t, 0.2, 1)), from: s.heading + 2.6, tilt: 0.5 + 0.35 * span(t, 0.2, 1) };
      },
    },
  ];

  // ---- playing
  const state = { step: -1, t: 0, playing: false, speed: 1, onChange: () => {} };
  const want = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  let savedTide = null;

  function go(k) {
    k = Math.max(0, Math.min(steps.length - 1, k));
    if (savedTide === null) savedTide = world.tide;
    // replay earlier steps to their ends so every prop is where that step leaves it
    rest();
    for (let q = 0; q < k; q++) { steps[q].enter?.(); steps[q].update(1); }
    state.step = k; state.t = 0;
    steps[k].enter?.();
    frame(0, true);
    state.onChange();
  }
  function stop() {
    state.playing = false; state.step = -1;
    if (savedTide !== null) { setTide(savedTide); savedTide = null; }
    rest();
    state.onChange();
  }
  function frame(dt, snap = false) {
    if (state.step < 0) return;
    const s = steps[state.step];
    if (state.playing) state.t = Math.min(1, state.t + (dt * state.speed) / s.seconds);
    const view = s.update(state.t);
    const y = groundAt(view.target[0], view.target[1]);
    want.target.set(view.target[0], Math.max(y, world.tide * exag()), view.target[1]);
    const flat = Math.cos(view.tilt) * view.dist;
    want.pos.set(want.target.x + Math.sin(view.from) * flat, want.target.y + Math.sin(view.tilt) * view.dist, want.target.z + Math.cos(view.from) * flat);
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(want.pos, k);
    controls.target.lerp(want.target, k);
    if (state.t >= 1 && state.playing) {
      if (state.step < steps.length - 1) { state.step++; state.t = 0; steps[state.step].enter?.(); state.onChange(); }
      else { state.playing = false; state.onChange(); }
    }
  }

  rest();
  return {
    steps, state,
    play() { if (state.step < 0 || (state.step === steps.length - 1 && state.t >= 1)) go(0); state.playing = true; state.onChange(); },
    pause() { state.playing = false; state.onChange(); },
    go, stop, frame,
    /** put props back after the hill height changes */
    refresh() { if (state.step < 0) rest(); },
    get active() { return state.step >= 0; },
  };
}
