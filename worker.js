// The Toybox core in the browser: Pyodide (Python as WebAssembly) running woth2_core.py, the same Python the
// desktop apps use. The page talks to it with messages: {id, op: "run" | "read", ...}. The web app never reads a
// save: everything comes from the map pack on the site.
import { loadPyodide } from './pyodide/pyodide.mjs';

const BASE = new URL('./', self.location.href).href;
let py, run, manifest;
const seeded = new Set();

async function fetchBytes(rel) {
  const r = await fetch(BASE + rel);
  if (!r.ok) throw new Error(rel + ': ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// The map files the core reads (zones, spawn areas, lands...). The big pictures are only needed by the page:
// the core just checks they are there, so it gets empty stand-ins.
async function seedMap(m) {
  if (seeded.has(m)) return;
  const FS = py.FS, dir = '/core/mappack/' + m;
  FS.mkdirTree(dir);
  const mm = manifest.maps[m];
  await Promise.all(mm.small.map(async (n) => FS.writeFile(dir + '/' + n, await fetchBytes('mappack/' + m + '/' + n))));
  for (const n of mm.images) if (n !== 'satellite.jpg') FS.writeFile(dir + '/' + n, new Uint8Array(0));
  FS.writeFile(dir + '/satellite.png', new Uint8Array(0));
  seeded.add(m);
}

async function boot() {
  py = await loadPyodide({ indexURL: BASE + 'pyodide/', stdout: () => {}, stderr: () => {} });
  await py.loadPackage(['numpy', 'scipy', 'pillow'], { messageCallback: () => {}, errorCallback: () => {} });
  manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('mappack/manifest.json')));
  py.unpackArchive((await fetchBytes('core.zip')).buffer, 'zip', { extractDir: '/core' });
  const FS = py.FS;
  FS.mkdirTree('/core/mappack/icons');
  for (const n of manifest.icons) FS.writeFile('/core/mappack/icons/' + n, n === 'VERSION' ? await fetchBytes('mappack/icons/VERSION') : new Uint8Array(0));
  FS.writeFile('/core/mappack/schedules.json', await fetchBytes('mappack/schedules.json'));
  py.registerJsModule('toybox_host', { reg_query() { return null; }, tasklist() { return ''; } });
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
