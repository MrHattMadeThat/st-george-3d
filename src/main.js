import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadData } from './data.js';
import { buildWorld } from './world.js';
import { PRESETS, WORK_STOPS, SOURCES, buildLabels, locate } from './places.js';
import { buildJourney } from './journey.js';
import { buildLife } from './life.js';
import { tramwayLayout, buildTramway } from './tramway.js';
import { makeCritters } from './critters.js';
import { buildScenes } from './scenes.js';

const params = new URLSearchParams(location.search);
const quality = params.get('q') || 'medium';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ welcome screen

const welcome = $('welcome');
// Start in the landscape. The field guide provides progressive discovery; Controls opens the full guide.

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

scene.add(new THREE.HemisphereLight('#dff1ff', '#7b7967', 1.45));
const sun = new THREE.DirectionalLight('#fff0d6', 1.8);
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

let data;
try {
  data = await loadData();
} catch (error) {
  $('loading').replaceChildren();
  const message = document.createElement('p'); message.textContent = 'The landscape could not load. Please check your connection and try again.';
  const retry = document.createElement('button'); retry.textContent = 'Try again'; retry.onclick = () => location.reload();
  $('loading').append(message, retry); $('w-status').textContent = message.textContent;
  console.error(error); throw error;
}
// the quarry tramway is laid out first, so the trees along its line are never planted
const tramLayout = tramwayLayout(data);
data.clearings = tramLayout.clearings;
Object.assign(data.meta.structures, { tramQuarry: tramLayout.quarry, tramPlatform: tramLayout.platform, tramShed: tramLayout.shed });
const world = buildWorld(data, { scene, quality, exag: +$('opt-exag').value });
const labels = buildLabels(data, scene, showPlace);
const life = buildLife({ scene, data, world, camera });
const critters = makeCritters(scene, world.toon);
const tramway = buildTramway({ data, world, scene, life, layout: tramLayout });
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
  if (to.name) { $('view-name').textContent = to.name; $('view-description').textContent = to.blurb || 'St. George and the Granite Coast'; }
  else { $('view-name').textContent = 'A closer look'; $('view-description').textContent = 'Explore the landscape at your own pace.'; }
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
});
// While the story plays, a drag orbits and the wheel zooms about what the story is following;
// panning away is left to a paused story.
function storyControls(on) {
  controls.enablePan = !on;
  controls.zoomToCursor = !on;
  controls.mouseButtons.LEFT = on ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  controls.touches.ONE = on ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
}

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
showTab($('tab-places'));

function stopButton(p, box) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.key = p.key;
  b.innerHTML = `<kbd>${p.key.toUpperCase()}</kbd><span class="stop-name">${p.name}</span><span class="stop-blurb">${p.blurb || ''}</span>`;
  b.addEventListener('click', () => { journey.stop(); flyTo(p); if (innerWidth <= 700) setCollapsed(true); });
  box.appendChild(b);
}
for (const p of WORK_STOPS) stopButton(p, $('work-stops'));
for (const p of PRESETS) stopButton(p, $('presets'));
$('place-search').addEventListener('input', e => {
  const query = e.target.value.trim().toLocaleLowerCase(); let matches = 0;
  document.querySelectorAll('.stops button').forEach(b => { b.hidden = !b.textContent.toLocaleLowerCase().includes(query); if (!b.hidden) matches++; });
  const tramCard = document.querySelector('.tram-card'); tramCard.hidden = !tramCard.textContent.toLocaleLowerCase().includes(query);
  if (!tramCard.hidden) matches++;
  $('search-empty').hidden = matches > 0;
});
$('btn-home').addEventListener('click', () => { journey.stop(); $('place-card').hidden = true; flyTo('1'); });
$('btn-tramway').addEventListener('click', () => { journey.stop(); tramway.restart(); flyTo('t'); if (innerWidth <= 700) setCollapsed(true); });
$('quality').value = params.get('q') || 'auto';
$('quality').addEventListener('change', e => {
  const url = new URL(location.href); if (e.target.value === 'auto') url.searchParams.delete('q'); else url.searchParams.set('q', e.target.value);
  url.searchParams.set('nowelcome', ''); location.href = url.href;
});

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
  tramway.refresh();
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
$('btn-exit-clean').addEventListener('click', toggleClean);
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

