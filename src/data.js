// Loads the stage data written by scripts/build-terrain.mjs and wraps it in lookups.
import * as THREE from 'three';

export async function loadData(base = 'data/') {
  const bin = (name) => fetch(base + name).then((r) => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.arrayBuffer();
  });
  const [meta, heightBuf, waterBuf, treeBuf, paint, masks] = await Promise.all([
    fetch(base + 'meta.json').then((r) => r.json()),
    bin('height.bin'), bin('water.bin'), bin('trees.bin'),
    new THREE.TextureLoader().loadAsync(base + 'paint.png'),
    new THREE.TextureLoader().loadAsync(base + 'masks.png'),
  ]);
  const height = new Float32Array(heightBuf);
  // water.bin: inland water level, SEA for tidal water, NaN for dry land
  const water = new Float32Array(waterBuf);
  const SEA = -9999;
  const { w: MW, h: MH, cell } = meta.mesh;
  const { xmin, zmin } = meta.extent;

  const trees = (() => {
    const n = new DataView(treeBuf).getUint32(0, true);
    const pos = new Float32Array(treeBuf, 4, n * 3);
    const info = new Uint8Array(treeBuf, 4 + n * 12, n * 2);
    return { n, pos, info };
  })();

  const toLocal = (lat, lon) => ({ x: (lon - meta.origin.lon) * meta.mPerDegLon, z: -(lat - meta.origin.lat) * meta.mPerDegLat });
  const toLatLon = (x, z) => ({ lat: meta.origin.lat - z / meta.mPerDegLat, lon: meta.origin.lon + x / meta.mPerDegLon });

  // Ground height in metres (no vertical exaggeration), bilinear on the mesh grid.
  function heightAt(x, z) {
    const u = Math.min(Math.max((x - xmin) / cell, 0), MW - 1.001);
    const v = Math.min(Math.max((z - zmin) / cell, 0), MH - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * MW + i;
    const top = height[k] + (height[k + 1] - height[k]) * a;
    const bot = height[k + MW] + (height[k + MW + 1] - height[k + MW]) * a;
    return top + (bot - top) * b;
  }
  // Inland water surface (lakes, rivers above tide) in metres, or NaN.
  function inlandWaterAt(x, z) {
    const i = Math.round((x - xmin) / cell), j = Math.round((z - zmin) / cell);
    if (i < 0 || j < 0 || i >= MW || j >= MH) return NaN;
    const w = water[j * MW + i];
    return w === SEA ? NaN : w;
  }
  const isSea = (x, z) => {
    const i = Math.round((x - xmin) / cell), j = Math.round((z - zmin) / cell);
    return i >= 0 && j >= 0 && i < MW && j < MH && water[j * MW + i] === SEA;
  };

  return { meta, height, water, SEA, trees, paint, masks, toLocal, toLatLon, heightAt, inlandWaterAt, isSea };
}
