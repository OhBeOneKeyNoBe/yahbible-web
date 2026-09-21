/* YahBible — The Gauntlet, client-side.
   The 100 vetted, Christ-first apologetics rounds, matched and presented in the browser
   with NO backend — so realizeus.org answers the internet's hardest questions about
   Christianity offline. Mirrors taviel_apologetics.py (idf match + phrase boosts + varied
   presentation): same question, fresh framing each call, scripture kept exact.
   Exposes window.YBgauntletAnswer(query) -> {round, answer} | null. */
(function () {
  "use strict";
  var KB = null, IDF = null, READY = false;
  var QSTOP = (" the a an and or but if is are was were be been being to of in on at for with " +
    "this these those it its as by from your you i he she they we our do does did just even " +
    "really about what why how who when where which than then not no have has had will would " +
    "should could can may might must actually anyone ").trim().split(/\s+/);
  var QSET = {}; QSTOP.forEach(function (w) { QSET[w] = 1; });

  // distinctive phrases that pin collision-prone rounds (mirror of _BOOST)
  var BOOST = {
    5: ["equal with god", "co-equal", "coequal", "is jesus god", "deity of christ"],
    6: ["take our punishment", "penal", "wrath", "satisfy god", "punishment for us", "took the punishment"],
    12: ["resurrection", "risen", "rose from the dead", "rise from the dead", "empty tomb", "easter"],
    18: ["who made god", "who created god", "made god", "first cause", "uncaused", "needs a cause"],
    20: ["prove he exists", "prove god", "show himself", "make himself obvious", "why doesnt god just"],
    25: ["gay", "homosexual", "homosexuality", "same sex", "lgbt"],
    27: ["televangelist", "prosperity preacher", "church wants my money", "church wants your money", "seed money", "tithe"],
    33: ["why did jesus have to die", "why the cross", "just forgive", "why die", "cross at all", "necessary"],
    53: ["before he was born", "pre-exist", "preexist", "exist before", "pre-existence"],
    56: ["lose your salvation", "lose salvation", "once saved", "eternal security"],
    59: ["go to church", "have to go to church", "church attendance", "attend church"],
    65: ["right after you die", "after death", "after you die", "intermediate"],
    66: ["pets", "dog", "animals go to heaven", "see my dog", "do animals"],
    77: ["rich people", "get into heaven", "camel", "needle", "can the rich"],
    89: ["did jesus exist", "exist historically", "historical jesus", "mythicist", "jesus even exist", "real person"],
    96: ["rich and healthy", "prosperity gospel", "health and wealth", "everyone rich"],
    98: ["cremation", "cremated", "ashes"],
    99: ["what must i do", "to be saved", "how to be saved", "how do i get saved", "get saved"],
    100: ["why should i care", "why does it matter", "whats the point", "so what", "difference would jesus", "care about jesus"]
  };

  var INTROS = ["Hear the words of Christ Himself on this:", "The Lord settled this in His own words:",
    "Begin where truth begins — with what Yeshua said:", "Consider what the Christ directly declared:",
    "Yeshua did not leave this unanswered:", "Weigh His own words first:"];
  var RLEADS = ["", "Reason it out: ", "Here is the heart of it: ", "So weigh it plainly: ", "And the sense of it: "];
  var BRIDGES = ["And His own words bear it out:", "Christ said it Himself:", "Hear the Lord on it:",
    "His words are the measure:"];

  function norm(s) {
    return " " + String(s || "").toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9' ]+/g, " ") + " ";
  }
  function tok(s) {
    var out = [], seen = {};
    (String(s || "").toLowerCase().replace(/’/g, "'").match(/[a-z']+/g) || []).forEach(function (w) {
      w = w.replace(/^'+|'+$/g, "");
      if (w.length >= 3 && !QSET[w] && !seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out;
  }
  function firstSentence(s) { var m = String(s || "").split(/(?<=[.!?])\s/); return m[0] || s; }

  function buildIdf() {
    var df = {}, i, j;
    for (i = 0; i < KB.length; i++) {
      var seen = {}, ws = KB[i].words || [];
      for (j = 0; j < ws.length; j++) { if (!seen[ws[j]]) { seen[ws[j]] = 1; df[ws[j]] = (df[ws[j]] || 0) + 1; } }
    }
    IDF = {}; var n = Math.max(1, KB.length);
    for (var w in df) IDF[w] = Math.log((n + 1) / (df[w] + 1)) + 1.0;
  }

  function best(query) {
    if (!KB) return null;
    var qtok = {}; tok(query).forEach(function (w) { qtok[w] = 1; });
    var qn = norm(query), top = null, topS = 0, second = 0;
    for (var i = 0; i < KB.length; i++) {
      var e = KB[i], words = {}, qwords = {}, s = 0, w;
      (e.words || []).forEach(function (x) { words[x] = 1; });
      (e.keys || []).forEach(function (x) { qwords[x] = 1; });
      for (w in qtok) if (words[w]) s += (IDF[w] || 1.0) * (qwords[w] ? 2.0 : 1.0);
      var ph = BOOST[e.n] || [];
      for (var k = 0; k < ph.length; k++) if (qn.indexOf(" " + ph[k]) >= 0) s += 6.0;
      if (s > topS) { second = topS; topS = s; top = e; }
      else if (s > second) { second = s; }
    }
    return { entry: top, score: topS };
  }

  function present(e, seed) {
    var r = mulberry(seed >>> 0);
    var sayings = (e.sayings || []).slice(), reason = e.reason || "";
    if (!sayings.length) return e.argument || "";
    var depth = pick(r, ["full", "full", "short"]);
    function render(s) {
      var line = 'Yeshua said, ' + s.quote + ' (' + s.ref + ').';
      line += " " + ((depth === "full" && s.expo) ? s.expo : firstSentence(s.expo || ""));
      return line;
    }
    var framing = pick(r, ["sayings_first", "reason_bookend", "strongest_first"]), blocks = [];
    if (framing === "reason_bookend" && reason) {
      blocks = [pick(r, RLEADS) + reason, pick(r, BRIDGES)].concat(sayings.map(render));
    } else if (framing === "strongest_first") {
      var order = sayings.slice(); shuffle(r, order);
      blocks = [pick(r, INTROS), render(order[0])].concat(order.slice(1).map(render));
      if (reason) blocks.push(pick(r, RLEADS) + reason);
    } else {
      blocks = [pick(r, INTROS)].concat(sayings.map(render));
      if (reason) blocks.push(pick(r, RLEADS) + reason);
    }
    return blocks.filter(Boolean).join("\n\n");
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function shuffle(r, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } }

  window.YBgauntletAnswer = function (query, threshold) {
    if (!READY || !KB) return null;
    // Confidence floor (mirrors taviel_apologetics.gauntlet_entry). The gauntlet is a vetted
    // OBJECTION KB, not a catechism: it must only fire on a confident match, else defer to the
    // grounded answer. Measured: real matches score >= ~4.9, but a broad definitional query like
    // "who is God" / "what is God" scores ~2.5 on common words and used to squeak past 2.0 --
    // serving the unrelated round 2 (why God allows suffering). A 4.0 floor lets those defer.
    threshold = (threshold === undefined) ? 4.0 : threshold;
    var b = best(query);
    if (!b || !b.entry || b.score < threshold) return null;
    var seed = (Math.random() * 2e9) | 0;
    return { round: b.entry.n, answer: present(b.entry, seed) };
  };
  window.YBgauntletReady = function () { return READY; };

  (function load() {
    fetch("static_api/gauntlet_kb.json").then(function (r) { return r.json(); }).then(function (data) {
      KB = data; buildIdf(); READY = true;
    }).catch(function () { KB = null; READY = false; });
  })();
})();
