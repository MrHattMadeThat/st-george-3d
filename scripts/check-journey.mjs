// Geometry regression checks against the shipped terrain, without a WebGL context.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { loadData } from '../src/data.js';
import { buildJourney } from '../src/journey.js';
import { quarryLanding } from '../src/landings.js';

THREE.TextureLoader.prototype.loadAsync = async () => new THREE.Texture();
globalThis.fetch = async (url) => {
  const b = await fs.readFile(new URL('../public/' + url, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), json: async () => JSON.parse(b) };
};
const data = await loadData();
const prop = () => { const o = new THREE.Group(); o.userData.setSails = () => {}; return o; };
const world = { exag: 3, tide: 0, toon: null, props: Object.fromEntries(['block', 'column', 'scow', 'wagon', 'schooner'].map((k) => [k, () => { const o = prop(); o.name = k; return o; }])) };
const camera = new THREE.PerspectiveCamera(), controls = { target: new THREE.Vector3() };
const scene = new THREE.Scene();
const journey = buildJourney({ scene, camera, controls, data, world, setTide: () => {} });
const landing = quarryLanding(data);
assert.ok(data.heightAt(...landing.bank) > landing.level + 0.6, 'canal crew must stand on dry ground');
assert.ok(data.heightAt(...landing.berth) < landing.level - 0.5, 'canal scow needs water beneath its hull');
for (let d = 4; d <= 16; d += 0.5) {
  for (const side of [-1, 1]) {
    const x = landing.bank[0] + landing.ux * d + landing.uz * side;
    const z = landing.bank[1] + landing.uz * d - landing.ux * side;
    assert.ok(data.heightAt(x, z) > landing.level, 'loaders must remain above water throughout their walk');
  }
}
const { MB, berth2 } = journey.places;
assert.ok(MB[1] < Math.min(...data.meta.structures.upperBridge.map((p) => p[1])) - 25, 'mill landing must be upstream of the bridge');
assert.ok(data.heightAt(...MB) > data.inlandWaterAt(...berth2) + 0.6, 'mill crew needs dry ground');
assert.ok(data.heightAt(...berth2) < data.inlandWaterAt(...berth2) - 1, 'mill berth must be navigable');
journey.go(4);
const scow = scene.getObjectByName('scow');
for (let t = 0.99; t <= 1.00001; t += 0.0005) {
  journey.seek(t); journey.frame(0); scow.updateMatrixWorld();
  for (const x of [-3, 3]) for (const z of [-8, 8]) {
    const corner = new THREE.Vector3(x, 0, z).applyMatrix4(scow.matrixWorld);
    assert.ok(data.heightAt(corner.x, corner.z) < scow.position.y / world.exag, `scow corners must stay afloat: bank=${MB}, berth=${berth2}, t=${t}, x=${corner.x}, z=${corner.z}, ground=${data.heightAt(corner.x, corner.z)}, water=${scow.position.y / world.exag}`);
  }
}
const channel = data.meta.route.scow.filter(([x, z]) => x > -365 && x < -115 && z > -3560 && z < -3400);
for (let k = 1; k < channel.length; k++) for (let t = 0; t <= 1; t += 0.05) {
  const x = THREE.MathUtils.lerp(channel[k - 1][0], channel[k][0], t);
  const z = THREE.MathUtils.lerp(channel[k - 1][1], channel[k][1], t);
  assert.ok(data.heightAt(x, z) < data.inlandWaterAt(x, z) - 1, 'peninsula must not close the canal');
}
for (const exag of [1, 2.5, 4]) {
  world.exag = exag;
  for (let step = 0; step < journey.steps.length; step++) {
    journey.go(step);
    for (const t of [0, 0.25, 0.5, 0.75, 0.99]) {
      journey.seek(t); journey.frame(1 / 60);
      assert.ok([...camera.position, ...controls.target].every(Number.isFinite), `finite camera at step ${step}`);
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const target = controls.target.clone().sub(camera.position).normalize();
      assert.ok(forward.dot(target) > 0.99999, 'camera must face this frame’s target before projecting dialogue');
    }
  }
}
console.log('Journey checks passed: dry crews, navigable berths/canal, upstream arrival, and all 13 camera steps at three terrain scales.');
