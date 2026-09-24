// Names on the map and the camera stops.
//
// Every note cites where it came from. Places marked `approx` were placed by eye from
// Gwen Martin's maps (2013) or a written description, not surveyed.
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MARTIN = 'Martin, G. (2013). The Granite Industry of Southwestern New Brunswick. NB Energy & Mines, Popular Geology Paper 2013-1';
const OHALLORAN = "O'Halloran, M. E. (1968). History of the Granite Industry in St. George, N.B. Charlotte County Historical Society";
const GREARSON = 'Grearson, A. G. (1965). History of St. George. Charlotte County Historical Society';

// tier 1 is always shown; 2 and 3 appear as you come closer.
export const PLACES = [
  { name: 'St. George', kind: 'town', tier: 1, at: [45.1276, -66.8270] },
  { name: 'Lake Utopia', kind: 'water', tier: 1, at: [45.180, -66.792] },
  { name: 'Passamaquoddy Bay', kind: 'water', tier: 1, at: [45.098, -66.928] },
  { name: 'Letang Harbour', kind: 'water', tier: 1, at: [45.083, -66.806] },
  { name: 'Magaguadavic River', kind: 'water', tier: 1, at: [45.1745, -66.8447] },

  { name: 'Bonny River', kind: 'village', tier: 2, at: [45.2019, -66.8576] },
  { name: 'Canal', kind: 'village', tier: 2, at: [45.1560, -66.8280] },
  { name: 'The Canal', kind: 'water', tier: 2, at: [45.1628, -66.8170] },
  { name: 'Caithness', kind: 'village', tier: 2, at: [45.1172, -66.8492] },
  { name: 'Breadalbane', kind: 'village', tier: 2, at: [45.1300, -66.8673] },
  { name: 'Mascarene', kind: 'village', tier: 2, at: [45.1003, -66.9041] },
  { name: 'Letang', kind: 'village', tier: 2, at: [45.0810, -66.8348] },
  { name: 'Back Bay', kind: 'village', tier: 2, at: [45.0562, -66.8695] },
  { name: 'Letete', kind: 'village', tier: 2, at: [45.0587, -66.8915] },
  { name: 'Upper Letang', kind: 'village', tier: 2, at: [45.1310, -66.7876] },
  { name: 'Magaguadavic River (tidal)', kind: 'water', tier: 2, at: [45.1195, -66.8820] },

  { name: 'Bethel', kind: 'village', tier: 3, at: [45.1588, -66.9157] },
  { name: "Fry's Island", kind: 'island', tier: 3, at: [45.0562, -66.8442] },
  { name: 'Lily Lake', kind: 'water', tier: 3, at: [45.1780, -66.9055] },
  { name: 'Mill Lake', kind: 'water', tier: 3, at: [45.2080, -66.7700] },
  { name: 'Digdeguash Lake', kind: 'water', tier: 3, at: [45.2060, -66.9230] },

  // historic sites: gold pins with a note
  {
    name: 'Magaguadavic Falls', kind: 'site', tier: 2, anchor: 'falls',
    note: 'Head of tide. In 1873 the Bay of Fundy Red Granite Co. built a $75,000 finishing mill on the east side of the falls, run by water power. Its polishing machine turned its first columns on 22 January 1874, polished with white sand from Lake Utopia.',
    source: `${MARTIN}, p. 13 and Map 4 (No. 1)`,
  },
  {
    name: 'St. George Basin', kind: 'site', tier: 2, anchor: 'basin',
    note: 'The tidal basin below the gorge, where schooners loaded. In August 1873 the schooner Ben Bolt sailed from here with the Bay of Fundy company’s first shipment of granite for New York.',
    source: `${MARTIN}, p. 12`,
  },
  {
    name: 'Bay of Fundy Co. quarry', kind: 'site', tier: 2, anchor: 'quarryBoF', approx: true,
    note: 'The Bay of Fundy Red Granite Co.’s first quarry, just north of the natural canal between Lake Utopia and the Magaguadavic. In summer, scows carried rough blocks west through the canal and down the river to the falls.',
    source: `${MARTIN}, pp. 12–13 and Map 3 (No. 10); ${OHALLORAN}`,
  },
  {
    name: 'Front (Burpee) quarries', kind: 'site', tier: 3, at: [45.1640, -66.8490], approx: true,
    note: 'Saint George Red Granite Co. quarries on the west side of the Magaguadavic. Their first schooner-load of granite went to Peter Cormack’s shop in Saint John in July 1872. A quarry railway ran south to the company’s first shed.',
    source: `${MARTIN}, p. 10 and Map 3 (Nos. 33–34)`,
  },
  {
    name: 'First Saint George Red Granite Co. shed', kind: 'site', tier: 3, at: [45.1592, -66.8428], approx: true,
    note: 'A steam-powered finishing shed half a mile south of the quarries, on twenty acres of intervale by the river. It opened in February 1874 and burned in June 1874.',
    source: `${MARTIN}, p. 10 and Maps 2–3 (yellow X)`,
  },
  {
    name: 'The Red Store wharf', kind: 'site', tier: 2, anchor: 'redStore', approx: true,
    note: 'The Saint George Red Granite Co. built a saltwater wharf at The Red Store, Breadalbane, in 1873. Finished stone was hauled down the Lower Road to the wharf and shipped by boat to Saint John. In winter, oxen hauled the larger stones.',
    source: `${MARTIN}, p. 10 and Map 2 (red X); ${OHALLORAN}`,
  },
  {
    name: 'Site of the first St. George', kind: 'site', tier: 3, at: [45.0610, -66.8530], approx: true,
    note: 'Loyalists laid out a town here on the Letang Peninsula, opposite Fry’s Island, in 1786: 128 town lots. A forest fire destroyed it in 1790. The people who stayed moved to the falls and brought the name St. George with them.',
    source: GREARSON,
  },
  {
    name: 'Letete Passage', kind: 'site', tier: 2, anchor: 'letetePassage', approx: true,
    note: 'The way out of Passamaquoddy Bay to the Bay of Fundy. From here, schooners carried St. George granite to Saint John, Boston and New York.',
    source: MARTIN,
  },
];

