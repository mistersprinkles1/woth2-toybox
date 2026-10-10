// Page side of the web Toybox. Without a save, what the app asks its Python core (the start state, each map's
// model, the encyclopedia) is the same for everyone: it was made once when the site was built (web/build_web.sh)
// and is just fetched here. Only when the player imports their save is the Python core (worker.js) started.
(function () {
  const base = new URL('./', document.baseURI).href;
  const get = (p) => fetch(base + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p + ' ' + r.status))));
  let worker = null, next = 1;
  const waiting = new Map();
  function core() {
    if (!worker) {
      worker = new Worker(new URL('worker.js', document.baseURI), { type: 'module' });
      worker.onmessage = ({ data }) => { const cb = waiting.get(data.id); if (cb) { waiting.delete(data.id); cb(data.out || ''); } };
    }
    return worker;
  }
  function send(msg, cb, transfer) {
    const id = next++;
    waiting.set(id, cb);
    core().postMessage(Object.assign({ id }, msg), transfer || []);
  }
  // a core command: argv / env as JSON text, cb(output text, like the core prints it)
  window.toyboxRun = (argvJson, envJson, cb) => {
    const argv = JSON.parse(argvJson);
    if (argv.includes('--save')) return send({ op: 'run', argv: argvJson, env: envJson }, cb);   // the player's save: Python
    const done = (p) => p.then((t) => cb(t.trim())).catch((e) => cb(JSON.stringify({ error: String(e.message || e) })));
    switch (argv[0]) {
      case 'state': return done(get('data/state.json'));
      case 'encyclopedia': return done(get('data/encyclopedia.json'));
      case 'prepare': return cb(JSON.stringify({ dir: '/mappack/' + argv[1], icons: '/mappack/icons', missing: [], warnings: [] }));
      default: return cb(JSON.stringify({ error: 'Not in the web app.' }));
    }
  };
  // a file the core wrote (model.json, fow.png), as base64 ('' when missing)
  window.toyboxRead = (path, cb) => send({ op: 'read', path }, cb);
  // the player picks their save; cb('{"ok":true,"path":...}' | '' when nothing was picked)
  window.toyboxPickSave = (cb) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.nrgs,.bak';
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) { cb(''); return; }
      const buf = await f.arrayBuffer();
      send({ op: 'save', bytes: buf }, cb, [buf]);
    };
    input.click();
  };
  window.toyboxForgetSave = (cb) => send({ op: 'forget-save' }, cb);
  // a text file the player picks (Toybox data / notes import); cb('') when nothing was picked
  window.toyboxPickText = (cb) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => { const f = input.files && input.files[0]; cb(f ? await f.text() : ''); };
    input.click();
  };
  window.toyboxBase = () => document.baseURI;
  // tests: hand the core a save directly (ArrayBuffer)
  window.toyboxPutSave = (buf, cb) => send({ op: 'save', bytes: buf }, cb || (() => {}), [buf]);
})();
