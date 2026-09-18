/* YahBible — verse/word interaction rules:
   (A) Clicking a verse in a source that has no verse study (apocrypha / gnostic
       prose) must NOT open the right study menu.
   (B) Defining a word is a user setting — pop-up or right-menu — toggled by a "?"
       mark beside the circle-dot (☉) / passage title. Default = right menu.
   Self-contained + guarded so the same block runs in the desktop O'Tav'iel PAGE
   and in the web shim without double-installing. */
"use strict";
(function () {
  if (window.__ybWordDef) return;
  window.__ybWordDef = 1;
  var LS = "ybw_worddef";
  /* Default to the quick POP-UP for a tapped word while reading (a clear English/
     original definition), instead of taking over the right menu — the right menu
     stays for deliberate verse study via its own button. Switchable in Settings. */
  function mode() { try { return localStorage.getItem(LS) === "panel" ? "panel" : "popup"; } catch (e) { return "popup"; } }
  function setMode(m) { try { localStorage.setItem(LS, m); } catch (e) {} paintToggle(); }
  /* canon (a Bible book) carries verse study; a plain apocryphal source does not */
  function hasStudy() { try { return !STATE || !STATE.apoc; } catch (e) { return true; } }

  /* ---- the "?" toggle beside the sun / title ---- */
  function paintToggle() {
    var b = document.getElementById("ybwdq");
    if (!b) return;
    var pop = mode() === "popup";
    b.style.background = pop ? "linear-gradient(115deg,#c8f6ff,#ffd1f7,#d8c6ff)" : "transparent";
    b.style.color = pop ? "#1a1030" : "inherit";
    b.style.borderColor = pop ? "transparent" : "#c9a86a66";
    b.title = "Word definitions open as " + (pop ? "a pop-up" : "the right menu") + " — click to switch";
  }
  function ensureToggle() {
    /* Only show the "?" while reading an actual scripture chapter (verse numbers
       present) — never on the landing showcase, the commandment pages, repentance,
       or a profile, where it would just float with nothing to define. */
    /* The word-define mode is now a proper setting in the Settings panel, so the
       stray "?" beside the title is retired — remove it wherever it appears. */
    var existing = document.getElementById("ybwdq");
    if (existing) existing.remove();
  }
  setInterval(ensureToggle, 1000);
  ensureToggle();

  /* ---- the pop-up ---- */
  function popupFor(el) {
    var old = document.getElementById("ybwdpop");
    if (old) old.remove();
    var pop = document.createElement("div");
    pop.id = "ybwdpop";
    pop.style.cssText = "position:fixed;z-index:99999;width:min(320px,86vw);max-height:52vh;overflow:auto;" +
      "padding:12px 14px;border:1px solid #c9a86a66;border-radius:12px;background:#140f28;color:#eee;" +
      "box-shadow:0 12px 44px #000a;font:14px/1.5 system-ui;";
    var r = el.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 340)) + "px";
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 80) + "px";
    pop.innerHTML = "<div style='opacity:.6'>…</div>";
    document.body.appendChild(pop);
    var close = function (ev) {
      if (pop && !pop.contains(ev.target)) { pop.remove(); document.removeEventListener("click", close, true); }
    };
    setTimeout(function () { document.addEventListener("click", close, true); }, 0);
    return pop;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  /* Plain glosses for common + KJV-archaic words that carry no lexicon entry, so
     every tap returns a clear meaning — for readers who don't know a basic word. */
  var FUNCTION_GLOSS = {
    the: "points to a specific person or thing already known.",
    a: "one, or any single one (not a specific one).", an: "one, or any single one (before a vowel sound).",
    and: "also; joins words or ideas together.", or: "shows a choice between things.",
    but: "however; on the other hand.", if: "on the condition that; supposing that.",
    not: "expresses no, denial, or the opposite.", no: "not any; a refusal.", yes: "an answer of agreement.",
    in: "inside; within a place, thing, or state.", into: "moving to the inside of.",
    on: "resting upon the surface of.", at: "in or near a place or point.",
    to: "toward; in the direction of; showing purpose.", of: "belonging to; coming from; about.",
    for: "on behalf of; because of; intended to reach.", with: "together; alongside; by means of.",
    by: "beside; through the means of.", from: "starting at; out of; away from.",
    as: "in the same way that; like; while.", upon: "on; on top of; at the time of.",
    over: "above; across the top of.", under: "below; beneath.", "through": "from one side or end to the other.",
    unto: "to (old English); toward.", thou: "you (one person, old English).", thee: "you (one person, as an object; old English).",
    thy: "your (old English).", thine: "yours; your (before a vowel; old English).", ye: "you (more than one; old English).",
    hast: "have (old English, with 'thou').", hath: "has (old English).", doth: "does (old English).",
    shalt: "shall; will (old English, with 'thou').", art: "are (old English, with 'thou').",
    shall: "will; is certain or commanded to.", will: "is going to; is willing to.",
    that: "points to a thing further away, or introduces a statement.", this: "points to a thing near.",
    which: "what one; introduces added detail.", who: "what person.", whom: "what person (as an object).",
    whose: "belonging to which person.", what: "asks about a thing.", when: "at the time that.",
    where: "at or to which place.", why: "for what reason.", how: "in what way.",
    all: "the whole of; every one.", any: "one or some, no matter which.", every: "each one without exception.",
    some: "an unspecified amount or number.", none: "not any; no one.",
    he: "that male person.", she: "that female person.", it: "that thing.", they: "those people or things.",
    we: "the speaker and others.", you: "the person(s) spoken to.", i: "the person speaking.",
    him: "that male person (as an object).", her: "that female person.", them: "those people or things (as an object).",
    his: "belonging to him.", their: "belonging to them.", our: "belonging to us.", your: "belonging to you.", my: "belonging to me.",
    be: "to exist; to happen.", is: "exists; equals (present).", was: "existed (past).", are: "exist (present, plural).",
    were: "existed (past, plural).", been: "existed (past participle of be).", am: "exist (present, with 'I').",
    have: "to hold or possess.", has: "holds or possesses.", had: "held or possessed (past).",
    do: "to perform or act.", did: "performed (past).", "let": "to allow or permit.",
    up: "to a higher place.", down: "to a lower place.", out: "away from the inside.",
    so: "therefore; to such a degree.", then: "at that time; next.", than: "compared with.",
    now: "at this present time.", here: "in this place.", there: "in that place.", "yea": "yes; indeed (old English)."
  };
  /* Does a word response carry anything worth showing? */
  function hasContent(d) {
    return !!(d && d.found && ((d.senses && d.senses.length) ||
      (d.strongs && d.strongs.length && d.strongs[0] && d.strongs[0].definition) ||
      (d.originals && d.originals.length)));
  }
  /* Render a /api/word (or /api/english) response. Reading order follows the text's
     own tongue: for the OT / Torah it is HEBREW (the original glyph + its Strong's
     definition) -> ENGLISH (the plain senses) -> GREEK; for the New Testament the
     lead flips to Greek. So clicking a word in Genesis leads with the Hebrew, never
     the Greek. */
  function isNT() {
    try {
      var b = (window.STATE && STATE.book) || "";
      if (window.STATE && STATE.canon) return false;   // the Torah is OT
      return /^\s*(?:[123]\s+)?(Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\b/i.test(b);
    } catch (e) { return false; }
  }
  function langSection(sList, oList, label) {
    var s0 = (sList && sList[0]) || null, o0 = (oList && oList[0]) || null;
    var glyph = (o0 && o0.glyph) || (s0 && s0.glyph) || "";
    var def = (s0 && s0.definition) || "";
    if (!glyph && !def) return "";
    var h = "<div style='margin-top:8px;font:700 12px system-ui;color:#c9a86a;letter-spacing:.04em'>" + esc(label) +
      (s0 && s0.id ? " <span style='opacity:.7;font-weight:600'>" + esc(s0.id) + "</span>" : "") + "</div>";
    if (glyph) h += "<div style='font-size:20px;margin:2px 0;color:#e9dcff'>" + esc(glyph) + "</div>";
    if (def) h += "<div style='margin:2px 0 4px;line-height:1.5'>" + esc(def) + "</div>";
    return h;
  }
  function englishSection(w, d) {
    var body = "", senses = d.senses || [];
    if (senses.length) {
      body += "<ol style='margin:4px 0 0;padding-left:18px'>" + senses.slice(0, 6).map(function (s) {
        if (typeof s === "string") return "<li style='margin:3px 0;line-height:1.45'>" + esc(s) + "</li>";
        var pos = s.pos ? "<i style='opacity:.55'>" + esc(s.pos) + ".</i> " : "";
        return "<li style='margin:3px 0;line-height:1.45'>" + pos + esc(s.gloss || s.def || s.text || s.sense || "") + "</li>";
      }).join("") + "</ol>";
    } else if (d.definition) {
      body += "<div style='margin:2px 0 4px;line-height:1.5'>" + esc(d.definition) + "</div>";
    }
    if (!body) return "";
    return "<div style='margin-top:8px;font:700 12px system-ui;color:#c9a86a;letter-spacing:.04em'>English</div>" + body;
  }
  function renderWord(w, d) {
    var strongs = d.strongs || [], origs = d.originals || [];
    var hebS = strongs.filter(function (s) { return (s.language || "") === "Hebrew"; });
    var grkS = strongs.filter(function (s) { return (s.language || "") === "Greek"; });
    var hebO = origs.filter(function (o) { return (o.language || "") === "Hebrew"; });
    var grkO = origs.filter(function (o) { return (o.language || "") === "Greek"; });
    /* if the API left the language untagged, treat the entry as the text's own tongue */
    if (!hebS.length && !grkS.length && strongs.length) { if (isNT()) grkS = strongs; else hebS = strongs; }
    if (!hebO.length && !grkO.length && origs.length) { if (isNT()) grkO = origs; else hebO = origs; }
    var head = "<div style='font:700 16px system-ui;margin-bottom:2px;color:#f3e8c8'>" + esc(d.word || w) + "</div>";
    var heb = langSection(hebS, hebO, "Hebrew"), grk = langSection(grkS, grkO, "Greek"), eng = englishSection(w, d);
    var out = (isNT() ? [grk, eng, heb] : [heb, eng, grk]).filter(Boolean).join("");
    if (!out) out = "<div style='opacity:.55'>(no gloss available)</div>";
    return head + out;
  }
  /* ---- deep study in the right menu: the full verse (tap any word) + the word's
     Hebrew / Greek / Aramaic letter breakdown, English and Strong's ---- */
  function verseOf(el) {
    try {
      var vns = document.querySelectorAll("#reader .vn, #mid .vn"), best = 0;
      for (var i = 0; i < vns.length; i++)
        if (vns[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          var num = parseInt((vns[i].textContent || "").replace(/\D/g, ""), 10); if (num) best = num;
        }
      return best || (window.STATE && STATE.verse) || 1;
    } catch (e) { return 1; }
  }
  function bareGlyph(g) { return String(g || "").split(" (")[0].trim(); }
  function lettersHtml(title, d) {
    if (!d || !(d.letters && d.letters.length)) return "";
    var tot = d.gematria || d.isopsephy;
    var head = "<div style='margin-top:12px;font:700 12px system-ui;color:#c9a86a;letter-spacing:.04em'>" +
      esc(title) + (tot ? " <span style='opacity:.6;font-weight:400'>= " + tot + "</span>" : "") + "</div>";
    return head + d.letters.map(function (L) {
      return "<div style='display:flex;gap:8px;align-items:baseline;margin:3px 0'>" +
        "<span style='font-size:18px;min-width:1.3em;color:#e9dcff'>" + esc(L.glyph) + "</span>" +
        "<span style='min-width:5.6em;font-weight:600'>" + esc(L.name) +
        "<span style='opacity:.5;font-weight:400'> " + esc(L.translit || "") + "</span></span>" +
        "<span style='flex:1;opacity:.9;line-height:1.4'>" + esc(L.meaning || "") + "</span>" +
        (L.value ? "<span style='opacity:.5'>" + L.value + "</span>" : "") + "</div>";
    }).join("");
  }
  async function deepStudyView(book, ch, verse, word) {
    var fr = document.querySelector(".frame"); if (fr) fr.classList.add("mright");
    var card = document.querySelector("#studycard");
    if (!card) { setTimeout(function () { deepStudyView(book, ch, verse, word); }, 160); return; }
    card.innerHTML = "<div style='padding:14px;opacity:.7'>Studying &ldquo;" + esc(word) + "&rdquo;&hellip;</div>";
    var q = "book=" + encodeURIComponent(book) + "&chapter=" + ch;
    var chp = null, wd = null, il = null;
    try { chp = await (await fetch("/api/chapter?" + q + "&version=KJV")).json(); } catch (e) {}
    try { wd = await (await fetch("/api/word?w=" + encodeURIComponent(word) + "&" + q + "&verse=" + verse)).json(); } catch (e) {}
    try { il = await (await fetch("/api/interlinear?" + q + "&verse=" + verse)).json(); } catch (e) {}
    var vt = chp && (chp.verses || []).find(function (v) { return +v.verse === +verse; });
    var verseStr = vt ? vt.text : "";
    var o0 = wd && wd.originals && wd.originals[0], s0 = wd && wd.strongs && wd.strongs[0];
    var glyph = bareGlyph((o0 && o0.glyph) || (s0 && s0.glyph) || "");
    var lang = (o0 && o0.language) || (s0 && s0.language) || (wd && wd.english ? "English" : "");
    var heb = null, grk = null, aram = null;
    try {
      if (lang === "Hebrew" && glyph) heb = await (await fetch("/api/hebrew?glyph=" + encodeURIComponent(glyph))).json();
      if (lang === "Greek" && glyph) grk = await (await fetch("/api/greek?glyph=" + encodeURIComponent(glyph))).json();
      aram = await (await fetch("/api/aramaic?name=" + encodeURIComponent(word))).json();
    } catch (e) {}
    var wl = word.toLowerCase();
    /* readable verse (English) — tappable, and linkable to the original by data-en */
    var verseHtml = verseStr.replace(/([A-Za-z']+)|([^A-Za-z']+)/g, function (m, w2, sep) {
      if (sep != null && sep !== "") return esc(sep);
      var sel = w2.toLowerCase() === wl;
      return "<span class='dsvw' data-w='" + esc(w2) + "' data-en='" + esc(w2.toLowerCase()) + "' " +
        "style='cursor:pointer;border-radius:3px;padding:0 1px;" +
        (sel ? "background:hsl(45 92% 60% / .5);color:#1a1030;font-weight:600" : "") + "'>" + esc(w2) + "</span>";
    });
    /* interlinear — the original Hebrew/Greek, hover to match the English, tap to study */
    var toks = (il && il.tokens) || [];
    var ilHtml = "";
    if (toks.length) {
      ilHtml = "<div style='font:700 12px system-ui;color:#c9a86a;letter-spacing:.04em;margin:10px 0 4px'>Interlinear — hover to match, tap to study</div>" +
        "<div dir='auto' style='display:flex;flex-wrap:wrap;gap:8px 10px'>" +
        toks.map(function (t, i) {
          return "<span class='dsvo' data-i='" + i + "' data-en='" + esc((t.en || "").toLowerCase()) + "' data-w='" + esc(t.en || "") + "' " +
            "title='" + esc((t.strongs || "") + (t.en ? " · " + t.en : "")) + "' " +
            "style='cursor:pointer;border-radius:6px;padding:2px 6px;background:hsl(262 30% 16% / .5);display:inline-flex;flex-direction:column;align-items:center'>" +
            "<span style='font-size:18px;color:#e9dcff'>" + esc(bareGlyph(t.original || "")) + "</span>" +
            "<span style='font-size:10px;opacity:.6'>" + esc(t.en || "") + "</span></span>";
        }).join("") + "</div>";
    }
    var ws = "";
    if (glyph) ws += "<div style='font-size:22px;margin:2px 0;color:#e9dcff'>" + esc(glyph) +
      (lang ? " <span style='opacity:.5;font-size:12px'>" + esc(lang) + (s0 && s0.id ? " · " + esc(s0.id) : "") + "</span>" : "") + "</div>";
    if (s0 && s0.definition && s0.definition.toLowerCase() !== wl)
      ws += "<div style='margin:4px 0;line-height:1.5'>" + esc(s0.definition) + "</div>";
    var senses = (wd && wd.senses) || [];
    if (senses.length) ws += "<ol style='margin:4px 0 0;padding-left:18px'>" + senses.slice(0, 6).map(function (sx) {
      var pos = sx.pos ? "<i style='opacity:.55'>" + esc(sx.pos) + ".</i> " : "";
      return "<li style='margin:3px 0;line-height:1.45'>" + pos + esc(sx.gloss || sx.def || sx.text || (typeof sx === "string" ? sx : "")) + "</li>";
    }).join("") + "</ol>";
    card.innerHTML = "<div class='ybds' style='padding:12px 4px'>" +
      "<div style='font:700 13px system-ui;color:#c9a86a;letter-spacing:.05em;margin-bottom:6px'>" + esc(book) + " " + ch + ":" + verse + "</div>" +
      "<div style='line-height:1.85;font-size:16px;margin-bottom:6px'>" + verseHtml + "</div>" +
      ilHtml +
      "<div style='font:700 15px system-ui;color:#f3e8c8;margin:14px 0 2px'>" + esc((wd && wd.word) || word) + "</div>" +
      ws + lettersHtml("Hebrew letters", heb) + lettersHtml("Greek letters", grk) +
      lettersHtml("Aramaic (Syriac)" + (aram && aram.aramaic ? " · " + esc(aram.aramaic) : ""), aram) +
      "</div>";
    /* hover-link: highlight the matching English word and its original together */
    var setHL = function (en, on) {
      if (!en) return;
      card.querySelectorAll(".dsvw,.dsvo").forEach(function (x) {
        if ((x.dataset.en || "") === en) { x.style.outline = on ? "2px solid #c9a86a" : ""; x.style.outlineOffset = on ? "1px" : ""; }
      });
    };
    card.querySelectorAll(".dsvw").forEach(function (el) {
      el.onclick = function () { deepStudyView(book, ch, verse, el.dataset.w); };
      el.onmouseenter = function () { setHL(el.dataset.en, true); };
      el.onmouseleave = function () { setHL(el.dataset.en, false); };
    });
    card.querySelectorAll(".dsvo").forEach(function (el) {   // click an original word → its in-depth study
      el.onclick = function () { if (el.dataset.w) deepStudyView(book, ch, verse, el.dataset.w); };
      el.onmouseenter = function () { setHL(el.dataset.en, true); };
      el.onmouseleave = function () { setHL(el.dataset.en, false); };
    });
  }
  window.YBDEEP = deepStudyView;
  function addStudyBtn(pop, el, w) {
    if (!pop || !pop.isConnected) return;
    var st = document.createElement("button");
    st.textContent = "📖 Study in the verse";
    st.style.cssText = "margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid #c9a86a55;" +
      "background:#2a2050;color:#f3e8c8;cursor:pointer;font:600 13px system-ui";
    st.onclick = function () {
      var v = verseOf(el); pop.remove();
      deepStudyView((window.STATE && STATE.book) || "", (window.STATE && STATE.chapter) || 1, v, w);
    };
    pop.appendChild(st);
  }

  function studyWord(el) {
    var w = (el.textContent || "").trim().replace(/[^\w'֐-׿Ͱ-Ͽ-]/g, "");
    if (!w) return;
    var q = "/api/word?w=" + encodeURIComponent(w);       // the handler reads `w`, not `word`
    /* pass the verse too: with book+chapter+verse the lookup is context-aware and
       returns the ORIGINAL tongue of the passage (Hebrew for the OT/Torah), so the
       pop-up leads with the right language instead of a generic Greek-first entry */
    try { if (STATE && STATE.book) q += "&book=" + encodeURIComponent(STATE.book) + "&chapter=" + (STATE.chapter || 1) + "&verse=" + verseOf(el); } catch (e) {}
    var pop = popupFor(el);
    var live = function () { return pop && pop.isConnected; };
    fetch(q).then(function (r) { return r.json(); }).then(function (d) {
      if (!live()) return;
      if (hasContent(d)) { pop.innerHTML = renderWord(w, d); addStudyBtn(pop, el, w); return; }
      /* no original-language study — fall back to the plain English dictionary so
         ordinary words still get a definition */
      return fetch("/api/english?w=" + encodeURIComponent(w)).then(function (r) { return r.json(); })
        .then(function (e) {
          if (!live()) return;
          if (e && e.found && ((e.senses && e.senses.length) || e.definition)) { pop.innerHTML = renderWord(w, e); addStudyBtn(pop, el, w); return; }
          var fg = FUNCTION_GLOSS[w.toLowerCase()];
          if (fg) pop.innerHTML = "<div style='font:700 15px system-ui;margin-bottom:4px;color:#f3e8c8'>" + esc(w) +
            "</div><div style='line-height:1.5'>" + esc(fg) + "</div>";
          else pop.innerHTML = "<div style='opacity:.6'>No definition found for “" + esc(w) + "”.</div>";
          addStudyBtn(pop, el, w);
        });
    }).catch(function () { if (live()) pop.innerHTML = "<div style='opacity:.6'>No definition found.</div>"; });
  }

  /* ---- click interception (capture, so it precedes the page handlers) ---- */
  document.addEventListener("click", function (e) {
    var w = e.target.closest && e.target.closest(".w,.origtok");
    if (w) {
      if (mode() === "popup") { e.preventDefault(); e.stopImmediatePropagation(); studyWord(w); }
      return;                     /* panel mode: let the page open the study menu */
    }
    /* (A) a bare verse in a no-study source must not open the right drawer */
    var vn = e.target.closest && e.target.closest(".vn");
    if (vn && !hasStudy()) {
      var f = document.querySelector(".frame");
      if (f) setTimeout(function () { f.classList.remove("mright"); }, 0);
    }
  }, true);
})();
