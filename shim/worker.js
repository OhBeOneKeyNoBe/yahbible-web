/* YahBible Web — sqlite + pack worker.
   Owns everything heavy: pack downloads (fetch → gunzip → OPFS via the
   opfs-sahpool VFS, streamed with importDbChunked so a 1GB database never
   sits in RAM), and all SQL. The page talks to it via {id, op, ...} messages.
   Mirrors the desktop server's _NullConn rule: an absent database answers
   every query with empty rows — the app degrades, never crashes. */
"use strict";

/* sqlite3.js resolves its .wasm via sqlite3InitModuleState.sqlite3Dir — point it
   at the vendor dir (the worker lives in shim/, the wasm does not). */
globalThis.sqlite3InitModuleState = {
  sqlite3Dir: new URL("../vendor/sqlite-wasm/", self.location.href).href,
  debugModule: () => {},
  urlParams: new URLSearchParams(),
};
importScripts("../vendor/sqlite-wasm/sqlite3.js");

const HF = "https://huggingface.co/OhBeOneKeyNoBe/YahBible-Mobile/resolve/main/packs/desktop/";
const HFWEB = "https://huggingface.co/OhBeOneKeyNoBe/YahBible-Mobile/resolve/main/packs/web/";
/* pack host is overridable (tests / a same-origin mirror) via ?packbase=/?packbaseweb= */
const _P = new URLSearchParams(self.location.search);
const PACK_BASE = _P.get("packbase") || "";
const PACK_BASE_WEB = _P.get("packbaseweb") || "";
function packUrl(ent) {
  const base = ent._base === HFWEB ? (PACK_BASE_WEB || HFWEB) : (PACK_BASE || HF);
  return base + ent.gz;
}
let sqlite3 = null, pool = null;
const DBS = {};          // logical name -> open Db (or null = absent)
let manifest = null;

/* logical db name -> pack rel suffix (matches the desktop tree) */
const DB_PACKS = {
  watchman: "watchman/watchman.db",
  versions: "Holorites_data/daeos/taviel_versions.sqlite",
  corpus: "Holorites_data/daeos/taviel_corpus.sqlite",
  english: "Holorites_data/daeos/english_dict.sqlite",
  lex: "Holorites_data/daeos/reflected_red_basic.sqlite",
  enoch: "Holorites/torus_upgrades/enoch_source.sqlite",
  yt: "Holorites_data/daeos/elaniel_yt.sqlite",
  kb: "web/taviel_kb.sqlite",
  canonfill: "web/canon_fill.sqlite",   // verses the compact lexicon lacks interlinear for
  wordstudy: "web/canon_wordstudy.sqlite",   // full desktop word study for the KJV vocabulary
  apocorig: "web/apoc_orig.sqlite",   // Hebrew (orig) variant for Torah/Sefaria corpora
};

let poolOk = false;
async function boot() {
  sqlite3 = await sqlite3InitModule();
  /* iOS Safari (and any browser without a working OPFS SyncAccessHandle) cannot
     install this VFS. Do NOT let that reject `ready` — that would kill every
     query and crash the page. Instead flag the pool as unavailable so the page
     can fall back to the on-demand HTTP Scripture store. */
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: "yahbible", initialCapacity: 12 });
    poolOk = !!pool;
  } catch (e) {
    pool = null; poolOk = false;
  }
}
const ready = boot();

async function getManifest() {
  if (manifest) return manifest;
  const r = await fetch((PACK_BASE || HF) + "manifest.json", { cache: "no-store" });
  const m = await r.json();
  for (const f of m.files) f._base = HF;
  try {
    const rw = await fetch((PACK_BASE_WEB || HFWEB) + "web_manifest.json", { cache: "no-store" });
    if (rw.ok) {
      const mw = await rw.json();
      for (const f of mw.files) { f._base = HFWEB; m.files.push(f); }
    }
  } catch (e) {}
  manifest = m;
  return manifest;
}

function packEntry(relSuffix) {
  if (!manifest) return null;
  return manifest.files.find((f) => f.rel.endsWith(relSuffix)) || null;
}

