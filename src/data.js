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
  const [meta, heightBuf, waterBuf, treeBuf, paint, masks, townHeightBuf, townWaterBuf, townPaint, townMasks, townStreets] = await Promise.all([
    fetch(base + 'meta.json').then((r) => r.json()),
    bin('height.bin'), bin('water.bin'), bin('trees.bin'),
    tex('paint.png'), tex('masks.png'),
    bin('town-height.bin'), bin('town-water.bin'), tex('town-paint.png'), tex('town-masks.png'), tex('town-streets.png'),
  ]);

  // Two grids: the whole stage at 30 m, and the town around the falls at 10 m.
  const main = { h: new Float32Array(heightBuf), w: new Float32Array(waterBuf), nx: meta.mesh.w, nz: meta.mesh.h, cell: meta.mesh.cell, x0: meta.extent.xmin, z0: meta.extent.zmin };
  const T = meta.town;
  const town = { h: new Float32Array(townHeightBuf), w: new Float32Array(townWaterBuf), nx: T.w, nz: T.h, cell: T.cell, x0: T.x0, z0: T.z0 };
  const inTown = (x, z) => x >= T.x0 && x <= T.x1 && z >= T.z0 && z <= T.z1;
  const gridOf = (x, z) => (inTown(x, z) ? town : main);

  // The coarse DEM closes the canal beside the downstream peninsula. Trim its
  // channel-facing edge before making either the ground or water meshes, so the
  // drawn channel and height/water lookups share one continuous navigable bed.
  const channel = meta.route.scow.filter(([x, z]) => x > -365 && x < -115 && z > -3560 && z < -3400);
  for (let k = 1; k < channel.length; k++) {
    const [ax, az] = channel[k - 1], [bx, bz] = channel[k];
    const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - 55 - main.x0) / main.cell));
    const i1 = Math.min(main.nx - 1, Math.ceil((Math.max(ax, bx) + 55 - main.x0) / main.cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - 55 - main.z0) / main.cell));
    const j1 = Math.min(main.nz - 1, Math.ceil((Math.max(az, bz) + 55 - main.z0) / main.cell));
    const waterIndex = Math.round((az - main.z0) / main.cell) * main.nx + Math.round((ax - main.x0) / main.cell);
    const level = main.w[waterIndex];
    if (!Number.isFinite(level) || level === SEA) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = main.x0 + i * main.cell, z = main.z0 + j * main.cell;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t), index = j * main.nx + i;
      if (d > 55) continue;
      const bed = level - 2.5 + Math.max(0, d - 35) * 0.22;
      main.h[index] = Math.min(main.h[index], bed);
      if (d <= 45) main.w[index] = level;
    }
  }

  // The height of the drawn ground: the same two triangles per cell that world.js builds (the
  // diagonal alternates cell by cell), so anything set on it sits exactly on the surface. A plain
  // bilinear blend can miss the drawn ground by a metre on a steep 30 m cell.
  function bilinear(g, x, z) {
    const u = Math.min(Math.max((x - g.x0) / g.cell, 0), g.nx - 1.001);
    const v = Math.min(Math.max((z - g.z0) / g.cell, 0), g.nz - 1.001);
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * g.nx + i;
    const h00 = g.h[k], h10 = g.h[k + 1], h01 = g.h[k + g.nx], h11 = g.h[k + g.nx + 1];
    if ((i + j) & 1) { // diagonal from (1,0) to (0,1)
      return a + b < 1 ? h00 + (h10 - h00) * a + (h01 - h00) * b : h11 + (h01 - h11) * (1 - a) + (h10 - h11) * (1 - b);
    }
    return b > a ? h00 + (h11 - h01) * a + (h01 - h00) * b : h00 + (h10 - h00) * a + (h11 - h10) * b; // diagonal (0,0)-(1,1)
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
    meta, SEA, main, town, inTown, trees, paint, masks, townPaint, townMasks, townStreets, toLocal, toLatLon,
    height: main.h, water: main.w,
    /** ground height in metres (no vertical exaggeration) */
    heightAt: (x, z) => bilinear(gridOf(x, z), x, z),
    /** inland water surface (lakes, rivers above tide) in metres, or NaN */
    inlandWaterAt: (x, z) => { const w = waterCode(x, z); return w === SEA ? NaN : w; },
    isSea: (x, z) => waterCode(x, z) === SEA,
  };
}
