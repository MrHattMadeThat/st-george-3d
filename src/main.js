import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadData } from './data.js';
import { buildWorld } from './world.js';
import { PRESETS, WORK_STOPS, SOURCES, buildLabels, locate } from './places.js';
import { buildJourney } from './journey.js';
import { buildLife } from './life.js';

const params = new URLSearchParams(location.search);
const quality = params.get('q') || 'medium';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer, camera, lights

const host = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
host.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#d9ecf2', 30000, 90000);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 5, 200000);

scene.add(new THREE.HemisphereLight('#dff1ff', '#6f7d4a', 1.35));
const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
sun.position.set(-0.7, 1.1, -0.45).multiplyScalar(10000); // afternoon light from the north-west, map-style
scene.add(sun);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.42;
controls.minDistance = 6; // close enough to watch the people at work
controls.maxDistance = 48000;
controls.zoomToCursor = true;

// Centre the picture in the space beside the panel (not behind it) unless in clean view.
function frame() {
  camera.aspect = innerWidth / innerHeight;
  const panel = $('panel');
  const beside = !document.body.classList.contains('clean') && innerWidth > 700 ? panel.offsetWidth + 16 : 0;
  if (beside) camera.setViewOffset(innerWidth, innerHeight, -beside / 2, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', frame);
frame();

// ------------------------------------------------------------------ load and build

const data = await loadData();
const world = buildWorld(data, { scene, quality, exag: +$('opt-exag').value });
const labels = buildLabels(data, scene, showPlace);
const life = buildLife({ scene, data, world, camera });
labels.place(world.exag);
$('loading').hidden = true;

const groundY = (x, z) => {
  const w = data.inlandWaterAt(x, z);
  const h = Math.max(data.heightAt(x, z), Number.isNaN(w) ? world.tide : w);
  return h * world.exag;
};

// ------------------------------------------------------------------ camera moves

let flight = null;
function viewFor(p) {
  const { x, z } = p.target ? p.target(data) : locate(data, p);
  const target = new THREE.Vector3(x, groundY(x, z), z);
  const bearing = THREE.MathUtils.degToRad(typeof p.from === 'function' ? p.from(data) : p.from), tilt = THREE.MathUtils.degToRad(p.tilt);
  const flat = Math.cos(tilt) * p.dist;
  const pos = target.clone().add(new THREE.Vector3(Math.sin(bearing) * flat, Math.sin(tilt) * p.dist, -Math.cos(bearing) * flat));
  return { target, pos };
}
function flyTo(p, seconds = 2.4) {
  const to = typeof p === 'string' ? [...PRESETS, ...WORK_STOPS].find((q) => q.name === p || q.key === p) : p;
  if (!to) return;
  const end = to.pos && to.target ? to : viewFor(to);
  document.querySelectorAll('.presets button').forEach((b) => b.classList.toggle('active', b.dataset.key === to.key && to.key != null));
  if (reducedMotion || seconds <= 0) {
    camera.position.copy(end.pos); controls.target.copy(end.target); flight = null; return;
  }
  flight = { t: 0, seconds, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), ...end };
  // rise a little in the middle of long hops so the camera doesn't skim the hills
  flight.arc = Math.min(flight.fromPos.distanceTo(end.pos) * 0.25, 6000);
}
function stepFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / flight.seconds);
  const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
  camera.position.lerpVectors(flight.fromPos, flight.pos, e);
  camera.position.y += Math.sin(Math.PI * e) * flight.arc;
  controls.target.lerpVectors(flight.fromTarget, flight.target, e);
  if (flight.t >= 1) flight = null;
}
controls.addEventListener('start', () => {
  flight = null;
  document.querySelectorAll('.presets button').forEach((b) => b.classList.remove('active'));
  if (journey?.state.playing) journey.pause(); // grabbing the camera pauses the story
});

// ------------------------------------------------------------------ panel

