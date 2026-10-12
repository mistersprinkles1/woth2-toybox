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
    const done = (p) => p.then((t) => cb(t.trim())).catch((e) => cb(JSON.stringify({ error: String(e.message || e) })));
    if (argv[0] === 'encyclopedia') return done(get('data/encyclopedia.json'));   // the same for everyone, save or not
    if (argv.includes('--save')) return send({ op: 'run', argv: argvJson, env: envJson }, cb);   // the player's save: Python
    switch (argv[0]) {
      case 'state': return done(get('data/state.json'));
      case 'encyclopedia': return done(get('data/encyclopedia.json'));
      case 'stats': return done(get('data/stats.json'));            // no save: the challenge / mission list to tick off
      case 'prepare': return cb(JSON.stringify({ dir: '/mappack/' + argv[1], icons: '/mappack/icons', missing: [], warnings: [] }));
      default: return cb(JSON.stringify({ error: 'Not in the web app.' }));
    }
  };
  // a file the core wrote (model.json, fow.png), as base64 ('' when missing)
  window.toyboxRead = (path, cb) => send({ op: 'read', path }, cb);
  // Browsers only open a file picker straight from a real click on the page, and the app's own buttons are drawn
  // inside the game engine - so a small page dialog with a real button asks for the file.
  function pickFile(title, text, accept, done) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,sans-serif';
    wrap.innerHTML = '<div style="background:#14110d;border:1px solid #6b5a3c;border-radius:12px;padding:22px 24px;max-width:440px;width:calc(100% - 48px);color:#efe6d2;box-shadow:0 10px 40px #000">' +
      '<div style="font-weight:700;font-size:18px;margin-bottom:8px">' + title + '</div>' +
      '<div style="font-size:14px;line-height:1.45;color:#b9ad95;margin-bottom:18px">' + text + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      '<button data-k="cancel" style="background:#2a241b;color:#efe6d2;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer">Cancel</button>' +
      '<button data-k="pick" style="background:#dcc79a;color:#16120c;border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer">Choose file…</button></div></div>';
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.style.display = 'none';
    wrap.appendChild(input); document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('[data-k=cancel]').onclick = () => { close(); done(null); };
    wrap.querySelector('[data-k=pick]').onclick = () => input.click();          // a real click: the browser allows the picker
    input.onchange = () => { const f = input.files && input.files[0]; close(); done(f || null); };
  }
  // the player picks their save; cb('{"ok":true,"path":...}' | '' when nothing was picked)
  window.toyboxPickSave = (cb) => pickFile('Import your save',
    'Pick <b>SaveData.nrgs</b>. On Windows it is in %LOCALAPPDATA%\\WOTH2\\Saved\\SaveGames\\Account_…<br>It stays in this browser. The first time, reading it downloads about 36 MB.' +
    (matchMedia('(pointer: coarse)').matches ? '<br><br><b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.' : ''),
    '.nrgs,.bak', async (f) => {
      if (!f) { cb(''); return; }
      const buf = await f.arrayBuffer();
      send({ op: 'save', bytes: buf }, cb, [buf]);
    });
  window.toyboxForgetSave = (cb) => send({ op: 'forget-save' }, cb);
  // a text file the player picks (Toybox data / notes import); cb('') when nothing was picked
  window.toyboxPickText = (cb) => pickFile('Import your Toybox data', 'Pick a file you exported from the Toybox (.json). It is added to what you have here.',
    '.json,application/json', async (f) => cb(f ? await f.text() : ''));
  window.toyboxBase = () => document.baseURI;
  // tests: hand the core a save directly (ArrayBuffer)
  window.toyboxPutSave = (buf, cb) => send({ op: 'save', bytes: buf }, cb || (() => {}), [buf]);
})();
