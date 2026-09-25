// Farm animals and town animals: dogs, cats, cows, pigs, goats, geese, hens and ducks.
//
// Each animal is a small group of toon-shaded blocks with legs on pivots. Like the people, their
// legs are paced by how far they really move, so nothing skates; a critter's `move(c, dt, t)`
// sets where it is and which way it faces, and `act` picks a pose ('idle', 'graze', 'flap',
// 'beg', 'swim', 'sit'). There are only a few dozen, so each is its own set of meshes.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const SCALE = 1.45; // drawn larger than life, a little more than the people (people.js CARTOON), so they read on screen

const mats = new Map(); // one material per colour, shared by every animal
function part(geo, color, toon) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshToonMaterial({ color, gradientMap: toon }));
  return new THREE.Mesh(geo, mats.get(color));
}
const B = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const E = (r, sx, sy, sz, x = 0, y = 0, z = 0) => new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, sz).translate(x, y, z);
const C = (r0, r1, h, x = 0, y = 0, z = 0, seg = 6) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);

// kind: body parts, where the legs hang (x, z) and how long they are, colours
const KINDS = {
  dog: { leg: 0.36, stride: 0.55, legs: [[0.1, 0.24], [-0.1, 0.24], [0.1, -0.24], [-0.1, -0.24]], colors: ['#7a5230', '#2b2522', '#c9a36b', '#e8e0d0'],
    build(g, col, dark, toon) {
      g.add(part(E(0.2, 0.9, 0.9, 1.9, 0, 0.5, 0), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.62, 0.38); g.add(head);
      head.add(part(E(0.14, 1, 1, 1.1), col, toon), part(B(0.11, 0.1, 0.16, 0, -0.03, 0.14), col, toon), part(B(0.05, 0.05, 0.04, 0, -0.01, 0.23), '#1a1614', toon));
      for (const s of [-1, 1]) head.add(part(B(0.05, 0.13, 0.08, s * 0.09, 0.1, -0.02).rotateZ(s * 0.3), dark, toon));
      const tail = new THREE.Group(); tail.position.set(0, 0.58, -0.36); g.add(tail);
      tail.add(part(C(0.025, 0.035, 0.3, 0, 0.15, 0, 5), col, toon));
      return { head, tail };
    } },
  cat: { leg: 0.2, stride: 0.3, legs: [[0.06, 0.12], [-0.06, 0.12], [0.06, -0.12], [-0.06, -0.12]], colors: ['#8a8680', '#d08a3a', '#2b2522'],
    build(g, col, dark, toon) {
      g.add(part(E(0.12, 0.8, 0.8, 1.7, 0, 0.28, 0), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.36, 0.2); g.add(head);
      head.add(part(E(0.085, 1, 0.95, 1), col, toon));
      for (const s of [-1, 1]) head.add(part(new THREE.ConeGeometry(0.03, 0.07, 4).translate(s * 0.05, 0.08, 0), col, toon));
      const tail = new THREE.Group(); tail.position.set(0, 0.32, -0.2); g.add(tail);
      tail.add(part(C(0.018, 0.018, 0.3, 0, 0.15, 0, 5), col, toon));
      return { head, tail };
    } },
  cow: { leg: 0.72, stride: 1.1, legs: [[0.26, 0.6], [-0.26, 0.6], [0.26, -0.6], [-0.26, -0.6]], colors: ['#8a4a2a', '#b07040', '#6b3a22', '#e8e2d4'],
    build(g, col, dark, toon) {
      g.add(part(B(0.72, 0.72, 1.6, 0, 1.1, 0), col, toon));
      g.add(part(E(0.2, 1.2, 1, 1.4, 0.18, 1.2, -0.3), '#f2ede2', toon)); // a white patch
      g.add(part(E(0.12, 1.3, 0.6, 1, 0, 0.72, -0.35), '#e8b8a8', toon)); // udder
      const head = new THREE.Group(); head.position.set(0, 1.3, 0.85); g.add(head);
      head.add(part(B(0.34, 0.36, 0.5, 0, -0.08, 0.2), col, toon), part(B(0.3, 0.2, 0.16, 0, -0.2, 0.47), '#e8c8b8', toon));
      for (const s of [-1, 1]) {
        head.add(part(B(0.16, 0.06, 0.08, s * 0.24, 0.02, 0.08), col, toon));
        head.add(part(new THREE.ConeGeometry(0.03, 0.16, 5).rotateZ(-s * 1.1).translate(s * 0.2, 0.14, 0.1), '#e8e0cb', toon));
      }
      const tail = new THREE.Group(); tail.position.set(0, 1.4, -0.8); g.add(tail);
      tail.add(part(C(0.02, 0.02, 0.8, 0, -0.4, 0, 4), col, toon), part(E(0.05, 1, 1.6, 1, 0, -0.8, 0), dark, toon));
      return { head, tail, sway: 0.25 };
    } },
  pig: { leg: 0.24, stride: 0.42, legs: [[0.15, 0.3], [-0.15, 0.3], [0.15, -0.3], [-0.15, -0.3]], colors: ['#e8a8a0', '#f0bcb0', '#d89890'],
    build(g, col, dark, toon) {
      g.add(part(E(0.28, 1, 0.95, 1.6, 0, 0.42, 0), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.46, 0.42); g.add(head);
      head.add(part(E(0.17, 1, 0.95, 1), col, toon), part(C(0.08, 0.08, 0.08, 0, 0, 0.16, 8).rotateX(Math.PI / 2), '#d88080', toon));
      for (const s of [-1, 1]) head.add(part(new THREE.ConeGeometry(0.05, 0.12, 4).rotateX(0.5).translate(s * 0.1, 0.13, -0.02), col, toon));
      const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.44); g.add(tail);
      tail.add(part(new THREE.TorusGeometry(0.04, 0.012, 4, 8), col, toon));
      return { head, tail };
    } },
  goat: { leg: 0.45, stride: 0.6, legs: [[0.12, 0.28], [-0.12, 0.28], [0.12, -0.28], [-0.12, -0.28]], colors: ['#e8e2d4', '#8a8680', '#6b5a44'],
    build(g, col, dark, toon) {
      g.add(part(E(0.24, 0.85, 0.9, 1.7, 0, 0.62, 0), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.86, 0.42); g.add(head);
      head.add(part(B(0.16, 0.2, 0.3, 0, 0, 0.1), col, toon), part(B(0.06, 0.14, 0.06, 0, -0.14, 0.2), dark, toon)); // the beard
      for (const s of [-1, 1]) head.add(part(new THREE.ConeGeometry(0.025, 0.2, 5).rotateX(-0.6).translate(s * 0.05, 0.16, -0.04), '#5a5048', toon));
      const tail = new THREE.Group(); tail.position.set(0, 0.8, -0.4); g.add(tail);
      tail.add(part(C(0.02, 0.03, 0.12, 0, 0.06, 0, 4), col, toon));
      return { head, tail };
    } },
  goose: { leg: 0.2, stride: 0.22, legs: [[0.06, 0], [-0.06, 0]], colors: ['#f4f1ea', '#b8b4a8'], feet: '#e89a3a',
    build(g, col, dark, toon) {
      g.add(part(E(0.18, 1, 0.9, 1.5, 0, 0.36, -0.04), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.42, 0.18); g.add(head);
      head.add(part(C(0.035, 0.045, 0.4, 0, 0.2, 0, 6), col, toon), part(E(0.06, 1, 1, 1.2, 0, 0.42, 0.02), col, toon), part(B(0.05, 0.04, 0.1, 0, 0.41, 0.1), '#e89a3a', toon));
      const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.16, 0.42, 0); w.add(part(B(0.03, 0.14, 0.34, s * 0.02, -0.04, -0.04), '#e8e4da', toon)); g.add(w); return w; });
      const tail = new THREE.Group(); tail.position.set(0, 0.42, -0.3); g.add(tail);
      tail.add(part(new THREE.ConeGeometry(0.07, 0.14, 5).rotateX(-2).translate(0, 0, -0.03), col, toon));
      return { head, tail, wings, biped: true };
    } },
  hen: { leg: 0.12, stride: 0.12, legs: [[0.04, 0], [-0.04, 0]], colors: ['#a0522d', '#f2ede2', '#3a2a1e', '#c8783a'], feet: '#d8a040',
    build(g, col, dark, toon) {
      g.add(part(E(0.12, 1, 1, 1.3, 0, 0.22, 0), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.32, 0.12); g.add(head);
      head.add(part(E(0.06, 1, 1, 1), col, toon), part(B(0.02, 0.05, 0.06, 0, 0.06, 0), '#c83a2a', toon), part(new THREE.ConeGeometry(0.02, 0.05, 4).rotateX(Math.PI / 2).translate(0, 0, 0.07), '#e8b040', toon));
      const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.1, 0.27, 0); w.add(part(B(0.02, 0.1, 0.18, 0, -0.03, -0.02), col, toon)); g.add(w); return w; });
      const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.14); g.add(tail);
      tail.add(part(B(0.03, 0.14, 0.08, 0, 0.06, -0.02).rotateX(-0.5), dark, toon));
      return { head, tail, wings, biped: true };
    } },
  duck: { leg: 0.08, stride: 0.1, legs: [], colors: ['#8a6a48', '#6b5a44'],
    build(g, col, dark, toon) {
      g.add(part(E(0.13, 1, 0.8, 1.5, 0, 0.06, 0), col, toon));
      const head = new THREE.Group(); head.position.set(0, 0.16, 0.15); g.add(head);
      head.add(part(E(0.065, 1, 1, 1.1, 0, 0.04, 0), col, toon), part(B(0.05, 0.02, 0.07, 0, 0.03, 0.08), '#d8a040', toon));
      const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.18); g.add(tail);
      tail.add(part(new THREE.ConeGeometry(0.04, 0.08, 4).rotateX(-2.2), col, toon));
      return { head, tail, swims: true };
    } },
};

