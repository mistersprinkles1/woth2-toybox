// Page side of the web Toybox. The web app never reads a save, so everything the app would ask its Python core
// is the same for everyone: it was made once when the site was built (web/build_web.sh) and is just fetched here.
(function () {
  const base = new URL('./', document.baseURI).href;
  const get = (p) => fetch(base + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p + ' ' + r.status))));
  // a core command: argv as JSON text, cb(output text, like the core prints it)
  window.toyboxRun = (argvJson, envJson, cb) => {
    const argv = JSON.parse(argvJson);
    const done = (p) => p.then((t) => cb(t.trim())).catch((e) => cb(JSON.stringify({ error: String(e.message || e) })));
    switch (argv[0]) {
      case 'state': return done(get('data/state.json'));
      case 'encyclopedia': return done(get('data/encyclopedia.json'));
      case 'prepare': return cb(JSON.stringify({ dir: '/mappack/' + argv[1], icons: '/mappack/icons', missing: [], warnings: [] }));
      default: return cb(JSON.stringify({ error: 'Not in the web app.' }));
    }
  };
  window.toyboxRead = (path, cb) => cb('');
  window.toyboxBase = () => document.baseURI;
})();
