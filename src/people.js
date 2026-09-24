// Cartoon people and horses, posed in code.
//
// Every body part (legs, torso, arms, head, hats, tools...) is one InstancedMesh shared by the
// whole crowd, so hundreds of figures cost a couple of dozen draw calls. Each frame a figure's
// action turns the time into a pose (joint angles), and the pose into part matrices.
//
// Parts are coloured two ways: vertices marked `keep` hold their own colour (skin, boots, iron),
// the rest take the figure's colour for that part (coat, trousers, dress, hat).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ geometry

function paint(geo, color, keep) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, c = new THREE.Color(color);
  const col = new Float32Array(n * 3), k = new Float32Array(n).fill(keep ? 1 : 0);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('keep', new THREE.BufferAttribute(k, 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const TINT = '#ffffff';
/** box from y0 to y0+h */
const bx = (w, h, d, x, y0, z, color = TINT, keep = false) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z), color, keep);
const cy = (r0, r1, h, x, y0, z, color = TINT, keep = false, seg = 7) => paint(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y0 + h / 2, z), color, keep);
const sp = (r, x, y, z, color = TINT, keep = false, sx = 1, sy = 1, sz = 1, detail = 1) => paint(new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z), color, keep);
const merge = (a) => mergeGeometries(a);

const SKIN_HAND = '#dcae8a', BOOT = '#2b211a', IRON = '#5a5a5e', WOOD = '#8a6a48', DARK = '#2a2622';

// Body, 1.75 m tall. Figures face +z; their left is +x. Pivots: legs at the hip, arms at the
// shoulder, head at the top of the neck, torso at the hip.
const HIP = 0.92;
// a four-sided tapered block (a squared-off cylinder): coats and waistcoats
const slab = (wTop, wBot, h, depth, y0, color = TINT, keep = false) =>
  paint(new THREE.CylinderGeometry(wTop / Math.SQRT2, wBot / Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4).scale(1, 1, depth / wTop).translate(0, y0 + h / 2, 0), color, keep);
