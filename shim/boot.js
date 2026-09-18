/* YahBible Web — boot shim.
   Loads BEFORE the page's own scripts and monkey-patches window.fetch so every
   same-origin /api/* call the desktop PAGE makes is answered locally: sqlite
   packs in OPFS (via shim/worker.js), build-time static snapshots, or local
   account state. The PAGE itself is byte-identical to the desktop app — it
   never learns the Python server is gone. */
"use strict";
(function () {
  const BASE = new URL(".", document.currentScript.src).href;        // .../yahbible/shim/
  const APPBASE = new URL("..", BASE).href;                          // .../yahbible/
  const realFetch = window.fetch.bind(window);
  /* NATIVE = this shim is running inside the O'Tav'iel desktop server (it sets
     window.YB_NATIVE). Then the Lovable UI + all its layout enhancements run, but
     /api passes straight through to the real Python backend and the OPFS pack
     layer (worker, service worker, pack auto-install) is skipped. */
  const NATIVE = !!window.YB_NATIVE;

  /* ---------- worker RPC ---------- */
  /* sqlite3.js locates its .wasm from the worker URL's sqlite3.dir param */
  const _pb = (typeof window !== "undefined" && window.YB_PACK_BASE) ? "&packbase=" +
    encodeURIComponent(window.YB_PACK_BASE) : "";
  const _pbw = (typeof window !== "undefined" && window.YB_PACK_BASE_WEB) ? "&packbaseweb=" +
    encodeURIComponent(window.YB_PACK_BASE_WEB) : "";
  const worker = NATIVE ? null : new Worker(BASE + "worker.js?sqlite3.dir=" +
    encodeURIComponent((APPBASE + "vendor/sqlite-wasm").replace(/\/$/, "")) + _pb + _pbw);
  let seq = 0;
  const waits = new Map(), progressCbs = new Map();
  if (worker) worker.onmessage = (ev) => {
    const d = ev.data;
    if (d.ondemand) { onDemandToast(d.ondemand); return; }
    if (d.progress) { const cb = progressCbs.get(d.id); if (cb) cb(d.progress); return; }
    const w = waits.get(d.id);
    if (w) { waits.delete(d.id); progressCbs.delete(d.id); d.ok ? w.res(d.out) : w.rej(new Error(d.error)); }
  };

  /* one small toast that tracks any background pack install triggered by a click
     (a non-KJV version, an apocrypha source, the lexicon for a word study …). */
  const PACK_LABEL = {
    "Holorites_data/daeos/taviel_versions.sqlite": "this translation",
    "Holorites_data/daeos/taviel_corpus.sqlite": "the sacred corpus",
    "web/apoc_pack.json": "this source",
    "web/canon_lexicon.sqlite": "the lexicon",
    "web/canon_fill.sqlite": "the full interlinear",
    "Holorites_data/daeos/reflected_red_basic.sqlite": "the lexicon",
  };
  let odEl = null, odTimer = 0;
  function onDemandToast(m) {
    /* In store-mode the OPFS packs can't install (iPhone) — a "getting the
       sacred corpus 0%" toast would hang forever and mislead. Suppress it;
       data comes from the on-demand HTTP store instead. */
    if (typeof STORE_MODE !== "undefined" && STORE_MODE) return;
    const label = PACK_LABEL[m.rel] || (m.rel || "").split("/").pop().replace(/\.(sqlite|db|json)(\.gz)?$/, "");
    if (!odEl) {
      odEl = document.createElement("div");
      odEl.id = "ybw-od";
      odEl.style.cssText = "position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:76;" +
        "background:#141031f2;border:1px solid #c9a86a66;color:#efe6cf;border-radius:12px;" +
        "padding:9px 14px;font:12.5px system-ui,sans-serif;box-shadow:0 6px 30px #000b;max-width:88vw;" +
        "display:flex;align-items:center;gap:9px";
      (document.body || document.documentElement).appendChild(odEl);
    }
    clearTimeout(odTimer);
    if (m.phase === "error") {
      odEl.innerHTML = "Couldn't fetch " + label + " — check your connection and try again.";
      odTimer = setTimeout(() => { odEl && odEl.remove(); odEl = null; }, 6000);
      return;
    }
    if (m.phase === "done") {
      odEl.innerHTML = "✓ Installed " + label + ".";
      odTimer = setTimeout(() => { odEl && odEl.remove(); odEl = null; }, 2500);
      return;
    }
    const pct = m.total ? Math.min(100, Math.round(m.got * 100 / m.total)) : null;
    odEl.innerHTML = "<span class='ybw-spin' style='width:13px;height:13px;border:2px solid #c9a86a55;" +
      "border-top-color:#e8d9ae;border-radius:50%;display:inline-block;animation:ybwspin .8s linear infinite'></span>" +
      "<span>Getting " + label + (pct != null ? " · " + pct + "%" : "…") + "</span>";
    if (!document.getElementById("ybw-spin-kf")) {
      const s = document.createElement("style"); s.id = "ybw-spin-kf";
      s.textContent = "@keyframes ybwspin{to{transform:rotate(360deg)}}";
      (document.head || document.documentElement).appendChild(s);
    }
  }
  function rpc(op, extra, onProgress) {
    if (!worker) return Promise.reject(new Error("no pack worker (native mode)"));
    const id = ++seq;
    if (onProgress) progressCbs.set(id, onProgress);
    return new Promise((res, rej) => { waits.set(id, { res, rej }); worker.postMessage({ id, op, ...extra }); });
  }
  const Q = (db, sql, params) => rpc("query", { db, sql, params });
  window.YBWEB = { rpc, Q, base: APPBASE };   // pack drawer + console access

  /* ---------- tiny helpers (ports of the server's) ---------- */
  const MARKUP = /<RF>[\s\S]*?<Rf>|<TS>[\s\S]*?<Ts>|<[^>]{0,40}>/gi;
  const clean = (t) => (t ? String(t).replace(MARKUP, "").replace(/\s+/g, " ").trim() : t);
  const J = (obj, code) => new Response(JSON.stringify(obj), {
    status: code || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
  async function staticJson(name) {
    const r = await realFetch(APPBASE + "static_api/" + name + ".json");
    return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "application/json" } });
  }
  const STOP = new Set(["the","and","for","are","was","who","how","why","what","does","did",
    "has","have","had","not","but","with","that","this","from","unto","thou","thee","thy",
    "shall","will","when","then","they","them","there","their","which","were","been","him",
    "his","her","she","you","your","our","out","into","upon","also","all","any","can","may"]);

  /* ---------- account/local state (mirrors desktop semantics, browser-local) ---------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("ybw_" + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { localStorage.setItem("ybw_" + k, JSON.stringify(v)); },
  };
  function curUser() { return LS.get("session", null); }
  async function pwHash(pwd, salt) {
    const data = new TextEncoder().encode(salt + " " + pwd);
    const h = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- scripture core (ports of o_taviel_server.py) ---------- */
  async function booksList() {
    return (await Q("watchman", "SELECT DISTINCT book FROM verses ORDER BY book_order")).map((r) => r[0]);
  }
  async function versionLangs() {
    const langs = { KJV: "English" };
    for (const [v, l] of await Q("versions", "SELECT version,language FROM versions_meta"))
      langs[v] = l || "Other";
    return langs;
  }
  async function chapter(book, ch, version) {
    if (STORE_MODE) {                       // iPhone: read from the per-book store
      const d = await storeChapter(book, ch, version || "KJV");
      if (d && d.verses && d.verses.length) return d;
    }
    if (version && version !== "KJV") {
      const rows = await Q("versions",
        "SELECT verse,text FROM verses WHERE version=? AND book=? AND chapter=? ORDER BY verse",
        [version, book, ch]);
      if (rows.length)
        return { cite: version + " — " + book + " " + ch,
                 verses: rows.map((r) => ({ verse: r[0], text: clean(r[1]) })) };
    }
    const rows = await Q("watchman",
      "SELECT verse,text FROM verses WHERE book=? AND chapter=? ORDER BY verse", [book, ch]);
    return { cite: "King James Version &middot; " + book + " " + ch,
             verses: rows.map((r) => ({ verse: r[0], text: r[1] })) };
  }
  async function searchVerbatim(qs, cap) {
    const esc = '"' + qs.replace(/"/g, " ") + '"';
    let rows = await Q("watchman",
      "SELECT v.book||' '||v.chapter||':'||v.verse, v.text FROM verses_fts f" +
      " JOIN verses v ON v.id=f.rowid WHERE verses_fts MATCH ? LIMIT ?", [esc, cap]);
    if (!rows.length)                       // FTS5 absent / no match → plain LIKE fallback
      rows = await Q("watchman",
        "SELECT book||' '||chapter||':'||verse, text FROM verses WHERE text LIKE ? LIMIT ?",
        ["%" + qs + "%", cap]);
    return rows;
  }
  const mkHit = (ref, text) => {
    const i = ref.lastIndexOf(" ");
    const cv = ref.slice(i + 1).split(":");
    return { ref, book: ref.slice(0, i), chapter: +cv[0], verse: +(cv[1] || 1), text };
  };
  /* ---------- robust Scripture reference parsing ----------
     Finds book + chapter + verse in ANY order, with ANY separators, tolerating
     abbreviations and misspellings:
       "matt 6 11" · "6 11 matt" · "6:11 matt" · "matthew 6 .11" · "1 jn 3.16" ·
       "psalm 23" · "jhn 3 16" · "revalation 21 4"  → all resolve. */
  function _lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    const d = []; for (let j = 0; j <= n; j++) d[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return d[n];
  }
  const _nb = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const _ABBR = {
    "genesis": ["gen", "ge", "gn"], "exodus": ["ex", "exo", "exod", "exd"],
    "leviticus": ["lev", "le", "lv", "levit"], "numbers": ["num", "nu", "nm", "nb", "numb"],
    "deuteronomy": ["deut", "dt", "deu", "deute"], "joshua": ["josh", "jos", "jsh"],
    "judges": ["judg", "jdg", "jgs", "jdgs"], "ruth": ["rth", "rut", "ru"],
    "1 samuel": ["1sam", "1sa", "1sm", "1s", "firstsamuel", "isamuel", "1samuel"],
    "2 samuel": ["2sam", "2sa", "2sm", "2s", "secondsamuel", "iisamuel", "2samuel"],
    "1 kings": ["1kings", "1ki", "1kgs", "1kg", "1k", "firstkings", "1kin"],
    "2 kings": ["2kings", "2ki", "2kgs", "2kg", "2k", "secondkings", "2kin"],
    "1 chronicles": ["1chron", "1chr", "1ch", "1chronicles", "firstchronicles"],
    "2 chronicles": ["2chron", "2chr", "2ch", "2chronicles", "secondchronicles"],
    "ezra": ["ezr", "ezra"], "nehemiah": ["neh", "ne", "nehem"],
    "esther": ["esth", "est", "es", "ester"], "job": ["job", "jb"],
    "psalms": ["ps", "psa", "psalm", "pss", "psm", "pslm", "psalms"],
    "proverbs": ["prov", "pro", "prv", "proverb"],
    "ecclesiastes": ["eccl", "ecc", "eccles", "qoh", "eccles"],
    "song of solomon": ["song", "sos", "ss", "songofsolomon", "songofsongs", "canticles", "cant"],
    "isaiah": ["isa", "isai", "isah", "isaia"], "jeremiah": ["jer", "jere", "jr"],
    "lamentations": ["lam", "lament", "lamen"], "ezekiel": ["ezek", "eze", "ezk", "ezke"],
    "daniel": ["dan", "dn", "dnl", "danl"], "hosea": ["hos", "hsa", "hose"],
    "joel": ["joe", "jl", "joel"], "amos": ["amo", "amos"],
    "obadiah": ["obad", "oba", "obd", "obadia"], "jonah": ["jon", "jnh", "jona"],
    "micah": ["mic", "mica", "mch"], "nahum": ["nah", "nam", "nahu"],
    "habakkuk": ["hab", "habk", "haba"], "zephaniah": ["zeph", "zep", "zphan", "zephan"],
    "haggai": ["hag", "hagg", "hagai"], "zechariah": ["zech", "zec", "zach", "zechar"],
    "malachi": ["mal", "mala", "malac"],
    "matthew": ["matt", "mt", "mat", "matth", "mtt", "mathew"], "mark": ["mrk", "mk", "mar"],
    "luke": ["luk", "lk", "luke"], "john": ["jhn", "jn", "joh", "john"],
    "acts": ["act", "ac", "acts"], "romans": ["rom", "rm", "roman", "romns"],
    "1 corinthians": ["1cor", "1co", "1c", "firstcorinthians", "1corinth", "1corinthians"],
    "2 corinthians": ["2cor", "2co", "2c", "secondcorinthians", "2corinth", "2corinthians"],
    "galatians": ["gal", "gl", "galat"], "ephesians": ["eph", "ephes", "ephs"],
    "philippians": ["phil", "php", "philip", "phlp", "philipp"], "colossians": ["col", "cl", "coloss"],
    "1 thessalonians": ["1thess", "1th", "1thes", "firstthess", "1thessalonians"],
    "2 thessalonians": ["2thess", "2th", "2thes", "secondthess", "2thessalonians"],
    "1 timothy": ["1tim", "1ti", "1tm", "firsttimothy", "1timothy"],
    "2 timothy": ["2tim", "2ti", "2tm", "secondtimothy", "2timothy"],
    "titus": ["tit", "tts", "titu"], "philemon": ["philem", "phm", "phlm", "phile", "philemn"],
    "hebrews": ["heb", "hebr", "hebrew"], "james": ["jas", "jam", "jms", "jame"],
    "1 peter": ["1pet", "1pe", "1pt", "1p", "firstpeter", "1peter"],
    "2 peter": ["2pet", "2pe", "2pt", "2p", "secondpeter", "2peter"],
    "1 john": ["1john", "1jn", "1jo", "1j", "firstjohn", "1jhn"],
    "2 john": ["2john", "2jn", "2jo", "2j", "secondjohn", "2jhn"],
    "3 john": ["3john", "3jn", "3jo", "3j", "thirdjohn", "3jhn"],
    "jude": ["jud", "jd", "jude"],
    "revelation": ["rev", "rv", "revelation", "apocalypse", "apoc", "revel", "revalation"]
  };
  let _ALIAS = null;
  async function _aliasMap() {
    if (_ALIAS) return _ALIAS;
    let names = [];
    try { names = STORE_MODE ? (((await storeCatalog()) || {}).books || []).map((b) => b.name)
                             : await booksList(); } catch (e) { names = []; }
    if (!names.length) { try { names = await booksList(); } catch (e) { names = []; } }
    const M = new Map();
    const add = (a, canon) => { const k = _nb(a); if (k && !M.has(k)) M.set(k, canon); };
    names.forEach((n) => add(n, n));
    const find = (want) => names.find((n) => _nb(n) === _nb(want)) ||
                           names.find((n) => _nb(n).startsWith(_nb(want))) || null;
    for (const canonWant in _ABBR) {
      const canon = find(canonWant); if (!canon) continue;
      add(canonWant, canon); _ABBR[canonWant].forEach((a) => add(a, canon));
    }
    _ALIAS = { map: M, names };
    return _ALIAS;
  }
  async function resolveBook(cand) {
    if (!cand) return null;
    const A = await _aliasMap(); const M = A.map;
    const c = String(cand).toLowerCase().trim()
      .replace(/\b(first|1st|i)\b/g, "1").replace(/\b(second|2nd|ii)\b/g, "2")
      .replace(/\b(third|3rd|iii)\b/g, "3");
    const key = _nb(c); if (!key) return null;
    if (M.has(key)) return M.get(key);                       // exact name / abbreviation
    const pre = [...new Set([...M].filter(([k]) => key.length >= 3 && k.startsWith(key))
      .map(([, v]) => v))];
    if (pre.length === 1) return pre[0];                     // unambiguous prefix
    if (key.length >= 4) {                                   // fuzzy — misspellings
      let best = null, bd = 3;
      for (const [k, v] of M) {
        if (Math.abs(k.length - key.length) > 2) continue;
        const d = _lev(key, k); if (d < bd) { bd = d; best = v; }
      }
      if (best && bd <= (key.length <= 6 ? 1 : 2)) return best;
    }
    return null;
  }
  window.YBresolveBook = resolveBook;
  async function parseRef(raw) {
    if (!raw) return null;
    const s = String(raw).toLowerCase().trim()
      .replace(/(\d)\s*[.:]\s*(\d)/g, "$1:$2")               // "6 .11" / "6.11" / "6 : 11" -> "6:11"
      .replace(/[^a-z0-9: ]+/g, " ").replace(/\s+/g, " ").trim(); // any other punctuation -> space
    if (!s) return null;
    const seq = [];
    s.split(" ").forEach((t) => {
      let m;
      if ((m = t.match(/^(\d+):(\d+)$/))) seq.push({ k: "cv", c: +m[1], v: +m[2] });
      else if (/^\d+$/.test(t)) seq.push({ k: "n", val: +t });
      else if (/[a-z]/.test(t)) seq.push({ k: "w", t: t.replace(/[^a-z0-9]/g, "") });
    });
    if (!seq.some((x) => x.k === "w")) return null;          // no book candidate
    let best = null;
    for (let i = 0; i < seq.length && !best; i++) {
      if (seq[i].k !== "w") continue;
      const run = []; let j = i; for (; j < seq.length && seq[j].k === "w"; j++) run.push(seq[j].t);
      for (let take = run.length; take >= 1 && !best; take--) {
        const cand = run.slice(0, take).join(" ");
        const before = seq[i - 1];
        const tries = [];
        if (before && before.k === "n" && before.val >= 1 && before.val <= 3)
          tries.push([before.val + " " + cand, i - 1]);     // numbered book: "1 john"
        tries.push([cand, -1]);
        for (const [c, ni] of tries) {
          const b = await resolveBook(c);                   // eslint-disable-line no-await-in-loop
          if (b) { best = { book: b, wordStart: i, wordEnd: i + take - 1, numIdx: ni }; break; }
        }
      }
    }
    if (!best) return null;
    let chapter = null, verse = null;
    const cv = seq.find((x) => x.k === "cv");
    if (cv) { chapter = cv.c; verse = cv.v; }
    else {
      const nums = []; seq.forEach((x, idx) => { if (x.k === "n" && idx !== best.numIdx) nums.push(x.val); });
      if (nums.length >= 1) chapter = nums[0];
      if (nums.length >= 2) verse = nums[1];
    }
    const terms = seq.filter((x, idx) => x.k === "w" && (idx < best.wordStart || idx > best.wordEnd))
      .map((x) => x.t).join(" ").trim();
    return { book: best.book, chapter, verse, terms, whole: chapter == null && !terms };
  }
  window.YBparseRef = parseRef;
  async function detectBook(q0) {
    const ql = (q0 || "").trim(); if (!ql) return [null, q0];
    const whole = await resolveBook(ql);                    // the whole query IS a book
    if (whole) return [whole, ""];
    const parts = ql.split(/\s+/);                          // else a book at the start or end
    for (let take = Math.min(3, parts.length); take >= 1; take--) {
      const head = parts.slice(0, take).join(" ");
      const tail = parts.slice(parts.length - take).join(" ");
      const hb = await resolveBook(head); if (hb) return [hb, parts.slice(take).join(" ").trim()];
      const tb = await resolveBook(tail);
      if (tb) return [tb, parts.slice(0, parts.length - take).join(" ").trim()];
    }
    return [null, q0];
  }
  /* iPhone search: watchman's FTS index doesn't load in-memory, so resolve a
     reference or a book name straight from the per-book store (the common case:
     "John 3:16", "Psalm 23", "John"). */
  async function storeSearch(q0, limit) {
    const cat = await storeCatalog(); if (!cat) return null;
    const q = (q0 || "").trim(); const ql = q.toLowerCase();
    let book = null, rest = q;
    for (const b of (cat.books || []).map((x) => x.name).sort((a, b) => b.length - a.length)) {
      if (ql.startsWith(b.toLowerCase())) { book = b; rest = q.slice(b.length).trim(); break; }
    }
    if (!book) return null;                 // not a reference — fall through to the word search
    const cm = rest.match(/^(\d+)?\s*(?::\s*(\d+))?/);
    const chp = cm && cm[1] ? +cm[1] : 1, vrs = cm && cm[2] ? +cm[2] : null;
    const cd = await storeChapter(book, chp, "KJV");
    let verses = (cd && cd.verses) || [];
    if (vrs) verses = verses.filter((v) => +v.verse === vrs);
    return { hits: verses.slice(0, limit).map((v) => ({ ref: book + " " + chp + ":" + v.verse,
               book, chapter: chp, verse: v.verse, text: v.text })),
             cite: "King James Version &middot; " + book + " " + chp };
  }
  async function search(q0, limit) {
    limit = limit || 40;
    // robust reference first: "matt 6 11", "6 11 matt", "6:11 matt", "matthew 6 .11",
    // "1 jn 3.16", "psalm 23", "jhn 3 16", "revalation 21 4" — any order/spelling.
    const ref = await parseRef(q0);
    if (ref && ref.book && (ref.chapter != null || ref.whole)) {
      const ch = ref.chapter || 1;
      const cd = await chapter(ref.book, ch, "KJV");        // STORE-aware (iPhone reads the store)
      let verses = (cd && cd.verses) || [];
      if (ref.verse != null) {                              // the requested verse leads; chapter follows
        const hit = verses.filter((v) => +v.verse === ref.verse);
        verses = hit.concat(verses.filter((v) => +v.verse !== ref.verse));
      }
      if (verses.length)
        return { hits: verses.slice(0, limit).map((v) => ({
                   ref: ref.book + " " + ch + ":" + v.verse, book: ref.book, chapter: ch,
                   verse: v.verse, text: v.text })),
                 cite: "King James Version &middot; " + ref.book + " " + ch +
                   (ref.verse != null ? ":" + ref.verse
                     : (ref.whole ? " (add a word to search within " + ref.book + ")" : "")) };
    }
    if (STORE_MODE) { const s = await storeSearch(q0, limit); if (s && s.hits.length) return s; }
    let [bookf, q1] = await detectBook((q0 || "").trim());
    const hits = [], seen = new Set();
    if (bookf && !q1) {
      const ch1 = await chapter(bookf, 1, "KJV");
      return { hits: ch1.verses.slice(0, limit).map((v) => ({
                 ref: bookf + " 1:" + v.verse, book: bookf, chapter: 1, verse: v.verse, text: v.text })),
               cite: bookf + " 1 (add a word to search within " + bookf + ")" };
    }
    const cap = bookf ? 400 : limit;
    for (const [ref, text] of await searchVerbatim(q1, cap))
      if (!seen.has(ref)) { hits.push(mkHit(ref, text)); seen.add(ref); }
    if (hits.length < 3) {
      const words = (q1.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w));
      const score = {}, texts = {}, matched = {};
      for (const w of words.slice(0, 8)) {
        const hw = await searchVerbatim(w, 500);
        if (!hw.length) continue;
        const weight = 1.0 / (1.0 + Math.log(1 + hw.length));
        for (const [ref, text] of hw) {
          score[ref] = (score[ref] || 0) + weight;
          matched[ref] = (matched[ref] || 0) + 1;
          texts[ref] = text;
        }
      }
      const ranked = Object.keys(score).sort((a, b) =>
        (score[b] - score[a]) || ((matched[b] || 0) - (matched[a] || 0)));
      for (const ref of ranked) {
        if (!seen.has(ref)) { hits.push(mkHit(ref, texts[ref])); seen.add(ref); }
        if (hits.length >= cap) break;
      }
    }
    const out = bookf ? hits.filter((h) => h.book === bookf) : hits;
    const cite = bookf ? "King James Version &middot; within " + bookf : "King James Version";
    return { hits: out.slice(0, limit), cite };
  }
  async function verseVersions(book, ch, verse) {
    const langs = await versionLangs();
    const out = [];
    const r = await Q("watchman",
      "SELECT text FROM verses WHERE book=? AND chapter=? AND verse=?", [book, ch, verse]);
    if (r.length) out.push({ version: "KJV", text: r[0][0], language: "English" });
    for (const [ver, txt] of await Q("versions",
      "SELECT version,text FROM verses WHERE book=? AND chapter=? AND verse=? ORDER BY version",
      [book, ch, verse]))
      out.push({ version: ver, text: clean(txt), language: langs[ver] || "Other" });
    return { ref: book + " " + ch + ":" + verse, versions: out };
  }

  /* ---------- iOS / no-OPFS on-demand Scripture store ----------
     iPhone Safari can't run the OPFS pack layer (no working SyncAccessHandle),
     so nothing data-backed loads there. Fallback: fetch the SAME desktop data,
     sliced into small per-chapter files, over plain HTTP — hosted wherever
     STORE_BASE points (HuggingFace by default; a same-origin dir for tests).
     When a chapter is read, the next few are prefetched in the background so
     paging through a book is instant and nobody ever downloads the whole 1GB. */
  const STORE_BASE = (typeof window !== "undefined" && window.YB_STORE_BASE) ||
    "https://huggingface.co/OhBeOneKeyNoBe/YahBible-Mobile/resolve/main/scripture/";
  let STORE_MODE = false;
  let _cat = null, _catP = null;
  const _slug = (s) => String(s == null ? "" : s).toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
  function storeCatalog() {
    if (_catP) return _catP;
    _catP = realFetch(STORE_BASE + "catalog.json").then((r) => r.json()).then((c) => {
      c._vid = {}; (c.versions || []).forEach((v) => { c._vid[v.name] = v.id; });
      c._book = {}; (c.books || []).forEach((b) => { c._book[b.name] = b; });
      _cat = c; return c;
    }).catch(() => null);
    return _catP;
  }
  /* Data is bundled per BOOK: one fetch on book-select brings every chapter, so
     paging is instant and nobody downloads more than the book being read.
     Book bundle shape: { chapters: { "<n>": {cite, verses:[...]} } }. */
  const _bookCache = new Map();       // "vid/bslug" -> Promise<bundle|null>
  function storeBook(vid, bslug) {
    const key = vid + "/" + bslug;
    if (_bookCache.has(key)) return _bookCache.get(key);
    const p = realFetch(STORE_BASE + "ch/" + vid + "/" + bslug + ".json")
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    _bookCache.set(key, p);
    return p;
  }
  async function storePrefetch(book, version) {   // warm the whole book in the background
    try {
      const c = await storeCatalog(); if (!c) return;
      const b = c._book[book]; if (!b) return;
      storeBook(c._vid[version] || c._vid.KJV || "v0", b.slug);
    } catch (e) {}
  }
  async function storeChapter(book, ch, version) {
    const c = await storeCatalog(); if (!c) return { cite: "", verses: [] };
    const vid = c._vid[version] || c._vid.KJV || "v0";
    const b = c._book[book]; const bslug = b ? b.slug : _slug(book);
    const bundle = await storeBook(vid, bslug);
    const cd = bundle && bundle.chapters && bundle.chapters[ch];
    return cd || { cite: "", verses: [] };
  }
  async function storeVerseVersions(book, ch, verse) {
    const ref = book + " " + ch + ":" + verse;
    const c = await storeCatalog(); if (!c) return { ref, versions: [] };
    const b = c._book[book]; const bslug = b ? b.slug : _slug(book);
    /* Pivot one verse across a curated set of version book-bundles (the primary
       English translations) plus any bundles already cached from reading — each
       bundle is fetched once and reused, so the compare panel works without a
       separate half-GB per-chapter compare store. */
    const primary = (c.versions || []).slice(0, 12).map((v) => v.name);
    const cachedNames = (c.versions || [])
      .filter((v) => _bookCache.has(v.id + "/" + bslug)).map((v) => v.name);
    const names = Array.from(new Set(primary.concat(cachedNames)));
    const out = [];
    await Promise.all(names.map(async (name) => {
      const vid = c._vid[name]; if (!vid) return;
      const bundle = await storeBook(vid, bslug);
      const cd = bundle && bundle.chapters && bundle.chapters[ch]; if (!cd) return;
      const row = (cd.verses || []).find((x) => +x.verse === +verse); if (!row) return;
      out.push({ version: name, text: row.text, language: "English" });
    }));
    return { ref, versions: out };
  }
  function isIOS() {
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) ||
             (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);  // iPadOS reports as Mac
    } catch (e) { return false; }
  }
  async function detectStoreMode() {
    if (NATIVE) return false;
    /* iOS home-screen web apps get a small, SEPARATE storage quota that cannot hold
       the multi-hundred-MB sqlite packs (taviel_versions alone is ~1GB): OPFS installs
       fine but the pack import blows the quota, so chapters/versions/interlinear never
       load — while Torah (served from the light per-book store) still does. The store
       needs no big download and is the intended iPhone path, so force it on iOS
       regardless of whether OPFS reports as available. */
    if (isIOS()) return true;
    try {
      const caps = await Promise.race([
        rpc("caps", {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error("caps timeout")), 5000)),
      ]);
      return !(caps && caps.poolOk);
    } catch (e) { return true; }                              // worker dead / silent → use the store
  }
  const storeReady = detectStoreMode().then((m) => {
    STORE_MODE = m;
    if (m) { try { console.info("YahBible: OPFS unavailable — using the on-demand Scripture store", STORE_BASE); } catch (e) {} }
    return m;
  });
  /* apocrypha over the same store: per-source books list + per-book bundles */
  const _apocBook = new Map();            // "sidslug/bookslug" -> Promise<bundle|null>
  async function storeApocBooks(sid) {
    try {
      const r = await realFetch(STORE_BASE + "apoc/" + _slug(sid) + "/books.json");
      if (r.ok) return await r.json();
    } catch (e) {}
    return { title: "", books: [] };
  }
  function storeApocBook(sidslug, bslug) {
    const key = sidslug + "/" + bslug;
    if (_apocBook.has(key)) return _apocBook.get(key);
    const p = realFetch(STORE_BASE + "apoc/" + sidslug + "/" + bslug + ".json")
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    _apocBook.set(key, p);
    return p;
  }
  async function storeApocChapter(sid, book, ch) {
    const bundle = await storeApocBook(_slug(sid), _slug(book));
    const cd = bundle && bundle.chapters && bundle.chapters[ch];
    return cd || null;
  }
  const _apocOrig = new Map();           // "sidslug/bookslug" -> Promise<bundle|null>
  function _storeApocOrigBook(sidslug, bslug) {
    const key = sidslug + "/" + bslug;
    if (_apocOrig.has(key)) return _apocOrig.get(key);
    const p = realFetch(STORE_BASE + "apoc/" + sidslug + "/" + bslug + ".orig.json")
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    _apocOrig.set(key, p);
    return p;
  }
  async function storeApocChapterOrig(sid, book, ch) {   // pure-Hebrew variant
    const bundle = await _storeApocOrigBook(_slug(sid), _slug(book));
    const cd = bundle && bundle.chapters && bundle.chapters[ch];
    return cd || null;
  }
  window.YBSTORE = { base: STORE_BASE, catalog: storeCatalog, chapter: storeChapter,
    verseVersions: storeVerseVersions, apocBooks: storeApocBooks, apocChapter: storeApocChapter,
    apocChapterOrig: storeApocChapterOrig,
    get mode() { return STORE_MODE; }, ready: () => storeReady };

  /* Tav'iel opens its OWN chat page (rendered into the reader) — it should not
     also pop the header search bar open, which read as "clicking Tav'iel modifies
     the header". Re-bind the button to just open the chat. */
  setInterval(function () {
    var tb = document.getElementById("tavielbtn");
    if (tb && !tb.__ybchatfix) {
      tb.__ybchatfix = 1;
      /* let the page's own handler open the chat page, then just close the header
         search it also pops (that was "clicking Tav'iel modifies the header"). */
      tb.addEventListener("click", function () {
        setTimeout(function () { var sw = document.getElementById("searchwrap"); if (sw) sw.classList.remove("on"); }, 40);
      });
    }
  }, 1000);

  /* ---------- router ---------- */
  const H = {};   // handlers by path; extended by handlers_study.js / taviel.js / vault.js
  window.YBH = H;

  H["/api/menu"] = async () => {
    await storeReady;
    if (STORE_MODE) {
      const c = await storeCatalog();
      if (c) return J({ versions: (c.versions || []).map((v) => v.name),
        books: (c.books || []).map((b) => b.name), apocrypha: c.apocrypha || [] });
    }
    return staticJson("menu");
  };
  H["/api/versions_meta"] = () => staticJson("versions_meta");
  H["/api/languages"] = () => staticJson("languages");
  H["/api/commandments"] = () => staticJson("commandments");
  H["/api/repentance"] = () => staticJson("repentance");
  H["/api/news"] = () => staticJson("news");
  H["/api/gnostic_map"] = () => staticJson("gnostic_map");
  H["/api/bible_lineage"] = () => staticJson("bible_lineage");
  H["/api/status"] = () => staticJson("status");
  H["/api/mobile_status"] = () => J({ connected: false, name: "", ago: null });

  H["/api/chapters"] = async (q) => {
    await storeReady;
    if (STORE_MODE) {
      const c = await storeCatalog(); const b = c && c._book[q.get("book")];
      if (b) storePrefetch(q.get("book"), "KJV");   // background-warm the book on select
      return J({ chapters: b ? (b.chapters || []) : [] });
    }
    return J({ chapters: (await Q("watchman",
      "SELECT DISTINCT chapter FROM verses WHERE book=? ORDER BY chapter", [q.get("book")]))
      .map((r) => r[0]) });
  };
  H["/api/chapter"] = async (q) => {
    await storeReady;
    const book = q.get("book"), ch = +(q.get("chapter") || 1), ver = q.get("version") || "KJV";
    if (STORE_MODE) return J(await storeChapter(book, ch, ver));
    return J(await chapter(book, ch, ver));
  };
  H["/api/verse_versions"] = async (q) => {
    await storeReady;
    const book = q.get("book"), ch = +(q.get("chapter") || 1), verse = +(q.get("verse") || 1);
    if (STORE_MODE) return J(await storeVerseVersions(book, ch, verse));
    return J(await verseVersions(book, ch, verse));
  };
  H["/api/search"] = async (q) => J(await search(q.get("q") || ""));
  H["/api/versions"] = async () => {
    const meta = await (await staticJson("versions_meta")).json();
    return J({ versions: meta.versions.map((v) => v.version) });
  };
  H["/api/redletter_random"] = async () => {
    const rows = await Q("corpus",
      "SELECT ref, text FROM corpus_units WHERE corpus='redletter' ORDER BY RANDOM() LIMIT 1");
    if (rows.length) return J({ ref: rows[0][0], text: rows[0][1] });
    return staticJson("redletter_random");
  };

  /* auth + notes + progress: browser-local base (auth.js overrides with the
     shared RealizeUS Supabase session) */
  H["/api/me"] = () => J(curUser() || { user: null });
  H["/api/guest"] = () => {
    const u = { user: "guest-" + Math.random().toString(36).slice(2, 8), guest: true };
    LS.set("session", u); return J({ ok: true, ...u });
  };
  H["/api/logout"] = () => { LS.set("session", null); return J({ ok: true }); };
  H["/api/check_name"] = (q) => {
    const users = LS.get("users", {});
    const nm = (q.get("name") || "").trim().toLowerCase();
    const em = (q.get("email") || "").trim().toLowerCase();
    return J({ name_taken: !!users[nm],
               email_taken: Object.values(users).some((u) => (u.email || "").toLowerCase() === em && em) });
  };
  H["/api/notes"] = () => {
    const cur = curUser();
    return J({ notes: cur ? LS.get("notes_" + cur.user, {}) : {} });
  };
  H["/api/progress_summary"] = () => {
    const cur = curUser();
    if (!cur) return J({ overall: { read: 0, total: 0, pct: 0 }, sources: [] });
    const read = LS.get("progress_" + cur.user, []);
    const total = 1189;
    return J({ overall: { read: read.length, total, pct: Math.round(read.length * 1000 / total) / 10 },
               sources: [] });
  };
  H["/api/profile"] = () => {
    const cur = curUser();
    if (!cur) return J({ ok: false, error: "not signed in" });
    return J(LS.get("profile_" + cur.user, { ok: true, user: cur.user, avatar: "", bio: "", social: {} }));
  };
  H["/api/profile_public"] = () => staticJson("profile_public");
  H["/api/sessions"] = () => J({ sessions: LS.get("sessions", []) });
  H["/api/conclusions"] = () => J({ conclusions: [] });
  H["/api/usecases"] = () => staticJson("usecases");
  H["/api/gh_sync"] = () => J({ ok: false, error: "vault not configured on web" });
  H["/api/ai_diag"] = async () => {
    const st = await rpc("status", {});
    return J({ web: true, backend: "taviel-web", dbs: st.dbs,
               packs: st.installed + "/" + st.total });
  };

  /* POST bodies arrive as parsed JSON in `body` */
  const P = {};
  window.YBP = P;
  P["/api/signup"] = async (body) => {
    const users = LS.get("users", {});
    const nm = (body.username || "").trim().toLowerCase();
    if (!nm || !body.password) return J({ ok: false, error: "name and password required" });
    if (users[nm]) return J({ ok: false, error: "name taken" });
    const salt = Math.random().toString(36).slice(2);
    users[nm] = { email: body.email || "", salt, hash: await pwHash(body.password, salt) };
    LS.set("users", users);
    LS.set("session", { user: nm });
    return J({ ok: true, user: nm });
  };
  P["/api/login"] = async (body) => {
    const users = LS.get("users", {});
    let nm = (body.username || "").trim().toLowerCase().replace(/^@/, "");
    if (!users[nm]) {
      const byEmail = Object.entries(users)
        .find(([, u]) => (u.email || "").toLowerCase() === nm);
      if (byEmail) nm = byEmail[0];
    }
    const u = users[nm];
    if (!u || (await pwHash(body.password || "", u.salt)) !== u.hash)
      return J({ ok: false, error: "wrong name or password" });
    LS.set("session", { user: nm });
    return J({ ok: true, user: nm });
  };
  P["/api/note"] = (body) => {
    const cur = curUser();
    if (!cur) return J({ ok: false, error: "not signed in" });
    const k = "notes_" + cur.user, notes = LS.get(k, {});
    notes[body.key] = body.body;
    LS.set(k, notes);
    return J({ ok: true });
  };
  P["/api/progress"] = (body) => {
    const cur = curUser();
    if (!cur) return J({ ok: false });
    const k = "progress_" + cur.user, arr = LS.get(k, []);
    if (body.ref && !arr.includes(body.ref)) { arr.push(body.ref); LS.set(k, arr); }
    return J({ ok: true });
  };
  P["/api/change_password"] = async (body) => {
    const cur = curUser();
    const users = LS.get("users", {});
    const u = cur && users[cur.user];
    if (!u) return J({ ok: false, error: "not signed in" });
    if ((await pwHash(body.old || "", u.salt)) !== u.hash) return J({ ok: false, error: "wrong password" });
    u.hash = await pwHash(body.new || "", u.salt);
    LS.set("users", users);
    return J({ ok: true });
  };

  /* /api/speak — no Piper on web: speak with the browser's own voice and hand
     the <audio> element a silent wav so playback logic stays untouched. */
  const SILENT_WAV = Uint8Array.from(atob(
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="), (c) => c.charCodeAt(0));
  H["/api/speak"] = (q) => {
    try {
      const u = new SpeechSynthesisUtterance(q.get("text") || "");
      u.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
    return new Response(SILENT_WAV, { headers: { "Content-Type": "audio/wav" } });
  };

  /* ---------- the fetch patch ---------- */
  window.fetch = async function (input, init) {
    /* native (O'Tav'iel desktop): Scripture data goes to the real Python server,
       BUT auth + user data (login/notes/progress/profile) route through the shared
       RealizeUS Supabase (auth.js) so the desktop app is the SAME account as the
       web/phone and notes + reading progress sync across the whole ecosystem. */
    if (NATIVE) {
      let np = typeof input === "string" ? input : (input && input.url) || "";
      if (np.startsWith(location.origin)) np = np.slice(location.origin.length);
      const NATIVE_SUPA = /^\/api\/(login|signup|logout|me|profile|set_handle|check_name|change_password|note|notes|progress|progress_summary)(\?|$|\/)/;
      if (!NATIVE_SUPA.test(np)) return realFetch(input, init);
      /* else fall through to the shim's Supabase handlers below */
    }
    let url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.startsWith(location.origin)) url = url.slice(location.origin.length);
    if (!(url.startsWith("/api/") || url.startsWith("/assets/") || url.startsWith("/cosmos")))
      return realFetch(input, init);
    const u = new URL(url, location.origin);
    const path = u.pathname;
    try {
      if (path.startsWith("/assets/"))
        return realFetch(APPBASE + "assets/" + path.slice(8), init);
      if (path === "/cosmos.html")
        return realFetch(APPBASE + "cosmos.html", init);   // the transparent cosmos
      if (path === "/cosmos_map.png")
        return realFetch(APPBASE + "static_api/cosmos_map.png", init);
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "POST") {
        let body = {};
        try {
          const raw = init && init.body ? init.body : (input && input.body ? await input.text() : "{}");
          body = typeof raw === "string" ? JSON.parse(raw || "{}") : {};
        } catch (e) {}
        const ph = P[path];
        if (ph) return await ph(body, u.searchParams);
        const gh = H[path];                     // some posts mirror get handlers
        if (gh) return await gh(u.searchParams, body);
        return J({ error: "not found" }, 404);
      }
      const h = H[path];
      if (h) return await h(u.searchParams);
      return J({ error: "not found" }, 404);
    } catch (e) {
      return J({ error: (e && e.message || String(e)).slice(0, 160) }, 500);
    }
  };

  /* Mobile web = the hybrid experience. The PAGE's condensed header, 5-tab
     footer, settings takeover, reading-park and chat suite all key off the
     `framed` class the Android shell sets; a phone browser is top-level, so
     set it ourselves on phone widths — BEFORE the page's own body-end script
     builds its UI (body-node observer fires ahead of it). */
  /* Mobile scroll fix that does NOT restructure <body> (an earlier flex/overflow
     approach mispositioned the fixed footer). The desktop layout's mobile rule
     sets .frame{height:auto}, so the reader grows to full content and the page
     leans on window scroll — which fights the fixed footer + iOS toolbar. Here
     we cap the reader itself to the space between the sticky header and the fixed
     footer with position:fixed insets, so #mid is a true internal scroller and
     the header/footer keep their own positioning untouched. Header/footer
     heights are measured live so a taller (wrapped) header still fits. */
  function injectMobileCss() {
    if (document.getElementById("ybw-mobilecss")) return;
    const st = document.createElement("style");
    st.id = "ybw-mobilecss";
    st.textContent =
      /* The advertising banner points at RealizeUS.me — redundant on the web
         edition (which IS RealizeUS), so it is off here. */
      "#comingsoon{display:none!important;}" +
      /* no italics anywhere — italic text reads poorly; keep everything upright */
      "  body *{font-style:normal!important;}" +
      /* Right-menu order — ALL views (desktop/tablet/phone), not just mobile:
         Verse Study (renders the selection) → Repentance → Ten Commandments →
         Profile·Settings·Studio → News & Updates + KJV (bottom-most). #ybtopnav
         and its news/rep row are flattened so every item is an order-able sibling;
         the tools row (.tctools) or our #mrfoot is pushed down with margin-top:auto,
         and News follows below it. */
      "  .col.right #studywrap{display:flex;flex-direction:column;}" +
      "  .col.right #studywrap>#ybtopnav{display:contents;}" +
      "  #ybtopnav .tcnav:not(.tctools){display:contents;}" +
      /* verse study (the word + verse + versions) sits at the TOP; Repentance and
         Tav'iel history drop to the BOTTOM, under the versions. */
      "  .col.right #studywrap>.lbl{order:1;}" +
      "  .col.right #studywrap>#selverse{order:2;}" +   /* selected verse UNDER the 'Verse Study' header */
      "  .col.right #studywrap>#studycard{order:3;}" +
      "  .col.right #studywrap #tc_rep{order:8;}" +
      /* Tav'iel history already lives at the foot of the LEFT menu — drop the
         duplicate from the right menu so Repentance is the last study item,
         directly above Profile / Settings / Studio. */
      "  .col.right #mtavhist{display:none!important;}" +
      /* the footer is now #ybfoot — a direct child of the right column, pinned to
         the bottom and OUTSIDE #studywrap so Settings/Profile can never hide it */
      "  .col.right>#ybfoot{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:12px;}" +
      "  .col.right>#ybfoot .tcnav.tctools,.col.right>#ybfoot #mrfoot{display:flex;flex-direction:row;gap:8px;margin-top:0;}" +
      "  .col.right>#ybfoot #tc_news{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:0;}" +
      "  .col.right>#ybfoot #tc_news .verpick{margin-left:auto;}" +
      "  #ybtopnav .tcnav.tctools{margin-top:0;}" +
      /* When a verse populates the right menu with the other versions below, only
         the version TITLES are holographic; the verse words themselves are plain
         white so they stay readable. */
      "  .verrow .vtext,.verrow .vtext *{color:#fff!important;-webkit-text-fill-color:#fff!important;" +
      "    background:none!important;background-image:none!important;}" +
      /* highlighted/selected word in ANY version = WHITE text in a GOLD RING (never black on a fill) */
      "  .col.right .hl,.col.right .hlk,.col.right .vword.hl,.col.right .vword.sel," +
      "  .verrow .hl,.verrow .vword.hl,.verrow .vword.sel,.vlcrow .hl,.vlcrow .vword.hl{" +
      "    color:#fff!important;-webkit-text-fill-color:#fff!important;background:transparent!important;" +
      "    background-image:none!important;box-shadow:inset 0 0 0 2px hsl(45 92% 55% / .95)!important;" +
      "    border-radius:4px!important;}" +
      "  .verrow .vname{background:linear-gradient(115deg,#c8f6ff,#ffd1f7,#d8c6ff,#c6ffe0,#fff3c4,#c8f6ff)!important;" +
      "    background-size:320% 320%!important;-webkit-background-clip:text!important;background-clip:text!important;" +
      "    -webkit-text-fill-color:transparent!important;color:transparent;}" +
      "  .verrow .vname .verrm{-webkit-text-fill-color:initial!important;color:#e7b7b7!important;background:none!important;}" +
      /* Verse-lock version comparison (.vlcrow): keep the version NAME holographic
         (its chakra colour), but the verse TEXT itself is plain white. */
      "  .vlcrow .vlctext,.vlcrow .vlctext *{color:#fff!important;-webkit-text-fill-color:#fff!important;" +
      "    background:none!important;background-image:none!important;}" +
      "  .vlcrow .vlctext .vword.hl,.vlcrow .vlctext .vword.sel{color:#ffe08a!important;-webkit-text-fill-color:#ffe08a!important;}" +
      /* the alternate-version / interlinear verse words (.vword) inherit a holographic
         gradient from their container — force the version TEXT plain white (the
         version NAME .ilvn/.vlcver/.vname stays holographic). Highlighted matches
         keep a readable gold. */
      "  .vword{color:#fff!important;-webkit-text-fill-color:#fff!important;}" +
      "  .vword.hl,.vword.sel{color:#2a1533!important;-webkit-text-fill-color:#2a1533!important;}" +
      /* aleph + tav sit TOGETHER (no gap between the two letters) in front of
         YahBible — on desktop, tablet and phone. */
      "  #homebtn .mheb{margin:0!important;letter-spacing:0!important;}" +
      "  #homebtn .mheb + .mheb{margin-left:-2px!important;}" +
      "  #homebtn .yahbible{margin-left:8px!important;}" +
      /* Commandment teaching: bigger title, readable quotes, and every scripture
         quote coloured by speaker — the words of Christ holographic scarlet (like
         the red-letter words), all other quotes holographic violet. */
      "  .cmdstudy{padding-top:26px!important;}" +
      "  .cmdstudy .cmdno{letter-spacing:.3em!important;margin-bottom:20px!important;}" +
      "  .cmdstudy .cmdttl{font-size:clamp(24px,4.1vw,44px)!important;white-space:nowrap!important;" +
      "    overflow:hidden;text-overflow:ellipsis;max-width:100%;margin-bottom:14px!important;}" +
      "  .cmdstudy .cscr,.cmdstudy .prayerbox{font-size:16.5px!important;}" +
      "  .cmdstudy .cmdfull{font-size:22px!important;}" +
      "  .q-christ,.q-violet{-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;" +
      "    -webkit-text-fill-color:transparent!important;background-size:260% 100%!important;font-weight:600!important;}" +
      "  .q-christ{background-image:linear-gradient(115deg,#ff7a7a,#ffa0b2,#ff5f6f,#ffc4c4,#ff7a7a)!important;}" +
      "  .q-violet{background-image:linear-gradient(115deg,#cdb8ff,#b79cff,#e2d5ff,#ac93ff,#cdb8ff)!important;}" +
      /* Tav'iel chat = its own page: keep a slim header with the name + a back
         button, holographic BLUE boards, translucent so the centre art shows. */
      "  .chatview .chathead{display:flex!important;align-items:center;gap:8px;padding:10px 14px;" +
      "    position:sticky;top:0;z-index:5;background:hsl(212 45% 10% / .82);-webkit-backdrop-filter:blur(6px);" +
      "    backdrop-filter:blur(6px);border-bottom:1px solid hsl(205 80% 66% / .22);}" +
      "  .chatview .chathead .avname{font:700 16px 'EB Garamond',Georgia,serif;color:#cfe6ff;}" +
      "  .chatview .chathead .cback{margin-left:auto;background:hsl(212 45% 18% / .7)!important;" +
      "    border:1px solid hsl(205 80% 66% / .35)!important;color:#cfe6ff!important;border-radius:8px;padding:6px 10px;}" +
      "  .chatbar{background:transparent!important;border-top:none!important;}" +
      "  .chatbar textarea{background:hsl(212 45% 12% / .60)!important;border:1px solid hsl(205 80% 66% / .38)!important;" +
      "    color:#eaf3ff!important;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}" +
      "  .chatbar textarea:focus{border-color:#5aa0ff!important;box-shadow:0 0 0 3px hsl(205 85% 60%/.22)!important;}" +
      "  .chatbar textarea::placeholder{color:#8fb4dd!important;}" +
      "  .chatbar .csend{background:linear-gradient(115deg,#8fe3ff,#5aa0ff,#8fd4ff)!important;color:#0a1730!important;" +
      "    box-shadow:0 0 18px hsl(205 90% 60% / .3)!important;}" +
      /* chat header: a SOLID flush bar, not a floating translucent banner */
      "  .chatview{padding-top:0!important;}" +
      "  .chatview .chathead{background:hsl(212 45% 12%)!important;-webkit-backdrop-filter:none!important;" +
      "    backdrop-filter:none!important;border-radius:0 0 14px 14px;margin:0 0 10px;" +
      "    box-shadow:0 6px 20px hsl(212 60% 5% / .55)!important;}" +
      /* Seek + Ask: two matching buttons beside the input (same type) */
      "  .chatbar{gap:8px!important;align-items:flex-end;}" +
      "  .chatbar .cseek,.chatbar .csend{flex:0 0 auto;background:linear-gradient(115deg,#8fe3ff,#5aa0ff,#8fd4ff)!important;" +
      "    color:#0a1730!important;border:none!important;border-radius:12px;padding:0 18px;min-height:44px;" +
      "    font:700 14px Inter,system-ui;cursor:pointer;display:inline-flex;align-items:center;gap:5px;" +
      "    box-shadow:0 0 18px hsl(205 90% 60% / .3)!important;}" +
      "  .chatbar .cseek:hover,.chatbar .csend:hover{filter:brightness(1.07);}" +
      /* 🧠 Think toggle: dim when off, lit violet when on (deeper reasoning) */
      "  .chatbar .cthink{flex:0 0 auto;min-height:44px;min-width:44px;justify-content:center;border-radius:12px;" +
      "    background:hsl(212 45% 16% / .55)!important;color:#7fa8d6!important;" +
      "    border:1px solid hsl(205 60% 60% / .3)!important;font-size:18px;cursor:pointer;" +
      "    display:inline-flex;align-items:center;padding:0!important;}" +
      "  .chatbar .cthink.on{background:hsl(265 55% 30% / .9)!important;color:#e6d8ff!important;" +
      "    border-color:#b79cff!important;box-shadow:0 0 16px hsl(265 70% 55% / .45)!important;}" +
      /* in-chat search results (a Tav'iel message of tappable verses) */
      "  .msg.you.seekq{opacity:.92;font-size:14px;}" +
      "  .msg.tav .seekcite{font:700 11px Inter,system-ui;letter-spacing:.06em;text-transform:uppercase;" +
      "    color:#8fb4dd;margin-bottom:8px;}" +
      "  .msg.tav .seekhits{display:flex;flex-direction:column;gap:6px;}" +
      "  .msg.tav .seekhit{text-align:left;background:hsl(212 45% 16% / .62)!important;" +
      "    border:1px solid hsl(205 80% 66% / .28)!important;border-radius:10px;padding:8px 11px;color:#eaf3ff;" +
      "    cursor:pointer;display:block;width:100%;}" +
      "  .msg.tav .seekhit:hover{background:hsl(212 52% 22% / .82)!important;border-color:#5aa0ff!important;}" +
      "  .msg.tav .seekhit .ref{display:block;font:700 13px Inter,system-ui;color:#8fd4ff;margin-bottom:2px;}" +
      "  .msg.tav .seekhit .txt{font-size:14px;line-height:1.45;color:#dbe8f7;}" +
      "  .msg.you{background:hsl(212 45% 18% / .70)!important;border:1px solid hsl(205 80% 68% / .35)!important;color:#eaf3ff!important;}" +
      "  .msg.tav .tbody{background:hsl(212 45% 14% / .64)!important;border:1px solid hsl(205 80% 66% / .32)!important;" +
      "    border-left:3px solid #5aa0ff!important;color:#eaf3ff!important;}" +
      "  .msg.tav .tmark{-webkit-text-fill-color:#5aa0ff!important;color:#5aa0ff!important;}" +
      "  .plike{color:#5aa0ff!important;}" +
      "@media (max-width:820px){" +
      /* Lock the page so a short reader can't rubber-band and detach the fixed
         header (the iOS overscroll "pop down then back up"). Only #mid scrolls. */
      "  html{overscroll-behavior:none;}" +
      "  body.framed{overflow:hidden;height:100dvh;height:100vh;overscroll-behavior:none;position:relative;}" +
      /* Header as two columns split down the centre: left = ☰ + (aleph-tav)
         YahBible, right = Tav'iel + ☰. Everything else (add-note, split-view,
         version picker, settings, profile, studio) is hidden from the header and
         reached from the panels/footer, matching the Android hybrid. */
      "  body.framed #topbar #notesplus,body.framed #topbar #splitplus," +
      "  body.framed #topbar #verbtn,body.framed #topbar #verpick," +
      "  body.framed #topbar #cog,body.framed #topbar #profilebtn,body.framed #topbar #ybcambtn," +
      "  body.framed #topbar #studiobtn,body.framed #topbar .ctspacer," +
      "  body.framed #topbar #mobsync{display:none!important;}" +
      /* thinner header, menu buttons kept off the screen edges */
      "  body.framed #topbar{display:flex;align-items:center;gap:0;flex-wrap:nowrap;" +
      "    padding:8px 14px!important;min-height:54px;overflow:hidden;}" +
      "  body.framed #topbar .brandbtn{padding-top:2px;padding-bottom:2px;}" +
      "  body.framed #topbar #mleftbtn{margin-right:4px;}" +
      "  body.framed #topbar #mrightbtn{margin-left:4px;}" +
      /* mobile menu buttons match the desktop shape — squarer, not the rounder look */
      "  body.framed #mnav button{border-radius:6px!important;}" +
      /* aleph + tav sit together in front of YahBible; Tav'iel and its tav match
         YahBible's size */
      "  body.framed #homebtn .mheb{margin:0!important;font-size:16px;}" +
      "  body.framed #homebtn .yahbible{margin-left:6px;}" +
      "  body.framed #tavielbtn .brand,body.framed #tavielbtn .brand em{font-size:22px!important;}" +
      "  body.framed #tavielbtn .mark{font-size:22px!important;margin-right:2px;}" +
      "  body.framed #topbar #mleftbtn{order:0;flex:0 0 auto;}" +
      "  body.framed #topbar #homebtn{order:1;flex:1 1 0;justify-content:center;min-width:0;}" +
      "  body.framed #topbar #tavielbtn{order:2;flex:1 1 0;justify-content:center;min-width:0;}" +
      "  body.framed #topbar #mrightbtn{order:3;flex:0 0 auto;}" +
      "  body.framed #topbar .brandbtn{overflow:hidden;white-space:nowrap;}" +
      /* the reader becomes a real internal scroller between header and footer */
      "  body.framed #mid{position:fixed;left:0;right:0;" +
      "    top:var(--ybtop,48px);bottom:var(--ybbot,58px);" +
      "    overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}" +
      "  body.framed.chatting #mid{bottom:0;}" +
      /* left/right menus: clear the top and footer, breathe from the edges, and
         scroll reliably on touch when a source's chapters expand. */
      "  body.framed .col.left,body.framed .col.right{padding:16px 18px calc(var(--ybbot,52px) + 24px);" +
      "    -webkit-overflow-scrolling:touch;overscroll-behavior:contain;box-sizing:border-box;}" +
      "  body.framed .col.left .chgrid,body.framed .col.right .chgrid{display:flex;flex-wrap:wrap;gap:6px;" +
      "    margin:6px 0 10px;}" +
      "  body.framed .col.left .chgrid .chip,body.framed .col.right .chgrid .chip{min-width:34px;" +
      "    min-height:34px;display:inline-flex;align-items:center;justify-content:center;}" +
      /* trim the empty band between the header and the chapter's forward/back nav */
      "  body.framed #mid .reader{padding-top:2px;}" +
      "  body.framed #mid .reader>*:first-child{margin-top:0!important;}" +
      "}";
    (document.head || document.documentElement).appendChild(st);
  }
  function syncInsets() {
    if (!document.body || !matchMedia("(max-width:820px)").matches) return;
    const hb = document.querySelector("#topbar, .masthead, header");
    const fb = document.querySelector("#mtabbar");
    if (hb) document.body.style.setProperty("--ybtop", Math.round(hb.getBoundingClientRect().height) + "px");
    if (fb) document.body.style.setProperty("--ybbot", Math.round(fb.getBoundingClientRect().height) + "px");
  }
  /* Put both Hebrew letters (aleph + tav = alpha & omega) in FRONT of YahBible:
     the brand renders א YahBible ת by default; move the trailing ת before it. */
  function reorderBrand() {
    const hb = document.querySelector("#homebtn");
    if (!hb || hb.dataset.ybreordered) return;
    const glyphs = hb.querySelectorAll(".mheb");
    const yb = hb.querySelector(".yahbible");
    if (glyphs.length >= 2 && yb) {
      hb.insertBefore(glyphs[glyphs.length - 1], yb);   // ת -> before YahBible
      hb.dataset.ybreordered = "1";
    }
  }
  function mobilize() {
    /* framed = phone layout. It must also be REMOVED when the window grows back
       to desktop, otherwise the desktop study-panel X keeps the drawer-close
       behaviour and appears dead. The Android shell marks itself so its own
       framed state is never touched. */
    if (document.body && !document.body.dataset.ybshell) {
      if (matchMedia("(max-width:820px)").matches) document.body.classList.add("framed");
      else document.body.classList.remove("framed");
    }
    injectMobileCss();
    syncInsets();
    reorderBrand();
  }
  /* Move the Tav'iel history out of the right menu and into the bottom of the
     LEFT menu, per the desktop-android layout. */
  function moveTavHistLeft() {
    const h = document.querySelector("#mtavhist");
    const left = document.querySelector(".col.left");
    if (h && left && !left.contains(h)) left.appendChild(h);
  }
  /* On phones the study-panel X (#rightx) must simply close the drawer. The page
     binds it to toggleRightPanel (a desktop column resize) which, in drawer mode,
     just toggles a collapsed class back and forth — the "fake/augmented, won't
     shut" behavior. Rebind it directly so that resize never runs, and clear any
     collapsed state so the next open is clean. */
  function rebindCloseX() {
    const framed = document.body && document.body.classList.contains("framed");
    const x = document.querySelector("#rightx");
    if (x) {
      if (framed && x.dataset.ybclose !== "1") {
        x.dataset.ybclose = "1";
        x.onclick = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const f = document.querySelector(".frame");
          if (f) f.classList.remove("mright", "rightcollapsed", "leftcollapsed");
        };
      } else if (!framed && x.dataset.ybclose === "1") {
        delete x.dataset.ybclose;          // restore the desktop collapse handler
        x.onclick = (ev) => {
          ev.preventDefault();
          if (window.toggleRightPanel) return window.toggleRightPanel();
          const f = document.querySelector(".frame");
          if (f) f.classList.toggle("rightcollapsed");
        };
      }
    }
  }
  /* Gnostic/prose works are single-chapter: expanding one showed a lone,
     redundant "1" chip. Hide any single-chapter chip grid in the menus — the
     work opens directly when its row is tapped (its own onOpen navigates). And
     wrap openApocChapter so opening a work also closes the left drawer. */
  function tidySingleChapter() {
    document.querySelectorAll(".col.left .chgrid, .col.right .chgrid").forEach((g) => {
      const chips = g.querySelectorAll(".chip");
      g.style.display = (chips.length === 1 && chips[0].textContent.trim() === "1") ? "none" : "";
    });
  }
  /* Wrap the gnostic destinations: opening the Lineage or Map from the left menu
     closes the left drawer (it is the final load), and clicking a node/character
     opens the RIGHT menu with that thing's details. openApocChapter is NOT wrapped
     to auto-close any more — expanding a source (e.g. 1 Enoch) must stay open until
     an actual chapter is chosen; the close then happens on the chapter tap. */
  function closeLeftSoon() {
    if (!isMobileUI()) return;
    const f = document.querySelector(".frame");
    if (f) setTimeout(() => f.classList.remove("mleft"), 120);
  }
  function openRightSoon() {
    if (!isMobileUI()) return;
    const f = document.querySelector(".frame");
    if (f) { f.classList.add("mright"); f.classList.remove("mleft"); }
  }
  function wrapNav() {
    ["openGnosticLineage", "openGnosticMap"].forEach((name) => {
      const fn = window[name];
      if (fn && !fn._ybw) {
        const w = function () { const r = fn.apply(this, arguments); closeLeftSoon(); return r; };
        w._ybw = true; window[name] = w;
      }
    });
    const sn = window.showGnosticNode;
    if (sn && !sn._ybw) {
      const w = function () { const r = sn.apply(this, arguments); openRightSoon(); return r; };
      w._ybw = true; window.showGnosticNode = w;
    }
  }
  /* The page's relocator often fails to build the right-menu footer (it runs
     before the right menu's content exists), leaving Profile/Settings/Studio
     stranded in the header. Build #mrfoot deterministically inside #studywrap
     (so the CSS order applies), moving those three controls in, and dock the KJV
     picker beside News. Idempotent — re-applied each tick, survives re-renders. */
  const RM_FOOT = [["profilebtn", "Profile"], ["cog", "Settings"], ["studiobtn", "Studio Mode"]];
  /* Build the right-menu footer (Profile·Settings·Studio + News & Updates + KJV)
     as a persistent #ybfoot that is a DIRECT CHILD of the right column, pinned to
     the bottom — NOT inside #studywrap. #studywrap is hidden wholesale when the
     Settings panel or a profile opens (_sideHide), so anything inside it vanishes;
     keeping the footer outside it means it is always present, at the bottom, on
     every right-menu page. Idempotent — re-applied each tick. */
  function buildRightMenu() {
    const rc = document.querySelector(".col.right");
    if (!rc || !rc.querySelector("#studywrap")) return;
    /* the right column becomes a flex column so margin-top:auto pins the footer */
    if (getComputedStyle(rc).display !== "flex") {
      rc.style.display = "flex"; rc.style.flexDirection = "column"; rc.style.minHeight = "0";
    }
    let foot = rc.querySelector("#ybfoot");
    if (!foot) { foot = document.createElement("div"); foot.id = "ybfoot"; rc.appendChild(foot); }
    else if (foot !== rc.lastElementChild) rc.appendChild(foot);   // keep it last
    /* tools row: prefer the page's own (.tctools = tc_profile/tc_settings/tc_studio),
       else build one from the header controls. */
    /* de-duplicate: renderTopNav recreates .tctools / #tc_news on every nav (e.g.
       clicking News), so keep exactly one of each — the copy already in the footer —
       and remove the rest, or they stack up. */
    const allTools = [].slice.call(document.querySelectorAll(".col.right .tcnav.tctools"));
    const pageTools = allTools.filter((e) => e.closest("#ybfoot"))[0] || allTools[allTools.length - 1] || null;
    allTools.forEach((e) => { if (e !== pageTools) e.remove(); });
    if (pageTools) {
      if (pageTools.parentNode !== foot) foot.insertBefore(pageTools, foot.firstChild);
      /* drop a duplicate #mrfoot built on an earlier tick before .tctools rendered,
         returning the header controls it borrowed so the desktop header keeps them */
      const stale = document.getElementById("mrfoot");
      if (stale) {
        const tb = document.getElementById("topbar");
        ["profilebtn", "cog", "studiobtn"].forEach((id) => {
          const n = document.getElementById(id);
          if (n && stale.contains(n) && tb) tb.appendChild(n);
        });
        stale.remove();
      }
    } else if (!foot.querySelector("#mrfoot") && RM_FOOT.every(([id]) => document.getElementById(id))) {
      const f = document.createElement("div");
      f.id = "mrfoot";
      RM_FOOT.forEach(([id, label]) => {
        const n = document.getElementById(id);
        if (!n) return;
        const row = document.createElement("div");
        row.className = "mfrow";
        row.appendChild(n);
        const s = document.createElement("span");
        s.textContent = label;
        row.appendChild(s);
        row.addEventListener("click", (ev) => { if (ev.target !== n) n.click(); });
        f.appendChild(row);
      });
      foot.insertBefore(f, foot.firstChild);
    }
    /* News & Updates + KJV picker pinned at the very bottom of the footer (deduped
       the same way — clicking News re-creates #tc_news). */
    const allNews = [].slice.call(document.querySelectorAll(".col.right [id='tc_news']"));
    const news = allNews.filter((e) => e.closest("#ybfoot"))[0] || allNews[allNews.length - 1] || null;
    allNews.forEach((e) => { if (e !== news) e.remove(); });
    if (news && news.parentNode !== foot) foot.appendChild(news);
    const vp = document.querySelector(".verpick");
    if (vp && news && !news.contains(vp)) news.appendChild(vp);
  }
  /* Never let the user get stranded on the Settings panel or a profile/creator
     page: give each a clear way back. */
  function ensureEscapes() {
    const sp = document.getElementById("setpanel");
    if (sp && sp.classList.contains("inpanel-open") && !sp.querySelector("#ybsetclose")) {
      const x = document.createElement("button");
      x.id = "ybsetclose"; x.type = "button"; x.textContent = "✕ Close settings";
      x.style.cssText = "position:sticky;top:0;z-index:3;display:block;width:100%;margin:0 0 10px;padding:9px;" +
        "border:1px solid #c9a86a55;border-radius:10px;background:#1c1536;color:#e8d9ae;font:600 14px system-ui;cursor:pointer;";
      x.onclick = () => {
        try { window.toggleSettingsPanel && window.toggleSettingsPanel(false); }
        catch (e) { sp.classList.remove("inpanel-open"); sp.style.display = "none"; }
      };
      sp.insertBefore(x, sp.firstChild);
    }
    const pane = document.querySelector("#reader .profpane");
    if (pane && !pane.querySelector("#ybprofback")) {
      const b = document.createElement("button");
      b.id = "ybprofback"; b.type = "button"; b.textContent = "← Back to reading";
      b.style.cssText = "display:block;margin:0 0 12px;padding:8px 12px;border:1px solid #c9a86a55;" +
        "border-radius:10px;background:#1c1536;color:#e8d9ae;font:600 14px system-ui;cursor:pointer;";
      b.onclick = () => { try { window.goHome && window.goHome(); } catch (e) {} };
      pane.insertBefore(b, pane.firstChild);
    }
  }
  /* The Repentance nav icon must be a dove seen from the SIDE (a flying dove with
     a raised wing), not the front-on bird the captured page ships. Re-point the
     path each tick so it survives re-renders. */
  const DOVE_D = "M6 44 C16 42 26 41 33 39 C34 30 39 20 52 16 L60 12 L54 20 C52 26 51 30 50 33 " +
    "C46 42 40 46 34 47 C24 49 13 49 6 44 Z M52 22 a1.5 1.5 0 1 0 .1 0 Z";
  function fixDove() {
    document.querySelectorAll(".tcdove path").forEach((p) => {
      if (p.getAttribute("d") !== DOVE_D) { p.setAttribute("d", DOVE_D); p.setAttribute("fill-rule", "evenodd"); }
    });
  }
  /* Studio Mode opens a large, centred popup of stage options — instead of the
     small drop-down pinned under the button — echoing how the study panes present
     on mobile. Selecting a stage hands off to the page's openStudio(). */
  function studioModal() {
    const old = document.getElementById("ybstudiomodal");
    if (old) { old.remove(); return; }
    const ov = document.createElement("div");
    ov.id = "ybstudiomodal";
    ov.style.cssText = "position:fixed;inset:0;z-index:99998;background:#060410cc;display:flex;" +
      "align-items:center;justify-content:center;padding:20px;";
    const card = document.createElement("div");
    card.style.cssText = "width:min(560px,92vw);max-height:88vh;overflow:auto;background:#140f28;" +
      "border:1px solid #c9a86a44;border-radius:18px;padding:26px;box-shadow:0 24px 80px #000b;";
    card.innerHTML = "<h2 style='margin:0 0 4px;font:700 22px \"EB Garamond\",Georgia,serif;color:#e8d9ae'>Studio Mode</h2>" +
      "<p style='margin:0 0 18px;opacity:.8;font:14px system-ui'>Present and critique the Word — choose a stage.</p>" +
      "<div id='ybstudiogrid' style='display:grid;grid-template-columns:1fr 1fr;gap:12px'></div>" +
      "<button id='ybstudioclose' style='margin-top:18px;width:100%;padding:10px;border:1px solid #c9a86a55;" +
      "border-radius:12px;background:#1c1536;color:#e8d9ae;font:600 15px system-ui;cursor:pointer'>Close</button>";
    ov.appendChild(card);
    document.body.appendChild(ov);
    const opts = [
      ["yt", "🎬", "YouTube Critique", "Study a YouTube video beside Scripture"],
      ["tiktok", "📱", "TikTok Critique", "A phone-shaped stage for short video"],
      ["ytb", "🎞️", "YouTube-B", "A second YouTube stage"],
    ];
    const grid = card.querySelector("#ybstudiogrid");
    opts.forEach((o) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.cssText = "text-align:left;padding:16px;border:1px solid #c9a86a33;border-radius:14px;" +
        "background:hsl(262 30% 16%);color:#eee;cursor:pointer;font:inherit;";
      btn.innerHTML = "<div style='font-size:26px'>" + o[1] + "</div>" +
        "<div style='font:600 15px system-ui;color:#e8d9ae;margin:6px 0 2px'>" + o[2] + "</div>" +
        "<div style='font:13px system-ui;opacity:.75'>" + o[3] + "</div>";
      btn.onclick = () => { ov.remove(); try { window.openStudio && window.openStudio(o[0]); } catch (e) {} };
      grid.appendChild(btn);
    });
    card.querySelector("#ybstudioclose").onclick = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  }
  function rebindStudio() {
    ["studiobtn", "tc_studio"].forEach((id) => {
      const sb = document.getElementById(id);
      if (sb && sb.dataset.ybstudio !== "1") {
        sb.dataset.ybstudio = "1";
        sb.onclick = (e) => { e.preventDefault(); e.stopPropagation(); studioModal(); };
      }
    });
  }
  /* Profile / creator links must open their destination in a new tab. Relying on
     <a target="_blank"> fails in some embedded / standalone-PWA contexts, so force
     it with window.open on click (falling back to a same-tab navigation), and make
     any scheme-less URL absolute. */
  function fixProfileLinks() {
    document.querySelectorAll("#reader .profpane a, #reader .profsocial a, #reader .profcta a").forEach((a) => {
      if (a.dataset.ybfx) return;
      a.dataset.ybfx = "1";
      let h = (a.getAttribute("href") || "").trim();
      if (h && !/^(https?:|mailto:|tel:)/i.test(h) && !h.startsWith("#")) h = "https://" + h.replace(/^\/+/, "");
      a.setAttribute("href", h);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.addEventListener("click", (e) => {
        if (!h || h.startsWith("#")) return;
        e.preventDefault(); e.stopPropagation();
        let w = null;
        try { w = window.open(h, "_blank", "noopener,noreferrer"); } catch (_) {}
        if (!w) { try { window.top.location.href = h; } catch (_) { location.href = h; } }
      });
    });
  }
  /* The footer Study button pops up the page's #mstudypop with two buttons — the
     split-view ✦ and the add-note +. Add the camera 🎥 between them (proxying to the
     hidden header camera button), so the camera pops up with those two. */
  function addStudyPopCamera() {
    const pop = document.getElementById("mstudypop");
    if (!pop || pop.querySelector(".mpopcam")) return;
    const cam = document.getElementById("ybcambtn");
    if (!cam) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "mpopcam"; b.title = "Camera & greenscreen"; b.textContent = "🎥";
    b.onclick = (e) => { e.stopPropagation(); if (window.__hideStudyPop) window.__hideStudyPop(); const r = document.getElementById("ybcambtn"); if (r) r.click(); };
    /* place between the star (first) and the plus (second) */
    if (pop.children.length >= 2) pop.insertBefore(b, pop.children[1]);
    else pop.appendChild(b);
  }
  /* The RealizeUS link opens RealizeUS.me in the CENTRE reader (the signed-in user's
     @handle when known, else the public site), keeping the header and footer, rather
     than leaving the app. */
  function realizeInCenter() {
    const reader = document.getElementById("reader");
    if (!reader) return;
    reader.innerHTML = "<div class='empty' style='text-align:center;margin-top:40px;opacity:.7'>opening RealizeUS…</div>";
    (async () => {
      let url = "https://www.realizeus.me";
      try {
        const pr = await fetch(location.origin + "/api/profile").then((r) => r.json());
        let h = pr && (pr.realizeus || pr.handle);
        if (h) { h = String(h).replace(/^@/, "").replace(/^https?:\/\/[^/]+\/?@?/i, "").replace(/\/+$/, ""); if (h) url = "https://www.realizeus.me/@" + h; }
      } catch (e) {}
      reader.innerHTML = "<iframe src='" + url + "' title='RealizeUS' " +
        "style='display:block;width:100%;height:calc(100dvh - 130px);min-height:70vh;border:0;background:#fff;border-radius:12px'></iframe>";
    })();
  }
  addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#m_realize, .m_realize, [data-t='realize']");
    if (b) { e.preventDefault(); e.stopPropagation(); realizeInCenter(); }
  }, true);
  /* Colour the commandment teaching's quotes by speaker (Gospel ref = the words of
     Christ → scarlet; otherwise → violet) and normalise "of Ten" → "of 10". */
  function styleCommandments() {
    const cs = document.querySelector("#reader .cmdstudy");
    if (!cs || cs.dataset.ybstyled) return;
    cs.dataset.ybstyled = "1";
    const no = cs.querySelector(".cmdno");
    if (no) no.textContent = no.textContent.replace(/of\s+Ten/i, "of 10");
    const full = cs.querySelector(".cmdfull");
    if (full && !full.classList.contains("q-christ")) full.classList.add("q-violet");
    cs.querySelectorAll(".cscr").forEach((q) => {
      if (q.classList.contains("q-christ") || q.classList.contains("q-violet")) return;
      const ref = (q.querySelector(".cscrref") || {}).textContent || "";
      q.classList.add(/\b(Matthew|Mark|Luke|John)\b/i.test(ref) ? "q-christ" : "q-violet");
    });
    cs.querySelectorAll(".prayerbox").forEach((q) => { if (!q.classList.contains("q-violet")) q.classList.add("q-violet"); });
  }
  /* Organise the settings into collapsible accordions by type, and add a Camera
     section (front + back independent streams). Runs once the panel's rows exist. */
  const SET_GROUPS = [
    ["ybacc_appear", "🎨 Appearance", ["themeseg", "rsize", "hebsize", "hue", "huerand"]],
    ["ybacc_read", "📖 Reading", ["quotesecs", "contscroll", "langpick", "verorder"]],
    ["ybacc_display", "🖼️ Background & transparency", ["bannertoggle", "centeropq", "showbg", "bgvis", "panelt"]],
  ];
  function rowOf(id) { const el = document.getElementById(id); return el ? el.closest(".row") : null; }
  function organizeSettings() {
    const sp = document.getElementById("setpanel");
    if (!sp || sp.dataset.yborg || !document.getElementById("rsize")) return;
    sp.dataset.yborg = "1";
    const reset = rowOf("resetset");
    const mkAcc = (id, title) => {
      const acc = document.createElement("div");
      acc.className = "setacc"; acc.id = id;
      acc.innerHTML = "<div class='acchdr'>" + title + " <span class='caret'>&#9654;</span></div><div class='accbody'></div>";
      acc.querySelector(".acchdr").addEventListener("click", () => acc.classList.toggle("open"));
      if (reset && reset.parentNode === sp) sp.insertBefore(acc, reset); else sp.appendChild(acc);
      return acc.querySelector(".accbody");
    };
    SET_GROUPS.forEach(([id, title, ids]) => {
      const body = mkAcc(id, title);
      ids.forEach((rid) => { const row = rowOf(rid); if (row) body.appendChild(row); });
    });
    /* Word-define mode (moved here from the old "?" beside the title) */
    const readBody = document.querySelector("#ybacc_read .accbody");
    if (readBody) {
      const row = document.createElement("div"); row.className = "row";
      row.innerHTML = "<label>Word definitions open as</label>";
      const sel = document.createElement("select");
      sel.innerHTML = "<option value='panel'>The right menu</option><option value='popup'>A pop-up</option>";
      try { sel.value = localStorage.getItem("ybw_worddef") === "popup" ? "popup" : "panel"; } catch (e) {}
      sel.onchange = () => { try { localStorage.setItem("ybw_worddef", sel.value); } catch (e) {} };
      row.appendChild(sel); readBody.appendChild(row);
    }
    /* Camera — front + back independent streams, full controls */
    const cam = mkAcc("ybacc_camera", "🎥 Camera & greenscreen");
    cam.innerHTML =
      "<p style='font-size:13px;opacity:.82;margin:2px 0 10px'>Two independent streams — each with its own ring colour, shape, greenscreen and mirror.</p>" +
      "<div class='row'><button id='ybopencam' style='width:100%'>Open camera (front / back / both)</button></div>";
    const ob = cam.querySelector("#ybopencam");
    if (ob) ob.onclick = () => { const c = document.getElementById("ybcambtn"); if (c) c.click(); };
    buildCameraSettings(cam);
  }
  function buildCameraSettings(cam) {
    if (!window.YBCAM) { setTimeout(() => buildCameraSettings(cam), 800); return; }
    [["cam", "📷 Front camera"], ["cam2", "🔄 Back camera"]].forEach(([id, label]) => {
      const p = window.YBCAM.get(id);
      const acc = document.createElement("div");
      acc.className = "setacc"; acc.style.margin = "8px 0";
      acc.innerHTML = "<div class='acchdr'>" + label + " <span class='caret'>&#9654;</span></div><div class='accbody'></div>";
      acc.querySelector(".acchdr").addEventListener("click", () => acc.classList.toggle("open"));
      const body = acc.querySelector(".accbody");
      /* ring colour swatches */
      const crow = document.createElement("div"); crow.className = "row"; crow.innerHTML = "<label>Ring colour</label>";
      const sw = document.createElement("div"); sw.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
      window.YBCAM.COLORS.forEach((c, i) => {
        const bt = document.createElement("button"); bt.type = "button"; bt.title = c === "holo" ? "Holographic" : c;
        bt.style.cssText = "width:22px;height:22px;border-radius:50%;cursor:pointer;flex:0 0 auto;border:2px solid " +
          (p.color === i ? "#fff" : "transparent") + ";" +
          (c === "holo" ? "background:linear-gradient(115deg,#c07ad9,#59b8ff,#5fd39a,#e7c94e,#e0563b)" : "background:" + c);
        bt.onclick = () => { window.YBCAM.set(id, { color: i }); [].forEach.call(sw.children, (x, j) => { x.style.borderColor = j === i ? "#fff" : "transparent"; }); };
        sw.appendChild(bt);
      });
      crow.appendChild(sw); body.appendChild(crow);
      /* shape */
      const shrow = document.createElement("div"); shrow.className = "row"; shrow.innerHTML = "<label>Shape</label>";
      const ssel = document.createElement("select");
      ssel.innerHTML = "<option value='round'>Round</option><option value='land'>Landscape</option><option value='port'>Portrait</option>";
      ssel.value = p.form; ssel.onchange = () => window.YBCAM.set(id, { form: ssel.value });
      shrow.appendChild(ssel); body.appendChild(shrow);
      /* greenscreen */
      const grow = document.createElement("div"); grow.className = "row toggle"; grow.innerHTML = "<label style='margin:0'>Greenscreen (remove background)</label>";
      const gcb = document.createElement("input"); gcb.type = "checkbox"; gcb.checked = !!p.green;
      gcb.onchange = () => window.YBCAM.set(id, { green: gcb.checked }); grow.appendChild(gcb); body.appendChild(grow);
      /* mirror / flip */
      const mrow = document.createElement("div"); mrow.className = "row toggle"; mrow.innerHTML = "<label style='margin:0'>Mirror / flip</label>";
      const mcb = document.createElement("input"); mcb.type = "checkbox"; mcb.checked = !!p.mirror;
      mcb.onchange = () => window.YBCAM.set(id, { mirror: mcb.checked }); mrow.appendChild(mcb); body.appendChild(mrow);
      cam.appendChild(acc);
    });
  }
  function mobileFixups() {
    syncInsets(); reorderBrand(); moveTavHistLeft(); rebindCloseX();
    tidySingleChapter(); wrapNav(); buildRightMenu(); ensureEscapes(); fixDove(); rebindStudio(); fixProfileLinks(); addStudyPopCamera(); styleCommandments(); organizeSettings();
  }
  addEventListener("resize", () => { syncInsets(); mobilize(); rebindCloseX(); });
  setInterval(mobileFixups, 1200);   // header/menus may build late

  /* The study panel's X (#rightx) calls toggleRightPanel, which resizes the
     column on desktop — on a phone it must CLOSE the drawer. Intercept it (and
     any drawer close-X) in the capture phase so the resize never runs. */
  const isMobileUI = () => (document.body && document.body.classList.contains("framed")) ||
    matchMedia("(max-width:820px)").matches;
  addEventListener("click", (e) => {
    if (!isMobileUI()) return;
    const frame = document.querySelector(".frame");
    if (!frame) return;
    const x = e.target.closest && e.target.closest("#rightx, #leftx, .holocollapse, .drawerclose");
    if (x) {
      const inRight = x.closest(".col.right");
      const inLeft = x.closest(".col.left");
      e.preventDefault();
      e.stopPropagation();
      frame.classList.remove(inLeft ? "mleft" : "mright");
      if (!inLeft && !inRight) frame.classList.remove("mleft", "mright");
    }
  }, true);

  /* Auto-close the drawers on selection (phones): a chapter from the left menu
     loads and closes it; a commandment from the right menu loads to the centre
     and closes it. (The page already closes on book/source clicks; chapters are
     chips, and commandments live in #studycard — both handled here.) */
  addEventListener("click", (e) => {
    if (!isMobileUI()) return;
    const frame = document.querySelector(".frame");
    if (!frame) return;
    const t = e.target;
    /* a chapter chip is a final selection -> close the left menu */
    if (t.closest && t.closest(".col.left .chip, .col.left [data-ch], .col.left .chnum"))
      setTimeout(() => frame.classList.remove("mleft"), 120);
    /* a leaf work with a SINGLE chapter navigated directly on its row tap -> close;
       a multi-chapter source/book stays open so its chapters can be chosen */
    const row = t.closest && t.closest(".col.left .node > .row");
    if (row) setTimeout(() => {
      const node = row.parentElement;
      const g = node && node.querySelector(":scope > .kids > .chgrid");
      if (g && g.querySelectorAll(".chip").length <= 1) frame.classList.remove("mleft");
    }, 320);
    if (t.closest && t.closest(".col.right #studycard .cmd, .col.right #studycard .cmdrow," +
        " .col.right #studycard [data-cmd], .col.right #studycard li, .col.right #studycard .row," +
        " .col.right #studycard a, .col.right #studycard .tcitem"))
      setTimeout(() => frame.classList.remove("mright"), 90);
  }, true);
  new MutationObserver((m, obs) => {
    if (document.body) { mobilize(); obs.disconnect(); }
  }).observe(document.documentElement, { childList: true });
  addEventListener("resize", mobilize);
  /* iOS standalone launches with an unsettled viewport (the window/toolbar height
     is wrong until the first user gesture), which shifts the layout "until manually
     resized". Re-run the layout on every settling signal + a few delayed passes so
     it corrects itself on launch without the user touching anything. */
  const relayout = () => { mobilize(); syncInsets(); };
  addEventListener("load", relayout);
  addEventListener("pageshow", relayout);           // fires on standalone (re)launch / bfcache restore
  addEventListener("orientationchange", () => setTimeout(relayout, 60));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", relayout);
  [120, 400, 900, 1800].forEach((ms) => setTimeout(relayout, ms));
  /* the hybrid's exit rows post 'yb-exit' to the shell; on the open web the
     shell is the RealizeUS site itself — carry the reader home. */
  addEventListener("message", (ev) => {
    if (ev.data === "yb-exit" && ev.source === window) location.href = "/";
  });

  /* image/audio srcs bypass fetch — rewrite them after the page builds */
  /* absolute app paths that bypass fetch (img src, iframe src) must be rewritten
     to the app base — the gnostic map iframe points at /cosmos.html, which in
     turn loads /cosmos_map.png; both live at the app root. */
  function fixSrc(el) {
    const a = el.tagName === "IFRAME" ? "src" : "src";
    const v = el.getAttribute(a) || "";
    if (v.startsWith("/assets/")) el.setAttribute(a, APPBASE + "assets/" + v.slice(8));
    else if (v === "/cosmos.html" || v.startsWith("/cosmos.html?"))
      el.setAttribute(a, APPBASE + "cosmos.html" + v.slice("/cosmos.html".length));
    else if (v === "/cosmos_map.png") el.setAttribute(a, APPBASE + "cosmos_map.png");
    /* the cosmos (Uriel's Heavenly Design / gnostic) map iframe must show the
       animated site background through it — force the element itself transparent
       and neutralize any dark color-scheme backdrop the browser would paint. */
    if (el.tagName === "IFRAME" && /cosmos/.test(v)) {
      el.setAttribute("allowtransparency", "true");
      el.style.background = "transparent";
      el.style.colorScheme = "normal";
    }
  }
  const SEL = "img[src^='/assets/'],iframe[src^='/cosmos'],img[src='/cosmos_map.png']";

  /* The RealizeUS footer tab embeds an iframe (#mrealize) that the page points at
     realizeus.org — which is this very site. Repoint it at the creator's public
     RealizeUS.me profile, or, when the signed-in user has linked their own
     RealizeUS handle, at theirs. */
  let realizeTarget = "https://www.RealizeUS.me/@yahwehtsidkenu";
  async function resolveRealizeTarget() {
    try {
      const me = await realFetch(location.origin + "/api/profile");
      const j = await me.json();
      const h = ((j && (j.realizeus || j.realize)) || "").replace(/^@/, "").trim();
      if (h) realizeTarget = "https://www.RealizeUS.me/@" + h;
    } catch (e) {}
  }
  function fixRealize(el) {
    const v = el.getAttribute("src") || "";
    if (/realizeus\.org/i.test(v) || v === "" || v === "about:blank") {
      if (el.getAttribute("data-ybtarget") !== realizeTarget) {
        el.setAttribute("data-ybtarget", realizeTarget);
        el.setAttribute("src", realizeTarget);
      }
    }
  }

  addEventListener("DOMContentLoaded", () => {
    resolveRealizeTarget();
    document.querySelectorAll(SEL).forEach(fixSrc);
    document.querySelectorAll("#mrealize").forEach(fixRealize);
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1) {
            if (n.matches && n.matches(SEL)) fixSrc(n);
            if (n.matches && n.matches("#mrealize")) fixRealize(n);
            n.querySelectorAll && n.querySelectorAll(SEL).forEach(fixSrc);
            n.querySelectorAll && n.querySelectorAll("#mrealize").forEach(fixRealize);
          }
        for (const m2 of muts)
          if (m2.type === "attributes" && m2.target.id === "mrealize") fixRealize(m2.target);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["src"] });
  });
})();
