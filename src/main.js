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

// ------------------------------------------------------------------ welcome screen

const welcome = $('welcome');
if (!['clean', 'journey', 'preset', 'nowelcome'].some((k) => params.has(k))) welcome.showModal();

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
  const cls = document.body.classList;
  const beside = !cls.contains('clean') && !cls.contains('collapsed') && innerWidth > 700 ? panel.offsetWidth + 16 : 0;
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
$('w-status').textContent = '';
$('w-journey').disabled = $('w-explore').disabled = false;
if (welcome.open) $('w-journey').focus();

const groundY = (x, z) => {
  const w = data.inlandWaterAt(x, z);
  const h = Math.max(data.heightAt(x, z), Number.isNaN(w) ? world.tide : w);
  return h * world.exag;
};

// ------------------------------------------------------------------ camera moves

let flight = null;
let glide = null; // a short turn, tilt or zoom from the camera buttons
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
  glide = null;
  const end = to.pos && to.target ? to : viewFor(to);
  document.querySelectorAll('.stops button').forEach((b) => b.classList.toggle('active', b.dataset.key === to.key && to.key != null));
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
  glide = null;
  flight = null;
  document.querySelectorAll('.stops button').forEach((b) => b.classList.remove('active'));
  if (journey?.state.playing) journey.pause(); // grabbing the camera pauses the story
});

// ------------------------------------------------------------------ panel

const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
function showTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
}
tabs.forEach((t, k) => {
  t.addEventListener('click', () => showTab(t));
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const n = tabs[(k + d + tabs.length) % tabs.length];
    showTab(n); n.focus();
  });
});
showTab(tabs[0]);

function stopButton(p, box) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.key = p.key;
  b.innerHTML = `<kbd>${p.key.toUpperCase()}</kbd><span class="stop-name">${p.name}</span><span class="stop-blurb">${p.blurb || ''}</span>`;
  b.addEventListener('click', () => { journey.stop(); flyTo(p); });
  box.appendChild(b);
}
for (const p of WORK_STOPS) stopButton(p, $('work-stops'));
for (const p of PRESETS) stopButton(p, $('presets'));

function setCollapsed(on) {
  document.body.classList.toggle('collapsed', on);
  $('btn-expand').hidden = !on;
  frame();
  (on ? $('btn-expand') : $('btn-collapse')).focus();
}
$('btn-collapse').addEventListener('click', () => setCollapsed(true));
$('btn-expand').addEventListener('click', () => setCollapsed(false));

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
  $('place-card').classList.remove('pop'); void $('place-card').offsetWidth; $('place-card').classList.add('pop');
  $('place-name').textContent = p.name;
  $('place-note').textContent = p.note;
  $('place-source').textContent = `Source: ${p.source}`;
  $('place-card').querySelector('.card-kind').textContent = p.anchor === 'basin' || p.anchor === 'letetePassage' ? 'Place on the water' : 'Historic site';
  $('place-approx').hidden = !p.approx;
  if (document.body.classList.contains('clean')) return;
  const { x, z } = locate(data, p);
  const off = camera.position.clone().sub(controls.target);
  const dist = Math.min(off.length(), 2600);
  const target = new THREE.Vector3(x, groundY(x, z), z);
  flyTo({ key: null, target, pos: target.clone().add(off.setLength(dist)) }, 1.6);
}

$('place-close').addEventListener('click', () => { $('place-card').hidden = true; });

const toggleClean = () => { document.body.classList.toggle('clean'); frame(); };
$('btn-clean').addEventListener('click', toggleClean);
const about = $('about');
$('btn-about').addEventListener('click', () => about.showModal());
$('btn-help').addEventListener('click', () => welcome.showModal());
$('w-explore').addEventListener('click', () => welcome.close());
$('w-journey').addEventListener('click', () => { welcome.close(); showTab($('tab-journey')); flight = null; journey.go(0); journey.play(); });
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
  b.innerHTML = `<span class="num">${k + 1}</span><span class="step-title">${s.title}</span>`;
  b.addEventListener('click', () => { flight = null; journey.go(k); journey.play(); });
  li.appendChild(b);
  stepList.appendChild(li);
});
const progress = $('cap-progress');
const bars = journey.steps.map((s, k) => {
  const seg = document.createElement('button');
  seg.type = 'button';
  seg.tabIndex = -1;
  seg.title = `${k + 1}. ${s.title}`;
  seg.style.flexGrow = s.seconds;
  seg.innerHTML = '<i></i>';
  seg.addEventListener('click', () => { flight = null; const was = journey.state.playing; journey.go(k); if (was) journey.play(); });
  progress.appendChild(seg);
  return seg.firstChild;
});
let showCaptions = true;
function journeyUI() {
  const { step, playing, t } = journey.state;
  const finished = step === journey.steps.length - 1 && t >= 1;
  $('j-play').textContent = playing ? '❚❚ Pause' : step >= 0 && !finished ? '▶ Resume' : '▶ Play';
  $('j-play').classList.toggle('primary', !playing);
  $('cap-play').textContent = playing ? '❚❚' : '▶';
  $('cap-play').title = playing ? 'Pause and look around (Space)' : 'Play (Space)';
  $('cap-prev').disabled = step <= 0;
  $('cap-next').disabled = step >= journey.steps.length - 1;
  $('cap-paused').hidden = playing || finished;
  [...stepList.children].forEach((li, k) => { li.classList.toggle('current', k === step); li.classList.toggle('done', step >= 0 && k < step); });
  bars.forEach((b, k) => { b.style.width = k < step ? '100%' : k > step ? '0%' : `${t * 100}%`; });
  document.body.classList.toggle('journey-on', step >= 0);
  const s = journey.steps[step];
  $('caption').hidden = !s || !showCaptions;
  if (s) {
    $('cap-count').textContent = `Step ${step + 1} of ${journey.steps.length}`;
    $('cap-title').textContent = s.title;
    $('cap-text').textContent = s.text;
    $('cap-source').textContent = `Source: ${s.source}`;
  }
}
function stepBy(d) {
  const { step, playing } = journey.state;
  if (step < 0) return;
  const k = Math.max(0, Math.min(journey.steps.length - 1, step + d));
  if (k === step) return;
  flight = null;
  journey.go(k);
  if (playing) journey.play();
}
journey.state.onChange = journeyUI;
$('j-play').addEventListener('click', () => { flight = null; glide = null; if (journey.state.playing) journey.pause(); else journey.play(); });
$('j-stop').addEventListener('click', () => journey.stop());
$('cap-play').addEventListener('click', () => $('j-play').click());
$('cap-prev').addEventListener('click', () => stepBy(-1));
$('cap-next').addEventListener('click', () => stepBy(1));
$('j-speed').addEventListener('change', (e) => { journey.state.speed = +e.target.value; });
$('opt-captions').addEventListener('change', (e) => { showCaptions = e.target.checked; journeyUI(); });

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || about.open || welcome.open) return;
  if (e.target.getAttribute?.('role') === 'tab') return;
  if (e.key === 'ArrowLeft' && journey.active) { e.preventDefault(); stepBy(-1); return; }
  if (e.key === 'ArrowRight' && journey.active) { e.preventDefault(); stepBy(1); return; }
  if (e.key === 'h' || e.key === 'H') toggleClean();
  if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); $('j-play').click(); }
  if (e.key === 'Escape') { if (!$('place-card').hidden) $('place-card').hidden = true; else journey.stop(); }
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