const presetBox = $('presets');
for (const p of WORK_STOPS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.key = p.key;
  b.innerHTML = `<kbd>${p.key.toUpperCase()}</kbd><span>${p.name}</span>`;
  b.addEventListener('click', () => { journey.stop(); flyTo(p); });
  $('work-stops').appendChild(b);
}
for (const p of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.key = p.key;
  b.innerHTML = `<kbd>${p.key}</kbd><span>${p.name}</span>`;
  b.addEventListener('click', () => { journey.stop(); flyTo(p); });
  presetBox.appendChild(b);
}

let showLabels = true;
$('opt-labels').addEventListener('change', (e) => { showLabels = e.target.checked; });
$('opt-clouds').addEventListener('change', (e) => { world.clouds.visible = e.target.checked; });
$('opt-route').addEventListener('change', (e) => { world.route.visible = e.target.checked; $('route-key').hidden = !e.target.checked; });

const tideInput = $('opt-tide');
const tideText = (v) => (v > 2.5 ? 'high water' : v < -2.5 ? 'low water' : v >= 0 ? 'rising / half' : 'falling / half');
function setTide(v) { world.setTide(v); tideInput.value = v; $('tide-val').textContent = `${v >= 0 ? '+' : ''}${(+v).toFixed(1)} m · ${tideText(v)}`; }
tideInput.addEventListener('input', (e) => { $('opt-tide-run').checked = false; setTide(+e.target.value); });
setTide(+tideInput.value);
let tideClock = Math.asin(1.5 / 3.5);

const treeInput = $('opt-trees');
function setTrees(f) { world.trees.setFraction(f); world.trees.group.visible = f > 0; $('trees-val').textContent = `${Math.round(f * world.trees.count).toLocaleString()}`; }
treeInput.addEventListener('input', (e) => setTrees(+e.target.value));
if (quality === 'low') treeInput.value = 0.35;
if (quality === 'high') treeInput.value = 1;
setTrees(+treeInput.value);

const exagInput = $('opt-exag');
function setExag(e) {
  const k = e / world.exag;
  world.setExag(e);
  labels.place(e);
  journey.refresh();
  life.refresh();
  controls.target.y *= k;
  camera.position.y = Math.max(camera.position.y, controls.target.y + 50);
  $('exag-val').textContent = `${e}× real`;
}
exagInput.addEventListener('input', (e) => setExag(+e.target.value));
$('exag-val').textContent = `${world.exag}× real`;

function showPlace(p) {
  $('place-card').hidden = false;
  $('place-name').textContent = p.name;
  $('place-note').textContent = p.note;
  $('place-source').textContent = `Source: ${p.source}`;
  $('place-approx').hidden = !p.approx;
  if (document.body.classList.contains('clean')) return;
  const { x, z } = locate(data, p);
  const off = camera.position.clone().sub(controls.target);
  const dist = Math.min(off.length(), 2600);
  const target = new THREE.Vector3(x, groundY(x, z), z);
  flyTo({ key: null, target, pos: target.clone().add(off.setLength(dist)) }, 1.6);
}

const toggleClean = () => { document.body.classList.toggle('clean'); frame(); };
$('btn-clean').addEventListener('click', toggleClean);
const about = $('about');
$('btn-about').addEventListener('click', () => about.showModal());
$('sources').innerHTML = SOURCES.map((s) => `<li>${s}</li>`).join('') +
  '<li>Map data © OpenStreetMap contributors, available under the Open Database Licence.</li>' +
  '<li>Elevation: AWS Terrain Tiles (Mapzen / Amazon), from Natural Resources Canada and other public sources.</li>';

// ------------------------------------------------------------------ the Stone's Journey

