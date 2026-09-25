// Shared shore geometry for scenery, loaders and the journey.
export function quarryLanding(data) {
  const q = data.meta.structures.quarry, [x, z] = q.landing;
  const length = Math.hypot(q.x - x, q.z - z), ux = (q.x - x) / length, uz = (q.z - z) / length;
  const level = data.inlandWaterAt(x, z);
  const water = Number.isFinite(level) ? level : 11.7;
  let d = 0;
  while (d < 120 && data.heightAt(x + ux * d, z + uz * d) < water + 0.7) d += 0.5;
  const shore = [x + ux * d, z + uz * d];
  return { shore, bank: [shore[0] + ux * 4, shore[1] + uz * 4],
    berth: [shore[0] - ux * 9, shore[1] - uz * 9], ux, uz, level: water };
}
