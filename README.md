# St. George, 1874–76: a landscape stage

A cartoon 3D model of the land around St. George, New Brunswick, in the Granite Town
years. It's built as a **stage for short animations** about the granite trade: quarry → canal →
river → finishing sheds → wharf → schooner → out through Letete Passage.

Session 1 is the landscape only: St. George, Lake Utopia, Bonny River, the Magaguadavic
and its tidal estuary, Passamaquoddy Bay, and the Letang Peninsula down to Letete.
Piskahegan is deliberately left off the board.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Opens on `http://localhost:5631`. `npm run build` makes a `dist/` folder that works from any
static file server, a USB stick or GitHub Pages (paths are relative, nothing is fetched from
the internet at run time).

| Address option | What it does |
| --- | --- |
| `?preset=2` | start at a camera stop (1–9) |
| `?clean` | start in clean view (no panel, for recording) |
| `?q=low` / `?q=high` | force the light or full picture (otherwise it lightens itself on slow computers) |

Keys: **1–9** fly to the camera stops, **H** toggles clean view.
Mouse: left-drag pans, right-drag turns and tilts, the wheel zooms toward the cursor.

## Using it as a stage

Everything is on `window.stage`, so an animation script (or the browser console) can drive it:

```js
const { THREE, scene, toLocal, groundY, onFrame, flyTo, route, anchors } = stage;

// put something at the Bay of Fundy quarry
const [x, z] = anchors.quarryBoF;
const block = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 12), new THREE.MeshToonMaterial({ color: '#b3503c' }));
block.position.set(x, groundY(x, z) + 6, z);
scene.add(block);

// move it along the scow route, one step per frame
let t = 0;
onFrame((dt) => { t = (t + dt * 0.02) % 1; /* sample route.scow at t ... */ });

flyTo('4'); // or flyTo('The quarry ledges')
```

| Name | What it is |
| --- | --- |
| `toLocal(lat, lon)` | latitude/longitude → `{x, z}` in metres. `(0, 0)` is St. George; north is `-z`. |
| `heightAt(x, z)` | ground height in real metres |
| `groundY(x, z)` | world `y` of the ground or water surface, with the current hill-height setting |
| `route.scow`, `route.schooner` | `[x, z]` points: quarry → canal → falls, and Basin → Letete Passage |
| `anchors` | `falls`, `basin`, `redStore`, `quarryBoF`, `letetePassage` as `[x, z]` |
| `flyTo(stop)` | a stop's key or name, or `{ target, pos }` vectors |
| `setTide(m)` | −3.5 (low water) to +3.5 (high water) |
| `setExag(k)`, `setTrees(f)` | hill height multiplier, share of trees shown (0–1) |
| `onFrame(fn)` | `fn(dt, elapsed)` every frame; returns an unsubscribe function |

Hills are drawn taller than life (2× by default). Anything placed on the ground should use
`groundY`, not `heightAt`, so it sits on the surface at any setting.

## How the landscape is made

`npm run build:data` runs [scripts/build-terrain.mjs](scripts/build-terrain.mjs), which turns the
raw data in `data/raw/` into the files in `public/data/`:

- **Shorelines, lakes, rivers, marshes**: OpenStreetMap (`data/raw/osm.json`, fetched once from
  the Overpass API). OSM closes the coast across the Magaguadavic's mouth; the build puts the
  tidal estuary back so the sea runs up to the falls, as it does.
- **Hills**: AWS Terrain Tiles, zoom 12, about 27 m per pixel (`data/raw/terrarium/`).
- **Tides**: the coastline is treated as high water; the sea surface moves ±3.5 m (Passamaquoddy
  tides run about 7 m), so mud flats appear as the tide drops.
- **Lakes** sit at their own level (Lake Utopia 13 m, Mill Lake 20 m); **rivers** always run
  downhill and meet lakes and the sea at the right height.
- **1870s land cover**: farms and clearings only around the settlements of the time; forest
  everywhere else. Farm lots, granite ledges and marsh reeds are drawn by the ground shader
  from `masks.png` so they stay sharp up close.
- **Utopia Granite**: the red belt and its ledges follow Gwen Martin's Maps 2 and 3; ledges are
  thickest along its southern edge between the Magaguadavic and Lake Utopia, where the quarries were.
- **The Gulley** (flooded by the 1902 pulp mill dam) is drained back to 1874 dry ground.

`data/preview.png` is a top-down check image written by every build. `PROBE="lat,lon;..."`
prints what the build decided at a point; `ASCII="lat,lon,cells"` prints the land/sea mask
around it.

## Known limits

- No buildings, roads, wharves, dams or railways yet. The falls are one simple cascade; Map 4
  shows upper falls, a dam, lower falls and The Gorge. A detailed town-and-falls model is the
  natural next step.
- Shorelines and lake levels are modern. Places marked **\*** were placed by eye from maps or
  written descriptions: the quarries, the first shed, the Red Store wharf, the first St. George,
  Letete Passage.
- The terrain grid is 30 m, fine for the whole-area stage but too coarse for close-ups of a
  single quarry or shed. Those scenes will want their own detailed insets.

## Sources

- Martin, G. (2013). *The Granite Industry of Southwestern New Brunswick: A Historical
  Perspective.* NB Department of Energy and Mines, Popular Geology Paper 2013-1. Maps 2–4.
- O'Halloran, M. E. (1968). *History of the Granite Industry in St. George, N.B.* Charlotte County
  Historical Society (in `../St George History/03_granite_industry.md`).
- Grearson, A. G. (1965). *History of St. George.* Charlotte County Historical Society
  (in `../St George History/01_early_history.md`).
- Map data © OpenStreetMap contributors, ODbL. The credit is shown on screen and must stay
  visible in anything published or recorded from this.
- Elevation: AWS Terrain Tiles (Mapzen), drawn from Natural Resources Canada and other public sources.