const BODY = {
  leg: () => merge([cy(0.09, 0.075, 0.8, 0, -0.8, 0), bx(0.16, 0.13, 0.28, 0, -0.92, 0.05, BOOT, true)]),
  torso: () => merge([slab(0.46, 0.38, 0.58, 0.26, 0), slab(0.42, 0.5, 0.24, 0.3, -0.1), sp(0.09, 0.2, 0.52, 0, TINT, false, 1, 1, 1, 0), sp(0.09, -0.2, 0.52, 0, TINT, false, 1, 1, 1, 0),
    bx(0.14, 0.22, 0.02, 0, 0.34, 0.13, '#efe9dc', true), cy(0.065, 0.07, 0.1, 0, 0.57, 0, '#e0b48f', true)]),
  arm: () => merge([cy(0.066, 0.056, 0.54, 0, -0.54, 0), sp(0.058, 0, -0.6, 0.01, SKIN_HAND, true, 1, 1, 1, 0)]),
  head: () => merge([sp(0.15, 0, 0.14, 0), bx(0.05, 0.06, 0.06, 0, 0.12, 0.15), bx(0.035, 0.035, 0.02, 0.055, 0.17, 0.14, DARK, true), bx(0.035, 0.035, 0.02, -0.055, 0.17, 0.14, DARK, true),
    sp(0.15, 0, 0.17, -0.02, '#5a4030', true, 1.02, 0.7, 1.02)]),
  beard: () => merge([bx(0.22, 0.14, 0.12, 0, 0.0, 0.08), bx(0.2, 0.05, 0.05, 0, 0.1, 0.13)]),
  skirt: () => merge([cy(0.2, 0.36, 0.88, 0, -0.88, 0, TINT, false, 9), bx(0.26, 0.6, 0.02, 0, -0.66, 0.29, '#efe9dc', true)]),
};
const HATS = {
  cap: () => merge([cy(0.155, 0.16, 0.08, 0, 0.24, 0), bx(0.24, 0.02, 0.12, 0, 0.24, 0.16)]),
  bowler: () => merge([cy(0.23, 0.23, 0.02, 0, 0.23, 0), sp(0.15, 0, 0.29, 0, TINT, false, 1, 0.75, 1), cy(0.152, 0.152, 0.03, 0, 0.25, 0, DARK, true)]),
  top: () => merge([cy(0.24, 0.24, 0.02, 0, 0.23, 0), cy(0.14, 0.14, 0.3, 0, 0.24, 0), cy(0.142, 0.142, 0.04, 0, 0.26, 0, DARK, true)]),
  straw: () => merge([cy(0.3, 0.3, 0.02, 0, 0.23, 0), cy(0.13, 0.15, 0.12, 0, 0.24, 0), cy(0.152, 0.152, 0.03, 0, 0.25, 0, '#7a3b2e', true)]),
  bonnet: () => merge([sp(0.18, 0, 0.2, -0.03, TINT, false, 1, 0.95, 1.05), bx(0.36, 0.3, 0.05, 0, 0.06, 0.1)]),
};
// Tools are drawn in the space of whatever holds them: a hand (the arm points down -y, so a
// handle carries on along -y) or the figure's own root.
const TOOLS = {
  sledge: () => merge([cy(0.022, 0.022, 0.8, 0, -0.8, 0.02, WOOD, true, 5), bx(0.11, 0.11, 0.3, 0, -0.9, 0.02, IRON, true)]),
  drill: () => merge([cy(0.022, 0.022, 0.5, 0, 0, 0, '#8d8f96', true, 5), cy(0.036, 0.03, 0.05, 0, 0.5, 0, '#b8b9bd', true, 6)]),
  chisel: () => cy(0.015, 0.02, 0.26, 0, -0.2, 0.04, '#8d8f96', true, 5).rotateX(0.4),
  mallet: () => merge([cy(0.018, 0.018, 0.3, 0, -0.3, 0.02, WOOD, true, 5), cy(0.07, 0.07, 0.18, 0, 0, 0, '#a07a4a', true, 8).rotateZ(Math.PI / 2).translate(0, -0.32, 0.02)]),
  crowbar: () => cy(0.022, 0.022, 1.5, 0, -1.4, 0.02, IRON, true, 5),
  pole: () => cy(0.03, 0.03, 5.2, 0, -4.4, 0, WOOD, true, 5),
  rod: () => cy(0.015, 0.03, 3.2, 0, 0, 0, WOOD, true, 5),
  sack: () => merge([sp(0.24, 0, 0, 0, '#c8b894', true, 1.2, 0.8, 0.9), bx(0.08, 0.08, 0.08, 0, 0.2, 0, '#8a7a5a', true)]),
  crate: () => bx(0.5, 0.36, 0.4, 0, -0.18, 0, '#9a7a55', true),
  hoe: () => merge([cy(0.02, 0.02, 1.4, 0, -1.3, 0.02, WOOD, true, 5), bx(0.2, 0.03, 0.14, 0, -1.34, 0.08, IRON, true)]),
  basket: () => merge([cy(0.17, 0.13, 0.2, 0, -0.3, 0.05, '#b08a4a', true, 8), paint(new THREE.TorusGeometry(0.15, 0.015, 4, 10, Math.PI).translate(0, -0.12, 0.05), '#8a6a3a', true)]),
  oar: () => merge([cy(0.02, 0.02, 2.2, 0, -1.8, 0, WOOD, true, 5), bx(0.03, 0.5, 0.14, 0, -1.9, 0, WOOD, true)]),
  reins: () => bx(0.5, 0.02, 0.8, 0, -0.05, 0.4, '#3b2a1c', true),
  axe: () => merge([cy(0.022, 0.022, 0.8, 0, -0.8, 0.02, WOOD, true, 5), bx(0.04, 0.16, 0.24, 0, -0.9, 0.1, IRON, true)]),
  cloth: () => bx(0.5, 0.6, 0.03, 0, -0.1, 0.15, '#f2efe6', true),
};

