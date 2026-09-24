// Loads the stage data written by scripts/build-terrain.mjs and wraps it in lookups.
import * as THREE from 'three';

// water.bin / town-water.bin: inland water level (m), SEA for tidal water, NaN for dry land
const SEA = -9999;

export async function loadData(base = 'data/') {
  const bin = (name) => fetch(base + name).then((r) => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.arrayBuffer();
  });
  const tex = (name) => new THREE.TextureLoader().loadAsync(base + name);
  const [meta, heightBuf, waterBuf, treeBuf, paint, masks, townHeightBuf, townWaterBuf, townPaint, townMasks] = await Promise.all([
    fetch(base + 'meta.json').then((r) => r.json()),
    bin('height.bin'), bin('water.bin'), bin('trees.bin'),
    tex('paint.png'), tex('masks.png'),
    bin('town-height.bin'), bin('town-water.bin'), tex('town-paint.png'), tex('town-masks.png'),
  ]);

  // Two grids: the whole stage at 30 m, and the town around the falls at 10 m.
  const main = { h: new Float32Array(heightBuf), w: new Float32Array(waterBuf), nx: meta.mesh.w, nz: meta.mesh.h, cell: meta.mesh.cell, x0: meta.extent.xmin, z0: meta.extent.zmin };
  const T = meta.town;
  const town = { h: new Float32Array(townHeightBuf), w: new Float32Array(townWaterBuf), nx: T.w, nz: T.h, cell: T.cell, x0: T.x0, z0: T.z0 };
  const inTown = (x, z) => x >= T.x0 && x <= T.x1 && z >= T.z0 && z <= T.z1;
  const gridOf = (x, z) => (inTown(x, z) ? town : main);

  function bilinear(g, x, z) {
    const u = Math.min(Math.max((x - g.x0) / g.cell, 0), g.nx - 1.001);
    const v = Math.min(Math.max((z - g.z0) / g.cell, 0), g.nz - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * g.nx + i;
    const top = g.h[k] + (g.h[k + 1] - g.h[k]) * a;
    const bot = g.h[k + g.nx] + (g.h[k + g.nx + 1] - g.h[k + g.nx]) * a;
    return top + (bot - top) * b;
  }
  const waterCode = (x, z) => {
    const g = gridOf(x, z);
    const i = Math.round((x - g.x0) / g.cell), j = Math.round((z - g.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return NaN;
    return g.w[j * g.nx + i];
  };

  const trees = (() => {
    const n = new DataView(treeBuf).getUint32(0, true);
    const pos = new Float32Array(treeBuf, 4, n * 3);
    const info = new Uint8Array(treeBuf, 4 + n * 12, n * 2);
    return { n, pos, info };
  })();

  const toLocal = (lat, lon) => ({ x: (lon - meta.origin.lon) * meta.mPerDegLon, z: -(lat - meta.origin.lat) * meta.mPerDegLat });
  const toLatLon = (x, z) => ({ lat: meta.origin.lat - z / meta.mPerDegLat, lon: meta.origin.lon + x / meta.mPerDegLon });

  return {
    meta, SEA, main, town, inTown, trees, paint, masks, townPaint, townMasks, toLocal, toLatLon,
    height: main.h, water: main.w,
    /** ground height in metres (no vertical exaggeration) */
    heightAt: (x, z) => bilinear(gridOf(x, z), x, z),
    /** inland water surface (lakes, rivers above tide) in metres, or NaN */
    inlandWaterAt: (x, z) => { const w = waterCode(x, z); return w === SEA ? NaN : w; },
    isSea: (x, z) => waterCode(x, z) === SEA,
  };
}
