// The Toybox core in the browser, only started when the player imports their save (Settings > Save file): Pyodide
// (Python as WebAssembly) running woth2_core.py, the same Python the desktop apps use, plus the Oodle decoder the
// save needs. Messages: {id, op: "run" | "read" | "save" | "forget-save" | "hello", ...}. The save never leaves the
// browser: it is kept in this browser's IndexedDB only.
import { loadPyodide } from './pyodide/pyodide.mjs';
import OozModule from './ooz.mjs';

const BASE = new URL('./', self.location.href).href;
let py, ooz, run, manifest;
const seeded = new Set();
// Answers for the imported save are kept in this browser too (with the files the map read), so opening the site
// again with the same save shows it straight away: Python is only started when something new is asked.
const KEEP = new Set(['state', 'prepare', 'stats', 'saveinfo']);
let saveId = '';                                     // site build + the save's fingerprint; '' = no save

function idb() {
  return new Promise((ok, bad) => {
    const r = indexedDB.open('woth2-toybox', 2);
    r.onupgradeneeded = () => { for (const n of ['files', 'answers']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
  });
}
async function idbGet(k, store = 'files') {
  const db = await idb();
  return new Promise((ok) => { const q = db.transaction(store).objectStore(store).get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); });
}
async function idbPut(k, v, store = 'files') {
  const db = await idb();
  return new Promise((ok) => { const t = db.transaction(store, 'readwrite'); v === null ? t.objectStore(store).delete(k) : t.objectStore(store).put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); });
}
async function forgetAnswers() {
  const db = await idb();
  return new Promise((ok) => { const t = db.transaction('answers', 'readwrite'); t.objectStore('answers').clear(); t.oncomplete = () => ok(); t.onerror = () => ok(); });
}
async function fingerprint(u8) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
  return manifest.version + ':' + Array.from(h.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function fetchBytes(rel) {
  const r = await fetch(BASE + rel + (rel.includes('?') ? '&' : '?') + 'v=1793322805');
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
  for (const n of mm.images) if (n !== 'satellite.jpg') FS.writeFile(dir + '/' + n.replace(/\.webp$/, '.png'), new Uint8Array(0));   // the core looks for .png
  FS.writeFile(dir + '/satellite.png', new Uint8Array(0));
  seeded.add(m);
}

// where the start is at, for the page's loading bar ("2/4 what"); '' when ready
const stage = (t) => self.postMessage({ stage: t });

// scipy (and its maths library, 20 MB) is only needed to build maps from game files, which the website never does:
// it is fetched the first time a command asks for it, not at every start.
let scipy = false;
async function needScipy() {
  if (scipy) return; stage('4/4 Getting the map tools');
  await py.loadPackage(['scipy'], { messageCallback: () => {}, errorCallback: () => {} }); scipy = true;
}

// the small start: the site's map list and the kept save (no Python yet)
async function start() {
  manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('mappack/manifest.json')));
  const kept = await idbGet('save');
  if (kept) saveId = await fingerprint(kept);
}
let booted = null;
const python = () => booted || (booted = boot());

async function boot() {
  stage('1/4 Downloading the save reader');
  py = await loadPyodide({ indexURL: BASE + 'pyodide/', stdout: () => {}, stderr: () => {} });
  stage('2/4 Downloading its tools');
  await py.loadPackage(['numpy', 'pillow'], { messageCallback: () => {}, errorCallback: () => {} });
  stage('3/4 Opening the Toybox');
  ooz = await OozModule({ locateFile: (f) => BASE + f });
  py.unpackArchive((await fetchBytes('core.zip')).buffer, 'zip', { extractDir: '/core' });
  const FS = py.FS;
  FS.mkdirTree('/core/mappack/icons');
  for (const n of manifest.icons) FS.writeFile('/core/mappack/icons/' + n, n === 'VERSION' ? await fetchBytes('mappack/icons/VERSION') : new Uint8Array(0));
  FS.writeFile('/core/mappack/schedules.json', await fetchBytes('mappack/schedules.json'));
  FS.mkdirTree('/saves');
  const kept = await idbGet('save');
  if (kept) {
    FS.writeFile('/saves/SaveData.nrgs', kept);
    const t = await idbGet('save_mtime'); if (t) FS.utime('/saves/SaveData.nrgs', t, t);   // the game's save time, not now
  }
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
  py.runPython(await (await fetch(BASE + 'runner.py?v=1793322805')).text());
  run = py.globals.get('toybox_run');
  stage('');
}
const ready = start();