// Horse: 1.6 m at the withers, facing +z. Legs pivot under the body.
const HORSE = {
  body: () => merge([bx(0.62, 0.72, 1.85, 0, 0.95, 0), sp(0.36, 0, 1.3, -0.8, TINT, false, 0.9, 1, 0.9), sp(0.36, 0, 1.33, 0.75, TINT, false, 0.9, 1, 0.9)]),
  head: () => merge([bx(0.26, 0.85, 0.36, 0, 0, 0.1).rotateX(0.65), bx(0.25, 0.28, 0.62, 0, 0.58, 0.62).rotateX(0.25), bx(0.06, 0.55, 0.14, 0, 0.1, -0.1, DARK, true).rotateX(0.65),
    bx(0.06, 0.12, 0.08, 0.09, 0.95, 0.35, DARK, true), bx(0.06, 0.12, 0.08, -0.09, 0.95, 0.35, DARK, true)]),
  leg: () => merge([bx(0.15, 0.82, 0.17, 0, -0.82, 0), bx(0.17, 0.13, 0.19, 0, -0.95, 0.01, DARK, true)]),
  tail: () => bx(0.1, 0.75, 0.12, 0, -0.75, 0, DARK, true),
  harness: () => merge([bx(0.66, 0.1, 0.16, 0, 1.62, 0.55, '#3b2a1c', true), bx(0.7, 0.34, 0.12, 0, 1.2, 0.95, '#3b2a1c', true)]),
};

// ------------------------------------------------------------------ poses