// ------------------------------------------------------------------ camera buttons

const offset = new THREE.Vector3(), sph = new THREE.Spherical();
// Turn, tilt or zoom around the point the camera looks at, in a short glide.
function nudge({ turn = 0, tilt = 0, zoom = 1, north = false }) {
  if (journey.state.playing) journey.pause(); // like grabbing the camera
  flight = null;
  sph.setFromVector3(offset.copy(camera.position).sub(controls.target));
  const from = { theta: sph.theta, phi: sph.phi, radius: sph.radius };
  const to = glide ? { ...glide.to } : { ...from };
  if (north) to.theta = 0; else to.theta += turn;
  // the short way round
  while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI;
  while (to.theta - from.theta < -Math.PI) to.theta += 2 * Math.PI;
  to.phi = THREE.MathUtils.clamp(to.phi + tilt, 0.08, controls.maxPolarAngle);
  to.radius = THREE.MathUtils.clamp(to.radius * zoom, controls.minDistance, controls.maxDistance);
  glide = reducedMotion ? { t: 1, from: to, to } : { t: 0, from, to };
}
function stepGlide(dt) {
  if (!glide) return;
  glide.t = Math.min(1, glide.t + dt / 0.5);
  const e = 1 - (1 - glide.t) ** 3;
  const { from, to } = glide;
  sph.set(from.radius * (to.radius / from.radius) ** e, from.phi + (to.phi - from.phi) * e, from.theta + (to.theta - from.theta) * e);
  camera.position.copy(controls.target).add(offset.setFromSpherical(sph));
  if (glide.t >= 1) glide = null;
}
$('compass').addEventListener('click', () => nudge({ north: true }));
$('ctl-in').addEventListener('click', () => nudge({ zoom: 0.55 }));
$('ctl-out').addEventListener('click', () => nudge({ zoom: 1 / 0.55 }));
$('ctl-left').addEventListener('click', () => nudge({ turn: -Math.PI / 6 }));
$('ctl-right').addEventListener('click', () => nudge({ turn: Math.PI / 6 }));
$('ctl-up').addEventListener('click', () => nudge({ tilt: -0.22 }));
$('ctl-down').addEventListener('click', () => nudge({ tilt: 0.22 }));

// The compass rose turns with the view; its letters stay upright.
const rose = $('rose');
const roseLetters = [...rose.querySelectorAll('text')].map((t) => ({ t, at: t.dataset.at }));
let heading = null;
function turnCompass() {
  offset.copy(camera.position).sub(controls.target);
  if (Math.hypot(offset.x, offset.z) < offset.y * 0.002 && heading !== null) return; // straight down: keep the last heading
  const deg = (Math.atan2(offset.x, offset.z) * 180) / Math.PI;
  if (heading !== null && Math.abs(deg - heading) < 0.1) return;
  heading = deg;
  rose.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
  for (const { t, at } of roseLetters) t.setAttribute('transform', `translate(${at}) rotate(${(-deg).toFixed(2)})`);
}

// ------------------------------------------------------------------ loop

let elapsed = 0, last = performance.now();
flyTo(PRESETS.find((p) => p.key === (params.get('preset') || '1')) || PRESETS[0], 0);
if (params.has('clean')) { document.body.classList.add('clean'); frame(); }
if (params.has('journey')) journey.play();

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;
  stepFlight(dt);
  stepGlide(dt);
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

  turnCompass();
  if (journey.state.playing) { const k = journey.state.step; if (bars[k]) bars[k].style.width = `${journey.state.t * 100}%`; }
  labels.update(camera, showLabels, innerWidth, innerHeight);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