// a core command run by Python -> [out, err]
async function core(argv, envJson) {
  await python();
  if (argv[0] === 'prepare' && manifest.maps[argv[1]]) await seedMap(argv[1]);
  const env = JSON.stringify(Object.assign({ HOME: '/home/pyodide' }, JSON.parse(envJson)));
  let res = run(JSON.stringify(argv), env).toJs();
  if (!scipy && /No module named '?scipy/.test(String(res[0]) + String(res[1]))) {   // a map tool after all: get it, run again
    await needScipy(); stage(''); res = run(JSON.stringify(argv), env).toJs();
  }
  return res;
}

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
      await idbPut('save', u8); await idbPut('save_mtime', data.mtime || 0);
      await forgetAnswers(); saveId = await fingerprint(u8);
      if (booted) {                                    // Python already up: hand it the new file too
        await booted; py.FS.writeFile('/saves/SaveData.nrgs', u8);
        if (data.mtime) py.FS.utime('/saves/SaveData.nrgs', data.mtime, data.mtime);   // file date = when the game saved it
      }
      self.postMessage({ id, out: JSON.stringify({ ok: true, path: '/saves/SaveData.nrgs' }) }); return;
    }
    if (op === 'forget-save') {
      if (booted) { await booted; try { py.FS.unlink('/saves/SaveData.nrgs'); } catch { /* none */ } }
      await idbPut('save', null); await idbPut('save_mtime', 0); await forgetAnswers(); saveId = ''; self.postMessage({ id, out: '{"ok": true}' }); return;
    }
    if (op === 'read') {                               // a file the core wrote (model.json, fow.png): base64
      const key = saveId && saveId + ' file ' + data.path;
      let out = key ? await idbGet(key, 'answers') : null;
      if (out == null) {
        const file = () => { try { return b64(py.FS.readFile(data.path)); } catch { return ''; } };
        out = booted ? (await booted, file()) : '';
        const redo = !out && key && await idbGet(saveId + ' made ' + data.path.replace(/\/[^/]*$/, ''), 'answers');
        if (redo) { await core(redo.argv, redo.env); out = file(); }   // its run was a kept answer: make the file again
        if (key && out) await idbPut(key, out, 'answers');
      }
      self.postMessage({ id, out }); return;
    }
    const argv = JSON.parse(data.argv), env = data.env || '{}';
    const key = saveId && argv.includes('--save') && KEEP.has(argv[0]) && saveId + ' run ' + data.argv + ' ' + env;
    const kept = key ? await idbGet(key, 'answers') : null;
    if (kept) { self.postMessage({ id, out: kept[0], err: kept[1] }); return; }
    const res = await core(argv, env);
    if (key && !/"error"/.test(String(res[0]).slice(0, 200))) {
      await idbPut(key, [res[0], res[1]], 'answers');
      if (argv[0] === 'prepare') {                     // which run makes this map's files, for a read that was not kept
        try { const dir = JSON.parse(String(res[0]).trim().split('\n').pop()).dir; if (dir) await idbPut(saveId + ' made ' + dir, { argv, env }, 'answers'); } catch { /* not json */ }
      }
    }
    self.postMessage({ id, out: res[0], err: res[1] });
  } catch (e) {
    self.postMessage({ id, out: JSON.stringify({ error: String(e && e.message || e) }) + '\n' });
  }
};