// A pose is joint angles in radians (+ is forward/outward) and offsets in metres.
function blankPose(p) {
  p.lean = 0; p.twist = 0; p.bob = 0; p.drop = 0; p.headYaw = 0; p.headPitch = 0;
  p.armLp = 0.06; p.armLr = 0.08; p.armRp = 0.06; p.armRr = 0.08; p.legL = 0; p.legR = 0;
  p.tool = null; // { rx, ry, rz, x, y, z } extra placement for the tool
  p.strike = 0;  // 1 on the frame a hammer lands
  return p;
}
const TAU = Math.PI * 2;
const smooth = (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const pulse = (u, a, b) => (u >= a && u < b ? 1 : 0);

export const ACTIONS = {
  idle(p, t, f) {
    p.bob = Math.sin(t * 1.6) * 0.008;
    p.headYaw = Math.sin(t * 0.37 + f.seed * 5) * 0.5 * smooth(0.3, 0.8, Math.sin(t * 0.21 + f.seed * 3));
    p.armLp = 0.05 + Math.sin(t * 1.6) * 0.02; p.armRp = p.armLp;
  },
  walk(p, t, f) {
    const s = Math.sin(TAU * (f.speed / 1.5) * t), c = Math.cos(TAU * (f.speed / 1.5) * t);
    p.legL = 0.42 * s; p.legR = -0.42 * s;
    p.armLp = -0.34 * s; p.armRp = 0.34 * s;
    p.bob = Math.abs(c) * 0.035; p.lean = 0.05;
    p.headYaw = Math.sin(t * 0.3 + f.seed * 7) * 0.25;
  },
  run(p, t, f) {
    const s = Math.sin(TAU * (f.speed / 2.2) * t), c = Math.cos(TAU * (f.speed / 2.2) * t);
    p.legL = 0.75 * s; p.legR = -0.75 * s;
    p.armLp = 0.35 - 0.7 * s; p.armRp = 0.35 + 0.7 * s; p.armLr = p.armRr = 0.15;
    p.bob = Math.abs(c) * 0.09; p.lean = 0.22;
  },
  carry(p, t, f) { // walking with a load held up in front
    ACTIONS.walk(p, t, f);
    p.armLp = p.armRp = 1.25; p.armLr = p.armRr = -0.15; p.lean = 0.0;
    p.tool = { x: 0, y: 1.22, z: 0.36, root: true };
  },
  shoulder(p, t, f) { // walking with a sack on the shoulder
    ACTIONS.walk(p, t, f);
    p.armRp = 2.7; p.armRr = 0.25; p.headYaw = -0.2;
    p.tool = { x: -0.22, y: 1.62, z: -0.02, root: true };
  },
  // double-jack drilling: two strikers swing in turn at a drill a kneeling man holds and turns
  strike(p, t, f) {
    const u = (t / 1.3) % 1;
    const up = smooth(0.08, 0.5, u), down = smooth(0.5, 0.6, u);
    // arms: forward and down at the blow (shoulder to drill head is ~1.5 m at 36 degrees below
    // level, the length of arm plus sledge), back over the head at the top of the swing
    const a = 0.75 + 2.25 * up - 2.25 * down;
    p.armLp = p.armRp = a; p.armLr = -0.24; p.armRr = 0.24;
    p.lean = 0.12 - 0.22 * up + 0.3 * down;
    p.legL = 0.28; p.legR = -0.18;
    p.strike = u >= 0.58 && u < 0.63 ? 1 : 0;
    p.headPitch = 0.35;
    // wrists cock the sledge back at the top and snap it through at the blow
    p.tool = { rx: 0.9 * (up - down) - 0.25 * down * (1 - smooth(0.7, 1, u)) };
  },
  holdDrill(p, t) {
    p.drop = 0.5; p.legL = p.legR = 1.45; p.lean = 0.32;
    p.armLp = p.armRp = 0.72; p.armLr = -0.22; p.armRr = 0.22;
    p.headPitch = 0.35; p.headYaw = 0.2 * Math.sin(t * 0.5);
    // the drill turns a little after every blow
    p.tool = { x: 0, y: 0.5, z: 0.55, ry: Math.floor(t / 0.65) * 0.4, root: true }; // back up by the kneel, so it stands on the rock
  },
  chisel(p, t, f) { // stonecutter at the banker: chisel in the left hand, mallet tapping in the right
    const u = (t * (1.8 + f.seed * 0.6)) % 1;
    p.lean = 0.42; p.headPitch = 0.45;
    p.armLp = 1.1; p.armLr = -0.25;
    p.armRp = 0.95 + 0.55 * smooth(0, 0.55, u) - 0.55 * smooth(0.55, 0.68, u); p.armRr = 0.3;
    p.legL = 0.15; p.legR = -0.1;
    p.strike = u >= 0.66 && u < 0.72 ? 1 : 0;
  },
  pry(p, t, f) {
    const s = Math.sin(TAU * 0.45 * t + f.seed * 6);
    p.lean = 0.55 + 0.12 * s; p.armLp = p.armRp = 1.2 + 0.3 * s; p.armLr = -0.2; p.armRr = 0.2;
    p.legL = 0.35; p.legR = -0.25; p.drop = 0.06 + 0.04 * s;
    p.tool = { rx: -0.9 + 0.3 * s };
  },
  polish(p, t, f) {
    const s = Math.sin(TAU * 1.1 * t + f.seed * 4);
    p.lean = 0.35 + 0.08 * s; p.armLp = p.armRp = 1.15 + 0.35 * s; p.armLr = -0.25; p.armRr = 0.25;
    p.legL = 0.25; p.legR = -0.2;
  },
  pole(p, t, f) { // poling a scow: plant the pole behind, walk the boat forward along it
    const s = Math.sin(TAU * 0.28 * t + f.seed * 3);
    p.lean = 0.28 + 0.2 * s; p.armLp = 1.5 + 0.45 * s; p.armRp = 1.0 + 0.45 * s; p.armLr = -0.2; p.armRr = 0.3;
    p.legL = 0.3; p.legR = -0.3;
    p.tool = { x: 0.1, y: 1.35, z: 0.3, rx: 0.38 + 0.25 * s, root: true };
  },
  hoe(p, t, f) {
    const u = (t * 0.7 + f.seed) % 1;
    const a = smooth(0, 0.55, u) - smooth(0.55, 0.72, u);
    p.lean = 0.3 + 0.15 * (1 - a); p.armLp = 0.55 + 1.1 * a; p.armRp = 0.5 + 1.1 * a; p.armLr = -0.15; p.armRr = 0.15;
    p.legL = 0.3; p.legR = -0.2; p.headPitch = 0.3;
  },
  chat(p, t, f) {
    ACTIONS.idle(p, t, f);
    const talk = smooth(0.2, 0.5, Math.sin(t * 0.4 + f.seed * 9));
    p.armRp = 0.2 + talk * (0.6 + 0.25 * Math.sin(t * 5 + f.seed));
    p.armRr = 0.15 + talk * 0.25;
    p.headYaw = f.look ?? p.headYaw;
    p.headPitch = talk * 0.08 * Math.sin(t * 7);
  },
  // splitting firewood at a chopping block: the same overhead swing, one man, a slower rhythm
  chop(p, t, f) {
    const u = (t / 1.8) % 1;
    const up = smooth(0.1, 0.55, u), down = smooth(0.55, 0.64, u);
    p.armLp = p.armRp = 0.7 + 2.3 * up - 2.3 * down; p.armLr = -0.24; p.armRr = 0.24;
    p.lean = 0.1 - 0.2 * up + 0.35 * down; p.legL = 0.3; p.legR = -0.2; p.headPitch = 0.35;
    p.tool = { rx: 0.8 * (up - down) - 0.2 * down };
  },
  // hanging out the washing: reach up to the line, peg, reach down to the basket
  reach(p, t, f) {
    const u = (t * 0.35 + f.seed) % 1;
    const high = smooth(0.1, 0.3, u) - smooth(0.7, 0.9, u);
    p.armLp = p.armRp = 0.6 + 2.2 * high; p.armLr = -0.15; p.armRr = 0.15;
    p.lean = 0.35 * (1 - high) - 0.05 * high; p.headPitch = -0.35 * high + 0.3 * (1 - high);
    p.tool = high > 0.5 ? null : { rx: 0.2 };
  },
  // leaning into a load: rolling a column, shoving a block on rollers
  push(p, t, f) {
    ACTIONS.walk(p, t, { ...f, speed: f.moving === false ? 0 : 0.6 });
    p.lean = 0.5; p.armLp = p.armRp = 1.45; p.armLr = -0.12; p.armRr = 0.12;
    p.legL = p.legL * 0.8 + 0.25; p.legR = p.legR * 0.8 - 0.25;
  },
  // steadying a load as it swings on the fall
  guide(p, t, f) {
    ACTIONS.idle(p, t, f);
    p.armLp = 1.3 + 0.1 * Math.sin(t * 1.3); p.armRp = 1.2 + 0.1 * Math.sin(t * 1.1 + 1); p.armLr = -0.1; p.armRr = 0.1;
    p.lean = 0.15; p.headPitch = -0.15;
  },
  wave(p, t) {
    p.armRp = 2.9; p.armRr = 0.3 + 0.35 * Math.sin(t * 7);
    p.bob = Math.sin(t * 1.6) * 0.01;
  },
  sit(p, t, f) {
    p.drop = 0.47; p.legL = p.legR = 1.5; p.lean = -0.05;
    p.armLp = p.armRp = 0.45; p.headYaw = Math.sin(t * 0.3 + f.seed * 5) * 0.4;
  },
  drive(p, t, f) {
    ACTIONS.sit(p, t, f);
    p.armLp = p.armRp = 0.75 + 0.04 * Math.sin(t * 3); p.lean = 0.12;
    p.tool = { x: 0, y: 1.02, z: 0.3, root: true };
  },
  row(p, t, f) {
    const s = Math.sin(TAU * 0.5 * t + f.seed);
    p.drop = 0.47; p.legL = p.legR = 1.2; p.lean = -0.1 - 0.35 * s;
    p.armLp = p.armRp = 1.1 + 0.4 * s; p.armLr = 0.5; p.armRr = 0.5;
  },
  haul(p, t, f) { // hauling on a line, hand over hand
    const s = Math.sin(TAU * 0.8 * t + f.seed);
    p.lean = -0.2; p.armLp = 1.9 + 0.5 * s; p.armRp = 1.9 - 0.5 * s; p.legL = 0.3; p.legR = -0.2;
  },
  fish(p, t, f) {
    ACTIONS.idle(p, t, f);
    p.armLp = p.armRp = 0.85; p.armLr = -0.15; p.armRr = 0.15;
    p.tool = { x: 0, y: 1.08, z: 0.34, rx: 1.0 + 0.04 * Math.sin(t * 2.3), root: true };
    p.headPitch = 0.3;
  },
  lead(p, t, f) { // walking at a horse's head
    ACTIONS.walk(p, t, f);
    p.armLp = 0.65; p.armLr = 0.1;
  },
};

// ------------------------------------------------------------------ the crowd

const tmpPose = blankPose({});
const M = {
  root: new THREE.Matrix4(), torso: new THREE.Matrix4(), head: new THREE.Matrix4(), arm: new THREE.Matrix4(), part: new THREE.Matrix4(),
  local: new THREE.Matrix4(), armL: new THREE.Matrix4(), zero: new THREE.Matrix4().makeScale(0, 0, 0),
};
const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
const local = (x, y, z, rx = 0, ry = 0, rz = 0, order = 'ZYX') => M.local.makeRotationFromEuler(E.set(rx, ry, rz, order)).setPosition(x, y, z);

export class Crowd {
  constructor(max, toon) {
    this.max = max;
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = 'people';
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float keep;')
        .replace('#include <color_vertex>', `
          vColor = vColor * 0.0 + 1.0; // vec3 or vec4 depending on the three.js build
          vColor.xyz *= color.xyz;
          #ifdef USE_INSTANCING_COLOR
            vColor.xyz *= mix(instanceColor.xyz, vec3(1.0), keep);
          #endif`);
    };
    mat.customProgramCacheKey = () => 'crowd-keep';
    this.material = mat;
    const make = (name, geo) => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.name = `people:${name}`;
      m.frustumCulled = false;
      for (let i = 0; i < max; i++) { m.setMatrixAt(i, M.zero); m.setColorAt(i, C.set('#ffffff')); }
      this.group.add(m);
      return m;
    };
    this.parts = {
      legL: make('legL', BODY.leg()), legR: make('legR', BODY.leg()), torso: make('torso', BODY.torso()),
      armL: make('armL', BODY.arm()), armR: make('armR', BODY.arm()), head: make('head', BODY.head()),
      beard: make('beard', BODY.beard()), skirt: make('skirt', BODY.skirt()),
    };
    this.hats = Object.fromEntries(Object.entries(HATS).map(([k, g]) => [k, make(`hat:${k}`, g())]));
    this.tools = Object.fromEntries(Object.entries(TOOLS).map(([k, g]) => [k, make(`tool:${k}`, g())]));
    this.onStrike = null; // (worldPosition) => void, for chips of stone
  }

  /**
   * Add a figure. f: { x, z, heading, action, kind: 'man'|'woman'|'boy'|'girl', hat, beard, tool,
   * toolHand: 'R'|'L', colors: { coat, legs, skin, hair, hat }, speed, move(f, dt, t), y(f) }
   */
  add(f) {
    if (this.list.length >= this.max) return null;
    f.i = this.list.length;
    f.seed ??= Math.random();
    f.phase ??= f.seed * 10;
    f.speed ??= 1.3;
    f.scale ??= f.kind === 'boy' || f.kind === 'girl' ? 0.66 : 1;
    f.toolHand ??= 'R';
    f.colors ??= {};
    this.list.push(f);
    const set = (m, c) => m.setColorAt(f.i, C.set(c ?? '#ffffff'));
    const col = f.colors;
    set(this.parts.legL, col.legs); set(this.parts.legR, col.legs);
    set(this.parts.torso, col.coat); set(this.parts.armL, col.coat); set(this.parts.armR, col.coat);
    set(this.parts.head, col.skin); set(this.parts.beard, col.hair); set(this.parts.skirt, col.dress ?? col.coat);
    if (f.hat) set(this.hats[f.hat], col.hat);
    for (const m of [...Object.values(this.parts), ...Object.values(this.hats), ...Object.values(this.tools)]) m.instanceColor.needsUpdate = true;
    return f;
  }

  update(dt, t, { camera, groundY, range = 2200 }) {
    const cam = camera.position;
    const P = this.parts;
    let shown = 0;
    for (const f of this.list) {
      if (f.move) f.move(f, dt, t);
      const far = f.hidden || Math.hypot(f.x - cam.x, f.z - cam.z) > range || cam.y - (f.lastY ?? 0) > range;
      if (far) {
        if (!f.culled) this.hide(f);
        f.culled = true;
        continue;
      }
      f.culled = false;
      shown++;
      const pose = blankPose(tmpPose);
      (ACTIONS[f.action] ?? ACTIONS.idle)(pose, t + f.phase, f);
      const s = f.scale * CARTOON;
      const y = f.y ? f.y(f) : groundY(f.x, f.z);
      f.lastY = y;
      M.root.compose(V.set(f.x, y + (pose.bob - pose.drop) * s, f.z), Q.setFromAxisAngle(Y, f.heading + (f.yaw ?? 0)), S.set(s, s, s));
      const woman = f.kind === 'woman' || f.kind === 'girl';
      // legs (hidden under a skirt)
      if (woman) { P.legL.setMatrixAt(f.i, M.zero); P.legR.setMatrixAt(f.i, M.zero); }
      else {
        P.legL.setMatrixAt(f.i, M.part.multiplyMatrices(M.root, local(0.11, HIP, 0, -pose.legL)));
        P.legR.setMatrixAt(f.i, M.part.multiplyMatrices(M.root, local(-0.11, HIP, 0, -pose.legR)));
      }
      P.skirt.setMatrixAt(f.i, woman ? M.part.multiplyMatrices(M.root, local(0, HIP, 0, -Math.max(pose.legL, pose.legR) * 0.25)) : M.zero);
      M.torso.multiplyMatrices(M.root, local(0, HIP, 0, pose.lean, pose.twist, 0, 'YXZ'));
      P.torso.setMatrixAt(f.i, M.torso);
      M.head.multiplyMatrices(M.torso, local(0, 0.66, 0, pose.headPitch, pose.headYaw, 0, 'YXZ'));
      P.head.setMatrixAt(f.i, M.head);
      P.beard.setMatrixAt(f.i, f.beard ? M.head : M.zero);
      if (f.hat) this.hats[f.hat].setMatrixAt(f.i, M.head);
      const armL = M.armL.multiplyMatrices(M.torso, local(0.27, 0.55, 0, -pose.armLp, 0, pose.armLr));
      P.armL.setMatrixAt(f.i, armL);
      M.arm.multiplyMatrices(M.torso, local(-0.27, 0.55, 0, -pose.armRp, 0, -pose.armRr));
      P.armR.setMatrixAt(f.i, M.arm);
      if (f.tool) {
        const tp = pose.tool;
        let tm;
        if (tp?.root) tm = M.part.multiplyMatrices(M.root, local(tp.x ?? 0, tp.y ?? 0, tp.z ?? 0, tp.rx ?? 0, tp.ry ?? 0, tp.rz ?? 0));
        else tm = M.part.multiplyMatrices(f.toolHand === 'L' ? armL : M.arm, local(0, -0.6, 0, tp?.rx ?? 0, tp?.ry ?? 0, tp?.rz ?? 0));
        this.tools[f.tool].setMatrixAt(f.i, tm);
        if (f.tool2) this.tools[f.tool2].setMatrixAt(f.i, M.part.multiplyMatrices(armL, local(0, -0.6, 0)));
      }
      if (pose.strike && !f.struck && this.onStrike) {
        // where the blow lands: in front of the figure, about knee height
        this.onStrike(new THREE.Vector3(0, 0.5, 0.7).applyMatrix4(M.root), f);
      }
      f.struck = !!pose.strike;
    }
    // draw only the slots in use, and nothing at all when everyone is out of range
    this.group.visible = shown > 0;
    for (const m of this.group.children) { m.count = this.list.length; m.instanceMatrix.needsUpdate = true; }
  }

  /** change what a figure holds (clears the old tool first) */
  setTool(f, tool) {
    if (f.tool === tool) return;
    if (f.tool) this.tools[f.tool].setMatrixAt(f.i, M.zero);
    f.tool = tool;
  }

  hide(f) {
    for (const m of Object.values(this.parts)) m.setMatrixAt(f.i, M.zero);
    if (f.hat) this.hats[f.hat].setMatrixAt(f.i, M.zero);
    if (f.tool) this.tools[f.tool].setMatrixAt(f.i, M.zero);
    if (f.tool2) this.tools[f.tool2].setMatrixAt(f.i, M.zero);
  }
}
// people are drawn a little larger than life so they read from a distance, like the trees
export const CARTOON = 1.35;

