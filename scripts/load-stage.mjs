// Loads the shipped stage data in node (no WebGL), for checks and analysis scripts.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { loadData } from '../src/data.js';

THREE.TextureLoader.prototype.loadAsync = async () => new THREE.Texture();
globalThis.fetch = async (url) => {
  const b = await fs.readFile(new URL('../public/' + url, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), json: async () => JSON.parse(b) };
};
export const load = () => loadData();
