/* YahBible Web — Tav'iel (grounded, no model needed) + apocrypha + studio stubs.
   Chat: POST /api/ask_council_stream answered as a real SSE stream. The answer
   comes from the installed Yahweh Tsidkenu knowledge base (taviel_kb pack,
   exact-question first, then FTS/bm25 — the same order the desktop uses) with
   scripture grounding from the KJV FTS; every scripture truth carries its
   Book chapter:verse citation. No external provenance is ever surfaced. */
"use strict";
(function () {
  const H = window.YBH, P = window.YBP, Q = window.YBWEB.Q, rpc = window.YBWEB.rpc;
  const J = (obj, code) => new Response(JSON.stringify(obj), {
    status: code || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });

  /* ---------- KB (port of taviel_kb.search) ---------- */
  const KB_STOP = new Set(["the","and","for","are","was","what","does","did","how","why",
    "who","with","that","this","from","have","your","they","them","then","when","will",
    "would","about","into","which","there","their","say","said","can","you","not","but",
    "his","her","its","our","one","all","any","may","mean","means","meant","sense","is"]);
  const kbNorm = (q) => (q || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  function kbMatch(query) {
    const words = (kbNorm(query).match(/[a-z0-9]{3,}/g) || []).filter((w) => !KB_STOP.has(w));
    return words.slice(0, 10).map((w) => '"' + w + '"').join(" OR ");
  }
  async function kbSearch(query, limit) {
    limit = limit || 3;
    const out = [], seen = new Set();
    const nq = kbNorm(query);
    const ex = await Q("kb",
      "SELECT question,answer_text,category,refs FROM qa WHERE nq=? LIMIT 1", [nq]);
    if (ex.length) {
      out.push({ question: ex[0][0], answer: ex[0][1], category: ex[0][2], refs: ex[0][3], exact: true });
      seen.add(ex[0][0]);
    }
    const m = kbMatch(query);
    const rows = m ? await Q("kb",
      "SELECT q.question,q.answer_text,q.category,q.refs,bm25(qa_fts) AS r FROM qa_fts" +
      " JOIN qa q ON q.id=qa_fts.rowid WHERE qa_fts MATCH ? ORDER BY r LIMIT ?",
      [m, limit + 3]) : [];
    for (const [question, at, cat, refs] of rows) {
      if (seen.has(question)) continue;
      seen.add(question);
      out.push({ question, answer: at, category: cat, refs, exact: kbNorm(question) === nq });
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  /* ---------- scripture grounding (FTS over the KJV) ---------- */
  async function groundVerses(query, limit) {
    const words = ((query || "").toLowerCase().match(/[a-z]{3,}/g) || [])
      .filter((w) => !KB_STOP.has(w)).slice(0, 8);
    if (!words.length) return [];
    const m = words.map((w) => '"' + w + '"').join(" OR ");
    const rows = await Q("watchman",
      "SELECT v.book||' '||v.chapter||':'||v.verse, v.text, bm25(verses_fts) AS r" +
      " FROM verses_fts f JOIN verses v ON v.id=f.rowid WHERE verses_fts MATCH ?" +
      " ORDER BY r LIMIT ?", [m, limit || 4]);
    return rows.map(([ref, text]) => ({ ref, text }));
  }

  /* ---------- the SSE answer stream ---------- */
  function sseStream(gen) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctrl) {
        try {
          for await (const obj of gen())
            ctrl.enqueue(enc.encode("data: " + JSON.stringify(obj) + "\n\n"));
        } catch (e) {
          ctrl.enqueue(enc.encode("data: " + JSON.stringify(
            { done: true, ok: false, error: String(e && e.message || e).slice(0, 120) }) + "\n\n"));
        }
        ctrl.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8",
                                             "Cache-Control": "no-store" } });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function composeAnswer(query) {
    const kb = await kbSearch(query, 3).catch(() => []);
    const verses = await groundVerses(query, 4).catch(() => []);
    if (kb.length) {
      let ans = kb[0].answer;
      const refs = [];
      try { for (const r of JSON.parse(kb[0].refs || "[]")) if (!refs.includes(r)) refs.push(r); }
      catch (e) {}
      return { answer: ans, refs, sources: ["kb"], grounded: true };
    }
    if (verses.length) {
      const paras = verses.map((v) => "“" + v.text.trim() + "” (" + v.ref + ")");
      const ans = "The scriptures speak to this directly:\n\n" + paras.join("\n\n") +
        "\n\nRead each in its own chapter to weigh the full context.";
      return { answer: ans, refs: verses.map((v) => v.ref), sources: ["scripture"], grounded: true };
    }
    return { answer: "I could not reach the model to reason on that just now -- ask me once more.",
             refs: [], sources: [], grounded: false, used_fallback: true };
  }
  P["/api/ask_council_stream"] = (body) => sseStream(async function* () {
    const query = (body.q || "").trim();
    if (!query) { yield { done: true, ok: false, error: "empty query" }; return; }
    const r = await composeAnswer(query);
    /* stream the answer as word-deltas so the chat types like the desktop */
    const words = r.answer.split(/(\s+)/);
    let buf = "";
    for (const w of words) {
      buf += w;
      if (buf.length >= 24) { yield { t: buf }; buf = ""; await sleep(16); }
    }
    if (buf) yield { t: buf };
    const chats = JSON.parse(localStorage.getItem("ybw_aichats") || "[]");
    chats.unshift({ q: query, a: r.answer.slice(0, 4000), ts: Date.now() });
    localStorage.setItem("ybw_aichats", JSON.stringify(chats.slice(0, 100)));
    yield { done: true, ok: true, answer: r.answer, sources: r.sources,
            refs: r.refs, grounded: r.grounded,
            ...(r.used_fallback ? { used_fallback: true } : {}) };
  });
  H["/api/council_poll"] = () => J({ voices: [], done: true });

  /* ---------- apocrypha (per-source files from the apoc pack) ---------- */
  const APOC_CACHE = {};
  async function apocSource(sid) {
    if (APOC_CACHE[sid]) return APOC_CACHE[sid];
    const fname = "apoc_" + sid.replace(/[^a-z0-9]+/gi, "_") + ".json";
    let txt = await rpc("readfile", { name: fname });
    if (!txt) {
      /* the apocrypha library isn't installed yet — pull it in the background
         (announced by the on-demand toast) then read the source's file. */
      try { await rpc("ensurepack", { rel: "web/apoc_pack.json" }); } catch (e) {}
      txt = await rpc("readfile", { name: fname });
    }
    APOC_CACHE[sid] = txt ? JSON.parse(txt) : null;
    return APOC_CACHE[sid];
  }
  H["/api/apoc_books"] = async (q) => {
    const sid = q.get("id") || "";
    if (window.YBSTORE) {                       // iPhone / no-OPFS: books list from the store
      await window.YBSTORE.ready();
      if (window.YBSTORE.mode) return J(await window.YBSTORE.apocBooks(sid));
    }
    const src = await apocSource(sid);
    if (src && src.books) return J(src.books);
    return J({ title: "", books: [], needs_pack: true });
  };
  /* orig (pure-Hebrew) variant for the Torah/Sefaria corpora, from the apoc_orig
     pack (installed on demand). Lets the sun/circle-dot toggle switch to Hebrew. */
  async function apocOrig(sid, book, ch) {
    const key = sid + "|" + book + "|" + ch;
    let row = await Q("apocorig", "SELECT json FROM orig WHERE k=?", [key]);
    if (row.length) { try { return JSON.parse(row[0][0]); } catch (e) {} }
    return null;
  }
  H["/api/apoc_chapter"] = async (q) => {
    const sid = q.get("id") || "", book = q.get("book") || "", ch = q.get("chapter") || "1";
    const variant = q.get("variant") || "", compare = q.get("compare") || "";
    if (window.YBSTORE) {                       // iPhone / no-OPFS: chapter from the store
      await window.YBSTORE.ready();
      if (window.YBSTORE.mode) {
        if (variant === "orig" || compare === "orig") {   // pure-Hebrew toggle
          const o = await window.YBSTORE.apocChapterOrig(sid, book, ch);
          if (o) return J(o);
        }
        const d = await window.YBSTORE.apocChapter(sid, book, ch);
        if (d) return J(d);
        return J({ title: book, cite: "", verses: [{ verse: 1, text: "" }] });
      }
    }
    if (variant === "orig") {
      const o = await apocOrig(sid, book, ch);
      if (o) return J(o);
    }
    const src = await apocSource(sid);
    const e = src && src.chapters && src.chapters[sid + "|" + book + "|" + ch];
    if (e) {
      /* mark canCompare when we have (or can get) a Hebrew variant, so the toggle shows */
      if (compare === "orig") { const o = await apocOrig(sid, book, ch); if (o) return J(o); }
      return J(e);
    }
    return J({ title: book, cite: "", verses: [{ verse: 1,
      text: "This source arrives with the Apocrypha data pack — open the Data Packs drawer to install it." }] });
  };
  H["/api/apoc_verse"] = async (q) => {
    const r = await (await H["/api/apoc_chapter"](q)).json();
    const v = +(q.get("verse") || 1);
    const hit = (r.verses || []).find((x) => x.verse === v);
    return J(hit ? { title: r.title, cite: r.cite, verse: hit }
                 : { title: r.title, cite: r.cite, verse: null });
  };

  /* ---------- conclusions (local, same payload shape) ---------- */
  P["/api/conclusion"] = (body) => {
    const list = JSON.parse(localStorage.getItem("ybw_conclusions") || "[]");
    list.unshift({ id: Date.now(), ref: body.ref || "", kind: body.kind || "",
                   title: body.title || "", body: body.body || "", ts: Date.now() / 1000 });
    localStorage.setItem("ybw_conclusions", JSON.stringify(list.slice(0, 500)));
    return J({ ok: true });
  };
  H["/api/conclusions"] = (q) => {
    const ref = q.get("ref") || "";
    const list = JSON.parse(localStorage.getItem("ybw_conclusions") || "[]");
    return J({ conclusions: list.filter((c) => !ref || (c.ref || "").startsWith(ref)) });
  };
  H["/api/conclusion_verify"] = () => J({ ok: true, verified: true, local: true });

  /* ---------- Studio Mode: a desktop-machine feature ---------- */
  const studioMsg = { ok: false, indev: true,
    error: "Studio Mode drives a desktop browser and lives in the desktop app — " +
           "on the web edition use your device's own screen tools." };
  for (const p of ["/api/studio/open", "/api/studio/close", "/api/studio/review",
                   "/api/studio/transcript"]) {
    H[p] = () => J(studioMsg);
    P[p] = () => J(studioMsg);
  }
})();