// ------------------------------------------------------------------ horses

export class Herd {
  constructor(max, toon, material) {
    this.max = max;
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = 'horses';
    const make = (name, geo) => {
      const m = new THREE.InstancedMesh(geo, material, max);
      m.name = `horses:${name}`;
      m.frustumCulled = false;
      for (let i = 0; i < max; i++) { m.setMatrixAt(i, M.zero); m.setColorAt(i, C.set('#ffffff')); }
      this.group.add(m);
      return m;
    };
    this.parts = { body: make('body', HORSE.body()), head: make('head', HORSE.head()), tail: make('tail', HORSE.tail()), harness: make('harness', HORSE.harness()),
      legFL: make('legFL', HORSE.leg()), legFR: make('legFR', HORSE.leg()), legHL: make('legHL', HORSE.leg()), legHR: make('legHR', HORSE.leg()) };
  }
  /** h: { x, z, heading, color, walking (bool or fn), speed, harness, move(h, dt, t), y(h) } */
  add(h) {
    h.i = this.list.length;
    h.seed ??= Math.random();
    h.speed ??= 1.4;
    this.list.push(h);
    for (const m of Object.values(this.parts)) { m.setColorAt(h.i, C.set(h.color ?? '#6b4226')); m.instanceColor.needsUpdate = true; }
    return h;
  }
  update(dt, t, { camera, groundY, range = 2200 }) {
    const cam = camera.position, P = this.parts;
    for (const h of this.list) {
      if (h.move) h.move(h, dt, t);
      if (h.hidden || Math.hypot(h.x - cam.x, h.z - cam.z) > range) { for (const m of Object.values(P)) m.setMatrixAt(h.i, M.zero); continue; }
      const walking = typeof h.walking === 'function' ? h.walking(h) : h.walking;
      const tt = t + h.seed * 10;
      const w = TAU * (h.speed / 2.2) * tt, s = walking ? Math.sin(w) : 0, c = walking ? Math.cos(w) : 0;
      const y = h.y ? h.y(h) : groundY(h.x, h.z);
      const sc = CARTOON * 0.92;
      M.root.compose(V.set(h.x, y + Math.abs(c) * 0.04 * sc, h.z), Q.setFromAxisAngle(Y, h.heading), S.set(sc, sc, sc));
      P.body.setMatrixAt(h.i, M.root);
      P.harness.setMatrixAt(h.i, h.harness ? M.root : M.zero);
      const graze = walking ? 0 : smooth(0.3, 0.9, Math.sin(tt * 0.25)) * 0.9;
      P.head.setMatrixAt(h.i, M.part.multiplyMatrices(M.root, local(0, 1.45, 0.9, 0.12 * s * 0.4 + graze + 0.03 * Math.sin(tt * 1.3), 0, 0)));
      P.tail.setMatrixAt(h.i, M.part.multiplyMatrices(M.root, local(0, 1.5, -0.95, -0.35, 0, 0.15 * Math.sin(tt * 1.7))));
      const a = 0.38;
      P.legFL.setMatrixAt(h.i, M.part.multiplyMatrices(M.root, local(0.19, 0.97, 0.72, -a * s)));
      P.legHR.setMatrixAt(h.i, M.part.multiplyMatrices(M.root, local(-0.19, 0.97, -0.72, -a * s)));
      P.legFR.setMatrixAt(h.i, M.part.multiplyMatrices(M.root, local(-0.19, 0.97, 0.72, a * s)));
      P.legHL.setMatrixAt(h.i, M.part.multiplyMatrices(M.root, local(0.19, 0.97, -0.72, a * s)));
    }
    for (const m of this.group.children) m.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ chips of stone

export class Chips {
  constructor(max, material) {
    this.mesh = new THREE.InstancedMesh(paint(new THREE.BoxGeometry(0.07, 0.07, 0.07), '#ffffff', false), material, max);
    this.mesh.name = 'chips';
    this.mesh.frustumCulled = false;
    this.p = [];
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, M.zero); this.mesh.setColorAt(i, C.set(i % 3 ? '#c0604a' : '#d9cfc4')); this.p.push({ life: 0, v: new THREE.Vector3(), x: new THREE.Vector3() }); }
    this.next = 0;
  }
  burst(at, n = 6, scale = 1) {
    for (let k = 0; k < n; k++) {
      const c = this.p[this.next];
      this.next = (this.next + 1) % this.p.length;
      c.life = 0.5 + Math.random() * 0.4;
      c.x.copy(at);
      c.v.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3).multiplyScalar(scale);
    }
  }
  update(dt) {
    this.p.forEach((c, i) => {
      if (c.life <= 0) return;
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.x.addScaledVector(c.v, dt);
      this.mesh.setMatrixAt(i, c.life > 0 ? M.part.makeScale(1.6, 1.6, 1.6).setPosition(c.x) : M.zero);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