// Camera stops. `from` is the compass bearing from the target to the camera (180 = from the south).
export const PRESETS = [
  { key: '1', name: 'The whole stage', at: [45.118, -66.848], dist: 23000, from: 180, tilt: 52 },
  { key: '2', name: 'St. George & the Falls', anchor: 'falls', dist: 1500, from: 150, tilt: 38 },
  { key: '3', name: 'Lake Utopia & the Canal', at: [45.170, -66.812], dist: 6000, from: 215, tilt: 40 },
  { key: '4', name: 'The quarry ledges', anchor: 'quarryBoF', dist: 1900, from: 185, tilt: 34 },
  { key: '5', name: 'Down the Magaguadavic', at: [45.146, -66.838], dist: 4200, from: 110, tilt: 42 },
  { key: '6', name: 'The Red Store & the estuary', anchor: 'redStore', dist: 3000, from: 165, tilt: 38 },
  { key: '7', name: 'Passamaquoddy Bay', at: [45.100, -66.900], dist: 7500, from: 120, tilt: 40 },
  { key: '8', name: 'Letang Harbour & Back Bay', at: [45.068, -66.840], dist: 7000, from: 190, tilt: 42 },
  { key: '9', name: 'Letete Passage', anchor: 'letetePassage', dist: 4500, from: 20, tilt: 34 },
];

export const SOURCES = [MARTIN, OHALLORAN, GREARSON];

// Where a place or preset sits, in local metres.
export function locate(data, p) {
  if (p.anchor) { const [x, z] = data.meta.anchors[p.anchor]; return { x, z }; }
  return data.toLocal(p.at[0], p.at[1]);
}

export function buildLabels(data, scene, onPick) {
  const labels = PLACES.map((p) => {
    const div = document.createElement('div');
    div.className = `label label-${p.kind}`;
    div.textContent = p.name + (p.approx ? '*' : '');
    if (p.note) {
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.addEventListener('click', () => onPick(p));
      div.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPick(p); });
    }
    const obj = new CSS2DObject(div);
    const { x, z } = locate(data, p);
    obj.userData = { place: p, x, z };
    scene.add(obj);
    return obj;
  });
  const reach = { 1: Infinity, 2: 11000, 3: 5500 };
  return {
    labels,
    place(exag) {
      for (const o of labels) {
        const { x, z, place } = o.userData;
        const w = data.inlandWaterAt(x, z);
        const base = Number.isNaN(w) ? Math.max(data.heightAt(x, z), data.meta.highWater) : w;
        o.position.set(x, base * exag + (place.kind === 'site' ? 40 : 25), z);
      }
    },
    update(camera, show) {
      for (const o of labels) {
        const d = camera.position.distanceTo(o.position);
        o.visible = show && d < reach[o.userData.place.tier];
      }
    },
  };
}