const journey = buildJourney({ scene, camera, controls, data, world, life, critters, setTide });
const scenes = buildScenes({ scene, data, world, life, critters, journey });
const stepList = $('j-steps');
const chapters = [{name:'Quarry', start:0}, {name:'River', start:3}, {name:'Mill', start:5}, {name:'Wharf', start:9}, {name:'Sea', start:11}];
chapters.forEach(c => { const b = document.createElement('button'); b.textContent = c.name; b.type = 'button'; b.addEventListener('click', () => { flight = null; journey.go(c.start); journey.play(); }); $('chapters').append(b); });
$('cap-detail').addEventListener('click', () => { const on = $('caption').classList.toggle('expanded'); $('cap-detail').setAttribute('aria-expanded',on); $('cap-detail').textContent = on ? 'Read less' : 'Read more'; });
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
let storyOpen = false; // on a talking leg, the viewer asked to see the story card anyway
let journeyShown = false;
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
  if (step >= 0 && !journeyShown && innerWidth <= 700) setCollapsed(true);
  if (step < 0 && journeyShown) { $('view-name').textContent = 'A closer look'; $('view-description').textContent = 'Explore the landscape at your own pace.'; }
  journeyShown = step >= 0;
  const chapter = chapters.findLastIndex(c => c.start <= step);
  [...$('chapters').children].forEach((b,i) => b.setAttribute('aria-current', i === chapter ? 'step' : 'false'));
  if (step >= 0) { $('view-name').textContent = 'The Stone’s Journey'; $('view-description').textContent = 'Summer 1874 · ' + (chapters[chapter]?.name || ''); }
  const s = journey.steps[step];
  $('caption').hidden = !s || !showCaptions;
  document.body.classList.toggle('story', !!s && showCaptions); // the story card takes the menu's place
  // on the long legs, where people talk, the card steps aside for a bar along the bottom
  const cinema = !!s?.cinema && showCaptions && !storyOpen;
  const was = document.body.classList.contains('cinema');
  document.body.classList.toggle('cinema', cinema);
  $('minibar').hidden = !(s?.cinema && showCaptions);
  $('mb-story').setAttribute('aria-pressed', String(storyOpen));
  $('mb-story').textContent = storyOpen ? 'Hide the story' : 'Read the story';
  if (was !== cinema) frame();
  if (s) {
    $('mb-step').textContent = `${step + 1} / ${journey.steps.length}`;
    $('mb-title').textContent = s.title;
    $('mb-play').textContent = playing ? '❚❚' : '▶';
    const more = s.stops?.some((u) => u > t + 0.002);
    $('mb-skip').innerHTML = more ? 'Next stop <span aria-hidden="true">›</span>' : step < journey.steps.length - 1 ? 'Next step <span aria-hidden="true">›</span>' : 'The end';
    $('mb-skip').disabled = !more && step >= journey.steps.length - 1;
  }
  storyControls(journey.state.playing);
  if (s) {
    $('cap-count').textContent = `Step ${step + 1} of ${journey.steps.length}`;
    $('cap-title').textContent = s.title;
    $('cap-text').textContent = s.text;
    $('cap-source').textContent = `Source: ${s.source}`;
  }
}
// Speech: a bubble above whoever is talking, its tail pointing at them. If they can't be seen
// (behind the camera, or not in the scene), the line shows in a box over the story instead.
let talkLine = null;
const bubble = $('bubble'), P3 = new THREE.Vector3();
function talkUI() {
  const { step, t } = journey.state;
  const lines = showCaptions ? journey.steps[step]?.talk : null;
  const line = lines ? lines.findLast(([a, , , b]) => t >= a && t < (b ?? 1.01)) ?? null : null;
  if (line !== talkLine) {
    talkLine = line;
    if (line) {
      for (const el of [bubble, $('talk')]) { el.querySelector('.talk-who').textContent = line[1]; el.querySelector('.talk-says').textContent = line[2]; }
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    }
  }
  const at = line ? journey.speakers[line[1]]?.() : null;
  let shown = false;
  if (at) {
    P3.set(at.x, at.y, at.z).project(camera);
    const y = (1 - P3.y) / 2 * innerHeight;
    if (P3.z < 1 && Math.abs(P3.x) < 0.98 && y > 76 && y < innerHeight - 70) {
      const x = (P3.x + 1) / 2 * innerWidth;
      bubble.hidden = false;
      const w = bubble.offsetWidth, h = bubble.offsetHeight;
      const left = Math.min(Math.max(x - w * 0.3, 12), innerWidth - w - 12);
      // above the speaker if there's room, else below with the tail pointing up
      const below = y - h - 16 < 70;
      const top = below ? Math.min(y + 18, innerHeight - h - 90) : Math.min(y - h - 16, innerHeight - h - 90);
      bubble.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      const tx = Math.min(Math.max(x - left, 16), w - 16), reach = below ? Math.max(8, top - y) : Math.max(8, y - (top + h));
      bubble.style.setProperty('--tail-x', `${tx.toFixed(1)}px`);
      bubble.style.setProperty('--tail-h', `${Math.min(reach, 160).toFixed(1)}px`);
      bubble.classList.toggle('far', reach > 160);
      bubble.classList.toggle('below', below);
      shown = true;
    }
  }
  // nobody to point at, and the story card is away: the line sits over the bottom bar
  const free = !shown && !!line && document.body.classList.contains('cinema');
  if (free) {
    bubble.hidden = false;
    bubble.style.transform = `translate(${((innerWidth - bubble.offsetWidth) / 2).toFixed(1)}px, ${(innerHeight - bubble.offsetHeight - 110).toFixed(1)}px)`;
  }
  bubble.classList.toggle('free', free);
  bubble.hidden = !shown && !free;
  $('talk').hidden = !line || shown || free;
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
$('cap-next').addEventListener('click', () => { flight = null; journey.skip(); });
$('mb-skip').addEventListener('click', () => { flight = null; journey.skip(); });
$('mb-prev').addEventListener('click', () => stepBy(-1));
$('mb-play').addEventListener('click', () => $('j-play').click());
$('mb-back').addEventListener('click', () => journey.stop());
$('mb-story').addEventListener('click', () => { storyOpen = !storyOpen; journeyUI(); });
$('j-speed').addEventListener('change', (e) => { journey.state.speed = +e.target.value; });
$('cap-back').addEventListener('click', () => journey.stop());
$('opt-captions').addEventListener('change', (e) => { showCaptions = e.target.checked; journeyUI(); });

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLTextAreaElement || e.target.isContentEditable || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || about.open || welcome.open) return;
  if (e.target.getAttribute?.('role') === 'tab') return;
  if (e.key === 'ArrowLeft' && journey.active) { e.preventDefault(); stepBy(-1); return; }
  if (e.key === 'ArrowRight' && journey.active) { e.preventDefault(); flight = null; journey.skip(); return; }
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
  life, tramway,
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

