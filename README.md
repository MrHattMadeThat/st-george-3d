# St. George, 1874–76: a landscape stage

A cartoon 3D model of the land around St. George, New Brunswick, in the Granite Town
years. It's built as a **stage for short animations** about the granite trade: quarry → canal →
river → finishing sheds → wharf → schooner → out through Letete Passage.

The board covers St. George, Lake Utopia, Bonny River, the Magaguadavic and its tidal estuary,
Passamaquoddy Bay, and the Letang Peninsula down to Letete. Piskahegan is deliberately left off.

- **Session 1:** the landscape: hills, shores, tides, lakes, rivers, 1870s farms and forest.
- **Session 2:** the town in detail (a 10 m inset around the falls with the Gorge, the old core
  streets, houses, stores, churches), the Bay of Fundy Red Granite Co. mill with its dam and
  flume, the bridges, wharves, the Red Store, the quarry face, villages and farmsteads, and the
  first animation: **The Stone's Journey**.

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
| `?journey` | start playing The Stone's Journey (with `?clean` for a recording) |
| `?q=low` / `?q=high` | force the light or full picture (otherwise it lightens itself on slow computers) |

Keys: **1–9** fly to the camera stops, **H** toggles clean view, **Space** plays or pauses the
journey, **Esc** stops it and hands the camera back.

## People at work

About 450 people and 30 horses, all posed in code ([src/people.js](src/people.js)) and placed by
[src/life.js](src/life.js):

- **The quarry**: three double-jack drilling crews (one man kneels and turns the drill, two strike
  it in turn, and chips fly), two men working a block loose with bars, a foreman, a water boy, and
  a horse derrick whose horse walks the capstan round only while a block is being raised or lowered.
- **The canal landing**: men carrying stone down to the scows.
- **The mill yard**: stonecutters with mallet and chisel at their bankers, a polisher, men carrying stone.
- **The town**: people walking the old streets alone and in pairs, stopping to talk, groups outside
  the stores and churches, children playing in the yards, people on their doorsteps, men splitting
  wood, women hanging out washing, chimney smoke, and horse-drawn wagons.
- **The water**: stevedores carrying sacks on the main wharf, a boy fishing off the end, a dory
  rowing about the Basin, sailors on the schooner, gulls.
- **Out of town**: farmers hoeing, horses grazing, people about the villages, a team waiting at the Red Store.
- **The journey**: the scow's polers pole only while it moves; the wagon has a walking team and a driver.

Each body part is one instanced mesh for the whole crowd, so everyone costs a few dozen draw calls;
figures farther than 2 km from the camera are skipped. **Q W E R** fly to close-up stops for
watching the work. From the console, `stage.life.person(role, { x, z, heading, action, tool })`
adds a figure; roles are `quarryman`, `stonecutter`, `townsman`, `gentleman`, `woman`, `boy`,
`girl`, `farmer`, `sailor`, and actions are listed in `ACTIONS` in `src/people.js`.

## The Stone's Journey

Thirteen captioned steps follow one block of red granite in the summer of 1874, the way the Bay
of Fundy Red Granite Co. worked. Nothing floats into place; every hand-off is done by someone:

1. The **horse derrick** lifts the block from the foot of the face (its horse walks the capstan
   while the rope winds) and swings it onto a **sled**.
2. A **horse team** drags the sled to the canal landing, the teamster walking alongside.
3. Men hauling on **shear legs** swing the block onto a **scow**.
4. and 5. **Polers** walk the scow through the canal and down the Magaguadavic to the mill landing.
6. A second pair of shear legs lowers it onto a **stone truck**.
7. A team draws the truck in at the mill's **west doors**.
8. The finished **column** is rolled out of the east doors on **log rollers** to the **lathe**,
   where it turns against wet sand while a polisher works it.
9. Two men roll it up **skids** onto the wagon.
10. The team hauls it through town and out onto the **main wharf**.
11. The schooner's crew hauls it aboard on a **tackle** from the foremast.
12. and 13. Down the estuary on the high tide, past the Red Store, and out through Letete Passage.

Each caption names its source. The sleds, trucks, shear legs, rollers and skids are the ordinary
tools of the trade, used here to show how it could have been done; the route and the companies
follow Martin (2013).

Steps are in [src/journey.js](src/journey.js): each has a title, a caption, a source, a length
in seconds, and an `update(t)` that places the props for `t` from 0 to 1 and returns where the
camera should look. New stories can be written the same way.
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
| `journey` | `play()`, `pause()`, `go(step)`, `stop()`, `steps`, `state` |
| `life` | the people and horses: `person(role, f)`, `horse(h)`, `rideOn(object, x, y, z)`, `crowd.list`, `herd.list` |
| `world.props` | makers for props: `block()`, `column()`, `scow()`, `schooner()`, `wagon()`, `person(colour)` |
| `data.meta.structures` | where the mill, dam, flume, bridges, wharves, Red Store, old pine and quarry are |
| `route.cart` | `[x, z]` points: the mill yard → through town → the main wharf |

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
- **The town** (`town-*.bin`, `town-*.png`): a 10 m inset around the falls and the Basin, drawn in
  a hole cut in the 30 m ground. The Gorge runs from the dam below the upper bridge to the lower
  bridge, with a stepped cascade and rock walls. Streets are only the old core streets named on
  Martin's Map 4 (`data/raw/osm-town.json`, today's lines). Houses are placed along them, thickest
  between the falls and the Basin; villages and farmsteads get a few houses and barns each.
- **Named structures** (`meta.structures`) are placed from Martin's Map 4: the Bay of Fundy mill
  (No. 1), the dam and flume, the upper (Brunswick Street) and lower (South Street) bridges, the
  main wharf, the old white pine. The Red Store wharf follows Map 2.

`data/preview.png` is a top-down check image written by every build. `PROBE="lat,lon;..."`
prints what the build decided at a point; `ASCII="lat,lon,cells"` prints the land/sea mask
around it.

## Known limits

- Houses, stores and barns are generic 1870s shapes that show how the town was laid out, not
  particular buildings. The mill, dam, flume, bridges and wharves are placed from Map 4 but their
  shapes are imagined. Churches stand at today's church sites; their 1874 sites are unconfirmed.
- No roads outside the town and no railway (the Grand Southern reached St. George in 1880).
- Shorelines and lake levels are modern. Places marked **\*** were placed by eye from maps or
  written descriptions: the quarries, the first shed, the mill, the wharves, the old pine, the
  first St. George, Letete Passage.
- Outside the town the ground is 30 m, so the quarry face stands on the hillside rather than being
  cut into it. A second detailed inset around the quarry would fix that.

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