const journey = buildJourney({ scene, camera, controls, data, world, life, setTide });
const stepList = $('j-steps');
journey.steps.forEach((s, k) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = s.title;
  b.addEventListener('click', () => { flight = null; journey.go(k); journey.play(); });
  li.appendChild(b);
  stepList.appendChild(li);
});
let showCaptions = true;
function journeyUI() {
  const { step, playing, t } = journey.state;
  const finished = step === journey.steps.length - 1 && t >= 1;
  $('j-play').textContent = playing ? '❚❚ Pause' : step >= 0 && !finished ? '▶ Resume' : '▶ Play';
  [...stepList.children].forEach((li, k) => { li.classList.toggle('current', k === step); li.classList.toggle('done', step >= 0 && k < step); });
  const s = journey.steps[step];
  $('caption').hidden = !s || !showCaptions;
  if (s) {
    $('cap-step').textContent = `${step + 1} of ${journey.steps.length} · ${s.title}`;
    $('cap-text').textContent = s.text;
    $('cap-source').textContent = `Source: ${s.source}`;
  }
}
journey.state.onChange = journeyUI;
$('j-play').addEventListener('click', () => { flight = null; if (journey.state.playing) journey.pause(); else journey.play(); });
$('j-stop').addEventListener('click', () => journey.stop());
$('j-speed').addEventListener('change', (e) => { journey.state.speed = +e.target.value; });
$('opt-captions').addEventListener('change', (e) => { showCaptions = e.target.checked; journeyUI(); });

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || about.open) return;
  if (e.key === 'h' || e.key === 'H') toggleClean();
  if (e.key === ' ') { e.preventDefault(); $('j-play').click(); }
  if (e.key === 'Escape') journey.stop();
  const p = [...PRESETS, ...WORK_STOPS].find((q) => q.key === e.key.toLowerCase());
  if (p) { journey.stop(); flyTo(p); }
});

// ------------------------------------------------------------------ the stage API for animations

const frameHooks = new Set();
window.stage = {
  THREE, scene, camera, renderer, controls, world, data, presets: PRESETS,
  /** local metres for a latitude/longitude */ toLocal: data.toLocal,
  /** ground height in metres (no exaggeration) */ heightAt: data.heightAt,
  /** world-space y of the ground or water surface at x,z, with the current exaggeration */ groundY,
  flyTo, setTide, setExag, setTrees,
  /** the Stone's Journey: play(), pause(), go(step), stop(), steps, state */
  get journey() { return journey; },
  /** the people, horses, derrick, dory and gulls: crowd.list, herd.list, person(role, f), horse(h) */
  life,
  route: data.meta.route, anchors: data.meta.anchors,
  /** run fn(dt, elapsed) every frame; returns an unsubscribe function */
  onFrame(fn) { frameHooks.add(fn); return () => frameHooks.delete(fn); },
};

// ------------------------------------------------------------------ lighter mode

// If this computer can't keep up, drop to one pixel per screen pixel and fewer trees, once.
const perf = { frames: 0, time: 0, done: !!params.get('q') };
function watchPerf(dt) {
  if (perf.done || flight || document.hidden) return;
  if (++perf.frames <= 30) return; // skip start-up: shaders are still compiling
  perf.time += dt;
  if (perf.frames < 120) return;
  const fps = (perf.frames - 30) / perf.time;
  perf.done = true;
  if (fps >= 32) return;
  renderer.setPixelRatio(1);
  treeInput.value = Math.min(+treeInput.value, 0.35);
  setTrees(+treeInput.value);
  $('perf-note').hidden = false;
}

// ------------------------------------------------------------------ loop

const compass = document.querySelector('#compass svg');
const fwd = new THREE.Vector3();
let elapsed = 0, last = performance.now();
flyTo(PRESETS.find((p) => p.key === (params.get('preset') || '1')) || PRESETS[0], 0);
if (params.has('clean')) { document.body.classList.add('clean'); frame(); }
if (params.has('journey')) journey.play();

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;
  stepFlight(dt);
  controls.update();
  // keep the camera out of the hills
  const floor = groundY(camera.position.x, camera.position.z) + 3;
  if (camera.position.y < floor) camera.position.y = floor;

  if ($('opt-tide-run').checked) { tideClock += dt * ((2 * Math.PI) / 60); setTide(+(Math.sin(tideClock) * 3.5).toFixed(2)); }
  world.update(dt);
  if (!flight) journey.frame(dt);
  life.update(dt);
  watchPerf(dt);
  for (const fn of frameHooks) fn(dt, elapsed);

  camera.getWorldDirection(fwd);
  compass.style.transform = `rotate(${-Math.atan2(fwd.x, -fwd.z)}rad)`;
  labels.update(camera, showLabels);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