const fadeEl = $('fade'); // the journey's dip to paper when a long trip skips ahead

let elapsed = 0, last = performance.now(), lastMore = null;
flyTo(PRESETS.find((p) => p.key === (params.get('preset') || '2')) || PRESETS[0], 0);
if (params.has('clean')) { document.body.classList.add('clean'); frame(); }
if (innerWidth <= 700) setCollapsed(true);
if (params.has('journey')) journey.play();

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;
  stepFlight(dt);
  stepGlide(dt);
  controls.update();
  if (!journey.active && !flight) {
    const e = data.meta.extent, before = controls.target.clone();
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, e.xmin, e.xmax);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, e.zmin, e.zmax);
    camera.position.add(controls.target.clone().sub(before));
  }
  // keep the camera out of the hills
  const floor = groundY(camera.position.x, camera.position.z) + 3;
  if (!journey.active && camera.position.y < floor) camera.position.y = floor;

  if ($('opt-tide-run').checked) { tideClock += dt * ((2 * Math.PI) / 60); setTide(+(Math.sin(tideClock) * 3.5).toFixed(2)); }
  world.update(dt);
  if (!flight) journey.frame(dt);
  if (fadeEl.style.opacity !== String(journey.state.fade)) fadeEl.style.opacity = journey.state.fade;
  journey.update(dt);
  scenes.update(dt, elapsed);
  life.update(dt);
  critters.update(dt, elapsed, { camera, groundY: (x, z) => data.heightAt(x, z) * world.exag });
  tramway.update(reducedMotion ? 0 : dt);
  watchPerf(dt);
  for (const fn of frameHooks) fn(dt, elapsed);

  camera.updateMatrixWorld();
  talkUI();
  turnCompass();
  if (journey.state.playing) {
    const k = journey.state.step; if (bars[k]) bars[k].style.width = `${journey.state.t * 100}%`;
    const more = journey.steps[k]?.stops?.some((u) => u > journey.state.t + 0.002);
    if (more !== lastMore) { lastMore = more; journeyUI(); }
  }
  labels.update(camera, showLabels, innerWidth, innerHeight);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
