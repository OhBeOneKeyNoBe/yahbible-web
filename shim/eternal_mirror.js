/* The Eternal Mirror — installed in YahBible as its own corpus, whole and as-is.

   Elan'iel: "the full book of the eternal mirror and all its chapters are to
   also be installed in left menu of YahBible as is for now, right above the
   Gnostic Map and Gnostic Lineage."

   It ships INSIDE the app (static_api/eternal_mirror.json, ~1 MB), so it needs
   no pack download and works offline on first run. These handlers answer
   /api/apoc_books and /api/apoc_chapter for this one source id before the
   pack-backed path in taviel.js is consulted; every other source is untouched.

   gnosis / "Eternal Mirror" are new terms to most readers, so the book's note
   defines them wherever the corpus is presented. */
"use strict";
(function () {
  const SID = "corpus:eternal_mirror";
  let BOOK = null;

  async function load() {
    if (BOOK) return BOOK;
    const base = (window.APPBASE || "");
    const r = await (window.fetch)(
      base + "static_api/eternal_mirror.json");
    BOOK = await r.json();
    return BOOK;
  }

  function J(o) {
    return new Response(JSON.stringify(o),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  /* Wait for taviel.js to publish its handler table, then wrap the two
     routes. Wrapping (not replacing) keeps every other corpus on its
     existing pack-backed path. */
  function install(H) {
    if (!H || H.__emInstalled) return false;
    const prevBooks = H["/api/apoc_books"];
    const prevChapter = H["/api/apoc_chapter"];

    H["/api/apoc_books"] = async (q) => {
      if ((q.get("id") || "") === SID) {
        const b = await load();
        return J({
          title: b.book,
          books: [{
            book: b.book,
            chapters: b.chapters.map((c) => c.chapter),
          }],
        });
      }
      return prevBooks ? prevBooks(q) : J({ title: "", books: [] });
    };

    H["/api/apoc_chapter"] = async (q) => {
      if ((q.get("id") || "") === SID) {
        const b = await load();
        const want = parseInt(q.get("chapter") || "0", 10);
        const c = b.chapters.find((x) => x.chapter === want) || b.chapters[0];
        return J({
          title: b.book + " — " + (c.title || ("Part " + c.chapter)),
          cite: b.author + " · " + b.note,
          verses: c.verses,
        });
      }
      return prevChapter ? prevChapter(q) : J({ title: "", verses: [] });
    };

    H.__emInstalled = true;
    return true;
  }

  let tries = 0;
  const t = setInterval(() => {
    if (install(window.YBH) || ++tries > 200) clearInterval(t);
  }, 50);
  window.__emInstall = install;
})();