async function sha256hex16(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* OPFS side-directory for non-sqlite pack files + install bookkeeping */
async function filesDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("ybfiles", { create: true });
}
async function readState() {
  try {
    const d = await filesDir();
    const fh = await d.getFileHandle("installed.json");
    return JSON.parse(await (await fh.getFile()).text());
  } catch (e) { return {}; }
}
async function writeState(st) {
  const d = await filesDir();
  const fh = await d.getFileHandle("installed.json", { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(st));
  await w.close();
}

/* Serialize installs: concurrent importDb calls into one OPFS-SAHPool can
   exhaust handles / interleave writes. auto-install and on-demand both funnel
   through this chain so only one pack installs at a time. A pack already
   installing (or queued) is deduped by rel, so a click and the background
   pass share one download instead of racing two. */
let installChain = Promise.resolve();
const inflight = {};   // rel -> Promise
function installPack(relSuffix, progressId) {
  if (inflight[relSuffix]) return inflight[relSuffix];
  const run = () => installPackInner(relSuffix, progressId);
  const next = installChain.then(run, run);
  installChain = next.catch(() => {});
  inflight[relSuffix] = next.finally(() => { delete inflight[relSuffix]; });
  return inflight[relSuffix];
}

/* Download one pack (gz) and stream-decompress.
   sqlite packs -> pool.importDb (streamed); other files -> OPFS regular file. */
async function installPackInner(relSuffix, progressId) {
  await ready;
  await getManifest();
  const ent = packEntry(relSuffix);
  if (!ent) throw new Error("pack not in manifest: " + relSuffix);
  const url = packUrl(ent);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status + " for " + ent.gz);
  let got = 0;
  const ondemand = typeof progressId === "string" && progressId.startsWith("__ondemand_");
  const counter = new TransformStream({
    transform(chunk, ctrl) {
      got += chunk.byteLength;
      const p = { rel: relSuffix, got, total: ent.gz_size };
      if (ondemand) postMessage({ ondemand: { phase: "progress", ...p } });
      else if (progressId) postMessage({ id: progressId, progress: p });
      ctrl.enqueue(chunk);
    },
  });
  const plain = resp.body.pipeThrough(counter).pipeThrough(new DecompressionStream("gzip"));
  const isDb = /\.(sqlite|db)$/.test(relSuffix);
  if (isDb) {
    const reader = plain.getReader();
    const name = "/" + relSuffix.split("/").pop();
    await pool.importDb(name, async () => {
      const { done, value } = await reader.read();
      return done ? undefined : value;
    });
  } else if (relSuffix.endsWith("apoc_pack.json")) {
    /* split per source so reading one corpus never loads the whole pack */
    const txt = await new Response(plain).text();
    const pack = JSON.parse(txt);
    const d = await filesDir();
    for (const sid of Object.keys(pack.books || {})) {
      const chapters = {};
      const pre = sid + "|";
      for (const [k, v] of Object.entries(pack.chapters || {}))
        if (k.startsWith(pre)) chapters[k] = v;
      const fh = await d.getFileHandle(
        "apoc_" + sid.replace(/[^a-z0-9]+/gi, "_") + ".json", { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify({ books: pack.books[sid], chapters }));
      await w.close();
    }
  } else {
    const d = await filesDir();
    const fh = await d.getFileHandle(relSuffix.split("/").pop(), { create: true });
    const w = await fh.createWritable();
    await plain.pipeTo(w);
  }
  const st = await readState();
  st[relSuffix] = { sha16: ent.sha16, size: ent.size, ts: Date.now() };
  await writeState(st);
  /* a fresh copy of an already-open db must be re-opened */
  for (const [ln, suf] of Object.entries(DB_PACKS))
    if (suf === relSuffix && DBS[ln]) { try { DBS[ln].close(); } catch (e) {} delete DBS[ln]; }
  return { ok: true, rel: relSuffix };
}

/* ---- in-memory fallback (iPhone: no OPFS) ----
   When the OPFS pool is unavailable we can't stream a 1GB db to disk, but the
   word-study / lexicon packs are small (tens of MB) — fetch, gunzip and open
   them fully in RAM via sqlite3_deserialize, so /api/word, /api/strongs,
   /api/interlinear etc. work unchanged. The huge packs (all-versions, corpus)
   are skipped here — chapters come from the HTTP per-book store instead. */
const MEM_DBS = {};                 // logical -> Db | null (once resolved)
const MEM_SKIP = new Set(["versions", "corpus"]);
const memEnsuring = {};
function dbFromBytes(bytes) {
  const db = new sqlite3.oo1.DB();
  const p = sqlite3.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3.capi.sqlite3_deserialize(
    db.pointer, "main", p, bytes.length, bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE);
  db.checkRc(rc);
  return db;
}
function ensureDbMem(logical) {
  if (logical in MEM_DBS) return Promise.resolve(MEM_DBS[logical]);
  if (memEnsuring[logical]) return memEnsuring[logical];
  const suf = DB_PACKS[logical];
  if (!suf || MEM_SKIP.has(logical)) { MEM_DBS[logical] = null; return Promise.resolve(null); }
  memEnsuring[logical] = (async () => {
    try {
      await getManifest();
      const ent = packEntry(suf);
      if (!ent) { MEM_DBS[logical] = null; return null; }
      const resp = await fetch(packUrl(ent));
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const plain = resp.body.pipeThrough(new DecompressionStream("gzip"));
      const buf = new Uint8Array(await new Response(plain).arrayBuffer());
      MEM_DBS[logical] = dbFromBytes(buf);
    } catch (e) {
      MEM_DBS[logical] = null;
    }
    delete memEnsuring[logical];
    return MEM_DBS[logical];
  })();
  return memEnsuring[logical];
}

function openDb(logical) {
  if (logical in DBS) return DBS[logical];
  const suf = DB_PACKS[logical];
  if (!suf) return (DBS[logical] = null);
  const name = "/" + suf.split("/").pop();
  try {
    /* OpfsSAHPoolDb CREATES an empty db if the file is absent — which would make
       an uninstalled pack look "present" (empty) and stop on-demand install from
       ever firing. Only open when the pool actually holds the file. */
    const names = pool.getFileNames ? pool.getFileNames() : null;
    if (names && names.indexOf(name) < 0) return (DBS[logical] = null);
    const db = new pool.OpfsSAHPoolDb(name);   // opens on the pool's own VFS
    db.exec("SELECT 1 FROM sqlite_master LIMIT 1");
    DBS[logical] = db;
  } catch (e) {
    DBS[logical] = null;             // absent -> null-connection behavior
  }
  return DBS[logical];
}

/* On-demand background install: if a query needs a DB whose pack isn't in OPFS
   yet, fetch+install it (announced via progress events) then open — so clicking
   any source that needs data just works, the app appearing fully functional.
   Each pack is attempted once per session to avoid loops on a genuinely absent
   or failing pack. */
const ensuring = {};   // logical -> Promise
async function ensureDb(logical) {
  const existing = openDb(logical);
  if (existing) return existing;
  const suf = DB_PACKS[logical];
  if (!suf) return null;
  const st = await readState();
  await getManifest().catch(() => null);
  const ent = packEntry(suf);
  if (!ent) return null;                       // no pack published for it
  if (st[suf] && st[suf].sha16 === ent.sha16) return openDb(logical);  // installed, just (re)open
  if (!ensuring[logical]) {
    ensuring[logical] = (async () => {
      postMessage({ ondemand: { rel: suf, phase: "start" } });
      try {
        await installPack(suf, "__ondemand_" + suf);
        postMessage({ ondemand: { rel: suf, phase: "done" } });
      } catch (e) {
        postMessage({ ondemand: { rel: suf, phase: "error", error: String(e && e.message || e) } });
        throw e;
      } finally {
        delete ensuring[logical];
      }
    })();
  }
  try { await ensuring[logical]; } catch (e) { return null; }
  delete DBS[logical];               // clear the cached "absent" so we reopen the real file
  return openDb(logical);
}

async function q(logical, sql, params, opts) {
  let db;
  if (poolOk) {
    db = openDb(logical);
    if (!db && (!opts || opts.ensure !== false)) db = await ensureDb(logical);
  } else {
    db = await ensureDbMem(logical);      // iPhone: query the pack in RAM
  }
  if (!db) return [];
  try {
    const rows = [];
    db.exec({ sql, bind: params || [], rowMode: "array", callback: (r) => { rows.push(r); } });
    return rows;
  } catch (e) {
    return [];                        // OperationalError tolerance, like the desktop
  }
}

async function readPackFile(basename) {
  try {
    const d = await filesDir();
    const fh = await d.getFileHandle(basename);
    return await (await fh.getFile()).text();
  } catch (e) { return null; }
}

/* Install a non-DB pack on demand (e.g. the apocrypha library) if not present. */
const ensuringPack = {};
async function ensurePack(rel) {
  const st = await readState();
  await getManifest().catch(() => null);
  const ent = packEntry(rel);
  if (!ent) return false;
  if (st[rel] && st[rel].sha16 === ent.sha16) return true;
  if (!ensuringPack[rel]) {
    ensuringPack[rel] = (async () => {
      postMessage({ ondemand: { rel, phase: "start" } });
      try { await installPack(rel, "__ondemand_" + rel);
            postMessage({ ondemand: { rel, phase: "done" } }); return true; }
      catch (e) { postMessage({ ondemand: { rel, phase: "error", error: String(e && e.message || e) } }); return false; }
      finally { delete ensuringPack[rel]; }
    })();
  }
  return ensuringPack[rel];
}

async function status() {
  await ready;
  const m = await getManifest().catch(() => null);
  const st = await readState();
  const files = (m ? m.files : []).map((f) => ({
    rel: f.rel, size: f.size, gz_size: f.gz_size,
    installed: !!st[f.rel] && st[f.rel].sha16 === f.sha16,
  }));
  let est = null;
  try { est = await navigator.storage.estimate(); } catch (e) {}
  return {
    files, installed: files.filter((f) => f.installed).length, total: files.length,
    quota: est ? { usage: est.usage, quota: est.quota } : null,
    dbs: Object.fromEntries(Object.keys(DB_PACKS).map((k) => [k, openDb(k) ? "open" : "absent"])),
  };
}

onmessage = async (ev) => {
  const { id, op } = ev.data;
  try {
    await ready;
    let out;
    if (op === "caps") out = { poolOk, sab: typeof SharedArrayBuffer !== "undefined" };
    else if (op === "query") out = await q(ev.data.db, ev.data.sql, ev.data.params, ev.data.opts);
    else if (op === "install") out = await installPack(ev.data.rel, id);
    else if (op === "ensure") out = !!(await ensureDb(ev.data.db));
    else if (op === "ensurepack") out = await ensurePack(ev.data.rel);
    else if (op === "status") out = await status();
    else if (op === "readfile") out = await readPackFile(ev.data.name);
    else if (op === "persist") out = await navigator.storage.persist().catch(() => false);
    else throw new Error("unknown op " + op);
    postMessage({ id, ok: true, out });
  } catch (e) {
    postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
