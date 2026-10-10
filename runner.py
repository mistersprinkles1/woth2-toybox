# Runs one woth2_core command inside the WebAssembly Python (see host.mjs / worker.mjs). Windows paths coming in
# (arguments, the JSON body, path-like environment values) become /mnt/<drive>/..., and paths going out turn
# back into C:\... so the app sees exactly what the native core printed.
import io, json, os, re, sys, traceback

_WINPATH = re.compile(r"^[A-Za-z]:[\\/]")


def _in(v):
    import hostos
    if isinstance(v, str):
        if not _WINPATH.match(v):
            return v
        if hostos.WINDOWS and not os.path.isdir("/mnt/" + v[0].lower()):     # not mounted: a write would only fill memory
            raise FileNotFoundError(f"Drive {v[0].upper()}: is not available")
        return hostos.p(v)
    if isinstance(v, list):
        return [_in(x) for x in v]
    if isinstance(v, dict):
        return {k: _in(x) for k, x in v.items()}
    return v


def _out(v):
    import hostos
    if isinstance(v, str):
        if v == "/core" or v.startswith("/core/"):             # the core's own folder, as the host knows it
            base = os.environ.get("WOTH2_CORE_HOST", "")
            if base:
                v = base.rstrip("/\\") + (v[5:].replace("/", "\\") if hostos.WINDOWS else v[5:])
                return v
        return hostos.host(v) if v.startswith("/mnt/") else v
    if isinstance(v, list):
        return [_out(x) for x in v]
    if isinstance(v, dict):
        return {k: _out(x) for k, x in v.items()}
    return v


def toybox_run(argv_json, env_json):
    argv = json.loads(argv_json)
    for k, v in json.loads(env_json).items():
        os.environ[k] = v
    sys.path.insert(0, "/core")
    os.chdir("/core")
    for k in list(os.environ):
        if _WINPATH.match(os.environ[k] or ""):
            os.environ[k] = _in(os.environ[k])
    argv = [_in(a) for a in argv]
    if len(argv) > 1 and argv[1][:1] in ("{", "["):       # the JSON body handed over directly (the app's pipe)
        try:
            argv[1] = json.dumps(_in(json.loads(argv[1])))
        except ValueError:
            pass
    if len(argv) > 1 and argv[1].startswith("@"):     # the JSON body file the app wrote
        with open(_in(argv[1][1:]), encoding="utf-8") as f:
            body = f.read()
        try:
            body = json.dumps(_in(json.loads(body)))
        except ValueError:
            pass
        argv[1] = body
    out, err = io.StringIO(), io.StringIO()
    old = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    try:
        import woth2_core
        try:
            woth2_core.main(argv)
        except SystemExit:
            pass
        except Exception as e:
            json.dump({"error": str(e)}, sys.stdout); print()
            traceback.print_exc()
    finally:
        sys.stdout, sys.stderr = old
    lines = []
    for line in out.getvalue().split("\n"):
        if line.startswith("{") or line.startswith("["):
            try:
                line = json.dumps(_out(json.loads(line)))
            except ValueError:
                pass
        lines.append(line)
    return ["\n".join(lines), err.getvalue()]
