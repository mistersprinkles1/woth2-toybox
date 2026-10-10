// The Toybox core in the browser, only started when the player imports their save (Settings > Save file): Pyodide
// (Python as WebAssembly) running woth2_core.py, the same Python the desktop apps use, plus the Oodle decoder the
// save needs. Messages: {id, op: "run" | "read" | "save" | "forget-save" | "hello", ...}. The save never leaves the
// browser: it is kept in this browser's IndexedDB only.
import { loadPyodide } from './pyodide/pyodide.mjs';
import OozModule from './ooz.mjs';

const BASE = new URL('./', self.location.href).href;
let py, ooz, run, manifest;
const seeded = new Set();

function idb() {
  return new Promise((ok, bad) => {
    const r = indexedDB.open('woth2-toybox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((ok) => { const q = db.transaction('files').objectStore('files').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((ok) => { const t = db.transaction('files', 'readwrite'); v === null ? t.objectStore('files').delete(k) : t.objectStore('files').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); });
}
async function fetchBytes(rel) {
  const r = await fetch(BASE + rel);
  if (!r.ok) throw new Error(rel + ': ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// The map files the core reads (zones, spawn areas, lands...). The big pictures are only needed by the page: the
// core just checks they are there, so it gets empty stand-ins.
async function seedMap(m) {
  if (seeded.has(m)) return;
  const FS = py.FS, dir = '/core/mappack/' + m;
  FS.mkdirTree(dir);
  const mm = manifest.maps[m];
  await Promise.all(mm.small.filter((n) => n !== 'model.json').map(async (n) => FS.writeFile(dir + '/' + n, await fetchBytes('mappack/' + m + '/' + n))));
  for (const n of mm.images) if (n !== 'satellite.jpg') FS.writeFile(dir + '/' + n, new Uint8Array(0));
  FS.writeFile(dir + '/satellite.png', new Uint8Array(0));
  seeded.add(m);
}

async function boot() {
  py = await loadPyodide({ indexURL: BASE + 'pyodide/', stdout: () => {}, stderr: () => {} });
  await py.loadPackage(['numpy', 'scipy', 'pillow'], { messageCallback: () => {}, errorCallback: () => {} });
  ooz = await OozModule({ locateFile: (f) => BASE + f });
  manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('mappack/manifest.json')));
  py.unpackArchive((await fetchBytes('core.zip')).buffer, 'zip', { extractDir: '/core' });
  const FS = py.FS;
  FS.mkdirTree('/core/mappack/icons');
  for (const n of manifest.icons) FS.writeFile('/core/mappack/icons/' + n, n === 'VERSION' ? await fetchBytes('mappack/icons/VERSION') : new Uint8Array(0));
  FS.writeFile('/core/mappack/schedules.json', await fetchBytes('mappack/schedules.json'));
  FS.mkdirTree('/saves');
  const kept = await idbGet('save');
  if (kept) FS.writeFile('/saves/SaveData.nrgs', kept);
  py.registerJsModule('toybox_host', {
    ooz(src, dstLen) {
      const buf = src.getBuffer ? src.getBuffer('u8') : null;
      const data = buf ? buf.data : src;
      try {
        const s = ooz._malloc(data.length), d = ooz._malloc(dstLen + 64);
        ooz.HEAPU8.set(data, s);
        const r = ooz._ooz_kraken(s, data.length, d, dstLen);
        const out = r === dstLen ? ooz.HEAPU8.slice(d, d + dstLen) : null;
        ooz._free(s); ooz._free(d);
        return out;
      } finally { if (buf) buf.release(); }
    },
    reg_query() { return null; },
    tasklist() { return ''; },
  });
  py.runPython(await (await fetch(BASE + 'runner.py')).text());
  run = py.globals.get('toybox_run');
}
const ready = boot();

function b64(u8) {
  let s = ''; const C = 0x8000;
  for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C));
  return btoa(s);
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    await ready;
    if (op === 'save') {                               // the player's save: kept here and in this browser
      const u8 = new Uint8Array(data.bytes);
      py.FS.writeFile('/saves/SaveData.nrgs', u8); await idbPut('save', u8);
      self.postMessage({ id, out: JSON.stringify({ ok: true, path: '/saves/SaveData.nrgs' }) }); return;
    }
    if (op === 'forget-save') {
      try { py.FS.unlink('/saves/SaveData.nrgs'); } catch { /* none */ }
      await idbPut('save', null); self.postMessage({ id, out: '{"ok": true}' }); return;
    }
    if (op === 'read') {                               // a file the core wrote (model.json, fow.png): base64
      let out = '';
      try { out = b64(py.FS.readFile(data.path)); } catch { out = ''; }
      self.postMessage({ id, out }); return;
    }
    const argv = JSON.parse(data.argv);
    if (argv[0] === 'prepare' && manifest.maps[argv[1]]) await seedMap(argv[1]);
    const env = Object.assign({ HOME: '/home/pyodide' }, JSON.parse(data.env || '{}'));
    const res = run(JSON.stringify(argv), JSON.stringify(env)).toJs();
    self.postMessage({ id, out: res[0], err: res[1] });
  } catch (e) {
    self.postMessage({ id, out: JSON.stringify({ error: String(e && e.message || e) }) + '\n' });
  }
};
