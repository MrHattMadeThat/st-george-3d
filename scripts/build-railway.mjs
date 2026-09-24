import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync(new URL('../data/raw/osm-town.json', import.meta.url)));
const ids = [641397286, 826349847, 669517283];
const ways = ids.map(id => raw.elements.find(e => e.id === id));
if (ways.some(w => !w?.geometry)) throw new Error('Missing railway source geometry');
const points = ways.flatMap(w => w.geometry.map(p => [p.lat, p.lon]));
fs.writeFileSync(new URL('../public/data/railway.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap former Shore Line Railway corridor; connecting gap interpolated. Martin (2013), pp. 17–18, establishes the railway era and general station area.',
  note: 'Only the corridor present in the saved map extract is shown. Station, siding and train are illustrative; this is an 1880-onward layer, not a complete reconstruction of 1880.',
  ways: ids, points
}, null, 2) + '\n');
console.log('Built railway corridor:', points.length, 'survey points');