export function makeCritters(scene, toon) {
  const group = new THREE.Group();
  group.name = 'animals';
  scene.add(group);
  const list = [];
  let seed = 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  /** add an animal. o: { x, z, heading, color, size, move(c, dt, t), y(c), act } */
  function add(kind, o = {}) {
    const K = KINDS[kind];
    const col = o.color ?? K.colors[Math.floor(rnd() * K.colors.length)];
    const dark = new THREE.Color(col).multiplyScalar(0.55).getStyle();
    const g = new THREE.Group();
    g.name = kind;
    const bits = K.build(g, col, dark, toon);
    const legs = K.legs.map(([x, z]) => {
      const p = new THREE.Group();
      p.position.set(x, K.leg, z);
      p.add(part(C(K.leg * 0.12, K.leg * 0.09, K.leg, 0, -K.leg / 2, 0, 5), K.feet ?? col, toon));
      g.add(p);
      return p;
    });
    const s = SCALE * (o.size ?? 1);
    g.scale.setScalar(s);
    group.add(g);
    // `holding`: a group at the mouth (a dog's stolen lunch pail, a goat's stolen hat)
    const mouth = new THREE.Group();
    mouth.position.set(0, -0.06, kind === 'goat' ? 0.3 : 0.26);
    bits.head.add(mouth);
    const c = { kind, g, legs, ...bits, mouth, x: 0, z: 0, heading: 0, act: 'idle', seed: rnd(), gait: rnd(), pace: 0, stride: K.stride * s, legLen: K.leg, ...o };
    list.push(c);
    return c;
  }

  const V = new THREE.Vector3();
  function update(dt, t, { camera, groundY }) {
    const cam = camera.position;
    for (const c of list) {
      if (c.move) c.move(c, dt, t);
      // paced by distance, like the people
      const d = c.px === undefined ? 0 : Math.hypot(c.x - c.px, c.z - c.pz);
      c.px = c.x; c.pz = c.z;
      const step = d > 3 ? 0 : d;
      c.gait += Math.min(step / c.stride, 3.2 * dt);
      const v = dt > 0 ? Math.min(step / dt, 12) : 0;
      c.pace += (v - c.pace) * Math.min(1, dt * 6);
      const far = c.hidden || Math.hypot(c.x - cam.x, c.z - cam.z) > 1600;
      c.g.visible = !far;
      if (far) continue;
      const amp = Math.min(1, c.pace / 0.6);
      const tt = t + c.seed * 20;
      const y = c.y ? c.y(c) : groundY(c.x, c.z);
      const hop = c.biped ? Math.abs(Math.sin(c.gait * Math.PI)) * 0.03 * amp : Math.abs(Math.sin(c.gait * TAU)) * 0.02 * amp;
      c.g.position.set(c.x, y + hop * c.g.scale.y, c.z);
      c.g.rotation.set(0, c.heading, c.biped ? Math.sin(c.gait * Math.PI) * 0.12 * amp : 0);
      // legs: diagonal pairs (trot) for four legs, alternate for two
      c.legs.forEach((p, k) => {
        const ph = c.biped ? k * 0.5 : [0, 0.5, 0.5, 0][k];
        p.rotation.x = Math.sin((c.gait + ph) * TAU) * 0.55 * amp;
      });
      // head and tail
      const act = c.act;
      let hx = 0, hy = 0.25 * Math.sin(tt * 0.3) * (1 - amp);
      if (act === 'graze') hx = 0.9 + 0.1 * Math.sin(tt * 2);
      if (act === 'beg' || act === 'bark') hx = -0.3 + (act === 'bark' ? 0.25 * Math.max(0, Math.sin(tt * 9)) : 0);
      if (act === 'hiss') { hx = 0.5; hy = 0; }
      if (act === 'sniff') hx = 0.6 + 0.15 * Math.sin(tt * 7);
      c.head.rotation.set(hx, hy, 0);
      if (c.tail) c.tail.rotation.set(act === 'wag' || act === 'beg' || (c.kind === 'dog' && amp > 0.3) ? 0.6 : 0.15, 0, (act === 'wag' || act === 'beg' ? 0.7 : 0.25) * Math.sin(tt * (act === 'wag' || act === 'beg' ? 14 : 2)) + (c.sway ?? 0) * Math.sin(tt * 0.9));
      if (c.wings) { const f = act === 'flap' || act === 'hiss' ? 0.2 + 0.9 * Math.abs(Math.sin(tt * 14)) : 0; c.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * f; }); }
      if (act === 'sit' && c.legs.length === 4) { c.legs[2].rotation.x = c.legs[3].rotation.x = -1.2; c.g.position.y -= c.legLen * 0.35 * c.g.scale.y; }
    }
  }
  return { group, list, add, update, head: (c) => c.head.getWorldPosition(V).clone() };
}

