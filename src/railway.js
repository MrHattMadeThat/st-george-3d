import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Saved OSM corridor; station and rolling stock are interpretive, not surveyed reconstructions.
export function buildRailway(data, world, source, scene) {
  const group = new THREE.Group(); group.name = 'Railway · 1880 onward'; scene.add(group);
  const materials = new Map();
  const mat = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return materials.get(color);
  };
  const box = (parent, w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y + h / 2, z); parent.add(m); return m;
  };
  const cylinder = (parent, r, h, x, y, z, color, rotation = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat(color));
    m.rotation.z = rotation; m.position.set(x, y, z); parent.add(m); return m;
  };
  const points = source.points.map(([lat, lon]) => { const p = data.toLocal(lat, lon); return new THREE.Vector3(p.x, 0, p.z); });
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const count = Math.ceil(length / 1.4);
  const samples = Array.from({ length: count + 1 }, (_, i) => {
    const p = curve.getPointAt(i / count);
    p.y = data.heightAt(p.x, p.z); return p;
  });
  let tracks;
  function rebuild() {
    if (tracks) { group.remove(tracks); tracks.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
    tracks = new THREE.Group(); group.add(tracks);
    const parts = { ballast: [], rail: [], sleeper: [] };
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const a = samples[i].clone(), b = samples[i + 1].clone();
      a.y = a.y * world.exag + 0.5; b.y = b.y * world.exag + 0.5;
      const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a), span = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      parts.ballast.push(new THREE.BoxGeometry(4.2, 0.6, span + 0.15).applyQuaternion(q).translate(mid.x, mid.y - 0.15, mid.z));
      parts.sleeper.push(new THREE.BoxGeometry(2.6, 0.18, 0.24).applyQuaternion(q).translate(mid.x, mid.y + 0.23, mid.z));
      for (const s of [-1, 1]) parts.rail.push(new THREE.BoxGeometry(0.09, 0.15, span + 0.08).applyQuaternion(q).translate(mid.x + side.x * s * 0.7175, mid.y + 0.38, mid.z + side.z * s * 0.7175));
    }
    for (const [kind, color] of [['ballast', '#827d70'], ['sleeper', '#514539'], ['rail', '#b8b7ab']]) {
      const geometry = mergeGeometries(parts[kind]);
      parts[kind].forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, mat(color)); mesh.name = kind; tracks.add(mesh);
    }
    placeStation();
  }
  const station = new THREE.Group(); station.name = 'St. George station · approximate'; group.add(station);
  box(station, 7, 0.9, 42, 5.5, -0.2, 0, '#817361');
  box(station, 6, 4.7, 16, 8, 0.7, 0, '#d5c4a1');
  box(station, 6.4, 0.25, 16.4, 8, 0.85, 0, '#6b5240');
  for (const s of [-1, 1]) {
    const roof = box(station, 4.8, 0.23, 18, 8 + s * 1.9, 5.7, 0, '#354b4c'); roof.rotation.z = -s * 0.38;
  }
  for (let z = -6; z <= 6; z += 3) {
    box(station, 0.12, 1.65, 1.3, 4.94, 2.1, z, '#efe8d4');
    box(station, 0.14, 1.3, 0.95, 4.86, 2.27, z, '#314b50');
  }
  box(station, 0.15, 2.4, 1.5, 4.8, 0.9, 0, '#4c645c');
  box(station, 0.9, 2.7, 0.9, 9, 5.2, -4, '#945d48');
  const canopy = box(station, 4.3, 0.18, 20, 3.5, 4.15, 0, '#354b4c'); canopy.rotation.z = -0.1;
  for (const z of [-8, 0, 8]) box(station, 0.17, 3.3, 0.17, 1.8, 0.9, z, '#e7dcc2');
  for (let i = 0; i < 7; i++) box(station, 1.2, 0.9 + (i % 2) * 0.6, 1.1, 5.7 + i % 2 * 1.3, 0.8, 12 + Math.floor(i / 2) * 1.3, '#8d6949');
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#234340'; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#f3e6c9'; ctx.font = 'bold 40px Georgia'; ctx.textAlign = 'center'; ctx.fillText('ST. GEORGE', 256, 61);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.03), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  sign.position.set(4.74, 4.1, 0); sign.rotation.y = -Math.PI / 2; station.add(sign);
  const stopAt = 0.27;
  function placeStation() {
    const p = curve.getPointAt(stopAt), d = curve.getTangentAt(stopAt);
    station.position.set(p.x, data.heightAt(p.x, p.z) * world.exag + 0.5, p.z);
    station.rotation.y = Math.atan2(d.x, d.z);
  }
  const locomotive = new THREE.Group(); locomotive.name = 'Interpretive steam locomotive'; group.add(locomotive);
  box(locomotive, 2.4, 0.35, 7, 0, 0.8, 0, '#222e2e');
  const boiler = cylinder(locomotive, 0.75, 4.3, 0, 2, 0.5, '#2d3c39'); boiler.rotation.x = Math.PI / 2;
  box(locomotive, 2.25, 2.8, 2.25, 0, 1.1, -2.4, '#4b6154');
  box(locomotive, 2.65, 0.22, 2.65, 0, 3.9, -2.4, '#253937');
  for (const s of [-1, 1]) box(locomotive, 0.05, 1.3, 1.4, s * 1.15, 2.3, -2.25, '#b8d0c6');
  cylinder(locomotive, 0.28, 1.6, 0, 3.2, 1.8, '#263431');
  cylinder(locomotive, 0.45, 0.25, 0, 4, 1.8, '#283c38');
  cylinder(locomotive, 0.37, 0.55, 0, 2.9, -0.3, '#af9154');
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({color:'#ffe6a0'})); lamp.position.set(0, 2.4, 2.8); locomotive.add(lamp);
  const wheels = [];
  for (const z of [-2, -0.6, 0.8, 2.2]) for (const s of [-1, 1]) {
    const wheel = cylinder(locomotive, 0.62, 0.18, s * 1.1, 0.68, z, '#313332', Math.PI / 2);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.95), mat('#b5a78b')); hub.rotation.z = -Math.PI / 2; wheel.add(hub); wheels.push(wheel);
  }
  const wagon = new THREE.Group(); group.add(wagon);
  box(wagon, 2.5, 0.35, 6, 0, 0.9, 0, '#72563c');
  for (const z of [-2, 2]) for (const s of [-1, 1]) cylinder(wagon, 0.5, 0.17, s * 1.1, 0.63, z, '#333b37', Math.PI / 2);
  for (let i = 0; i < 3; i++) box(wagon, 1.6, 1, 1.4, 0, 1.25, -1.8 + i * 1.8, ['#a96654','#b67b63','#aa715e'][i]);
  const smoke = Array.from({length:8}, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({color:'#e5e1ce', transparent:true, opacity:0.2, depthWrite:false})); group.add(m); return m;
  });
  let clock = 0;
  function pose(object, distance) {
    const t = THREE.MathUtils.clamp(distance / length, 0, 1), p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    object.position.set(p.x, data.heightAt(p.x, p.z) * world.exag + 0.9, p.z);
    object.rotation.y = Math.atan2(tangent.x, tangent.z);
    const ahead = curve.getPointAt(Math.min(1,t+0.002)), behind = curve.getPointAt(Math.max(0,t-0.002));
    object.rotation.x = -Math.atan2((data.heightAt(ahead.x,ahead.z)-data.heightAt(behind.x,behind.z))*world.exag, ahead.distanceTo(behind));
  }
  function update(dt) {
    if (!group.visible) return;
    clock += dt;
    // A short station visit: pause, depart along the available corridor, then reset off camera at its end.
    const phase = clock % 100, distance = phase < 18 ? length * stopAt : Math.min(length - 5, length * stopAt + (phase - 18) * 4.5);
    pose(locomotive, distance); pose(wagon, distance - 8);
    if (phase >= 18) wheels.forEach(w => w.rotation.y = clock * 7);
    smoke.forEach((p, i) => {
      const age = (clock * 0.45 + i / smoke.length) % 1;
      p.position.copy(locomotive.position).add(new THREE.Vector3(-age * 5, 4 + age * 8, age * 3));
      p.scale.setScalar(0.35 + age * 1.6); p.material.opacity = (1-age)*0.24;
    });
  }
  rebuild(); update(0);
  const location = curve.getPointAt(stopAt);
  return { group, update, refresh: rebuild, restart() { clock = 0; update(0); }, location, setVisible(on) { group.visible = on; } };
}
