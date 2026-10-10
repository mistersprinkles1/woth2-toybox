// Page side of the web Toybox: the app (Godot) calls these through JavaScriptBridge; the core runs in worker.js.
(function () {
  const worker = new Worker(new URL('worker.js', document.baseURI), { type: 'module' });
  let next = 1;
  const waiting = new Map();
  worker.onmessage = ({ data }) => {
    const cb = waiting.get(data.id);
    if (cb) { waiting.delete(data.id); cb(data.out || ''); }
  };
  function send(msg, cb) {
    const id = next++;
    waiting.set(id, cb);
    worker.postMessage(Object.assign({ id }, msg));
  }
  // a core command: argv / env as JSON text, cb(output text)
  window.toyboxRun = (argv, env, cb) => send({ op: 'run', argv, env }, cb);
  // a file the core wrote, as base64 ('' when missing)
  window.toyboxRead = (path, cb) => send({ op: 'read', path }, cb);
  window.toyboxBase = () => document.baseURI;
})();