// a tin lunch pail, a straw hat, a fish, a boot: small things animals and people carry off
export function trinket(kind, toon) {
  const g = new THREE.Group();
  if (kind === 'pail') g.add(part(C(0.1, 0.09, 0.16, 0, -0.08, 0, 10), '#9aa0a6', toon), part(new THREE.TorusGeometry(0.08, 0.008, 4, 10, Math.PI).translate(0, 0.02, 0), '#6a6e72', toon));
  if (kind === 'hat') g.add(part(C(0.25, 0.25, 0.02, 0, 0, 0, 10), '#d9c27a', toon), part(C(0.12, 0.13, 0.1, 0, 0.06, 0, 10), '#d9c27a', toon), part(C(0.131, 0.131, 0.03, 0, 0.04, 0, 10), '#7a3b2e', toon));
  if (kind === 'fish') g.add(part(E(0.06, 1, 0.8, 3, 0, 0, 0), '#b8c4cc', toon), part(new THREE.ConeGeometry(0.05, 0.08, 4).rotateX(Math.PI / 2).translate(0, 0, -0.22), '#98a4ac', toon));
  if (kind === 'boot') g.add(part(B(0.1, 0.22, 0.12, 0, 0.1, 0), '#2b211a', toon), part(B(0.1, 0.08, 0.26, 0, 0.0, 0.07), '#2b211a', toon));
  if (kind === 'ladder') { for (const s of [-1, 1]) g.add(part(B(0.06, 0.06, 4, s * 0.22, 0, 0), '#8a6a48', toon)); for (let k = 0; k < 11; k++) g.add(part(B(0.44, 0.04, 0.04, 0, 0, -1.8 + k * 0.36), '#8a6a48', toon)); }
  if (kind === 'hoop') g.add(part(new THREE.TorusGeometry(0.35, 0.02, 4, 18), '#8a6a48', toon));
  return g;
}
