/* YahBible Web — word study / Strong's / interlinear / deep-study handlers.
   A faithful JS port of the desktop server's lexicon layer, running against the
   reflected_red_basic + english_dict + elaniel_yt packs in OPFS, with the
   openscriptures Strong's json + precomputed name-study maps as the always-on
   fallback (same degradation order as the desktop). */
"use strict";
(function () {
  const H = window.YBH, Q = window.YBWEB.Q, APPBASE = window.YBWEB.base;
  const realFetch = window.fetch;   // already patched; static_api is same-origin passthrough
  const J = (obj, code) => new Response(JSON.stringify(obj), {
    status: code || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });

  /* ---------- static table cache ---------- */
  const CACHE = {};
  async function tbl(name) {
    if (CACHE[name]) return CACHE[name];
    const r = await realFetch(APPBASE + "static_api/" + name + ".json");
    CACHE[name] = await r.json();
    return CACHE[name];
  }

  /* ---------- text helpers (ports) ---------- */
  function cleanMarkup(t) {
    if (!t) return t;
    t = String(t)
      .replace(/<ref[^>]*>([\s\S]*?)<\/ref>/gi, "$1")
      .replace(/<\s*br\s*\/?\s*>/gi, " — ")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .replace(/\s*__+\s*/g, " ")
      .replace(/[†‡]/g, "")
      .replace(/\(\s*(AS|Rec\.?|Tr\.?|WH|L|LXX only)\s*\)\s*$/, "")
      .replace(/^\s*(?:—\s*)+/, "")
      .replace(/\s+([;,.:])/g, "$1")
      .replace(/(—\s*)+$/, "");
    return t.replace(/\s{2,}/g, " ").trim();
  }
  function glossFrom(rec) {
    if (!rec) return [null, ""];
    rec = rec.trim();
    if (!rec.startsWith("{")) {
      if (rec.includes("\t")) {
        const parts = rec.split("\t");
        for (let i = 0; i < parts.length; i++) {
          if (/^[HG]:/.test(parts[i].trim())) {
            const tail = parts.slice(i + 1).map((x) => x.trim()).filter(Boolean);
            if (tail.length)
              return [cleanMarkup([...new Set(tail)].join(" ; ").slice(0, 400)) || null,
                      parts[i].trim()];
            break;
          }
        }
      }
      return [cleanMarkup(rec.slice(0, 400)) || null, ""];
    }
    let j = {};
    try { j = JSON.parse(rec); } catch (e) { return [null, ""]; }
    const pos = (j.part_of_speech || j.pos || "").trim();
    const d = j.definition || j.strongs_def || j.meaning;
    if (d && String(d).trim()) return [cleanMarkup(String(d).trim()), pos];
    const gl = [];
    for (const s of j.senses || []) for (const g of s.glosses || []) if (g && !gl.includes(g)) gl.push(g);
    for (const g of j.glosses || []) if (g && !gl.includes(g)) gl.push(g);
    if (gl.length) return [cleanMarkup(gl.slice(0, 3).join("; ")), pos];
    return [null, pos];
  }
  const normLang = (l) => (l || "").toLowerCase().split("-")[0].trim();
  const looksLikeNamedb = (g) => /@[A-Za-z]{2,3}\.\d|=[GH]\d{2,}/.test(g || "");
  const origScript = (g) => [...(g || "")].some((c) => (c >= "֐" && c <= "׿") || (c >= "Ͱ" && c <= "Ͽ") || (c >= "ἀ" && c <= "῿"));
  function looksLikeMorph(rec) {
    if (!rec) return false;
    const r = rec.trim();
    if (r.startsWith("{")) return false;
    return r.includes("¦") || r.includes("=Q(") || r.includes(" L= ") || r.includes(" K= ") || /#\d+=/.test(r);
  }
  const isStub = (g) => {
    g = (g || "").trim().toLowerCase();
    return /^(a\s+)?(plural|pl\.?|sing(ular)?\.?|variant|var\.?|form|inflection|see|cf\.?|compare)\b/.test(g) && g.length < 60;
  };
  const fold = (w) => (w || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  const ng = (g) => g ? g.replace(/[/\\|־׀׃]/g, "").trim() : g;
  function variantKey(w) {
    let s = (w || "").toLowerCase().replace(/[^a-z]/g, "");
    if (s.length < 3) return "";
    s = s.replace(/ph/g, "f").replace(/th/g, "t").replace(/sh/g, "S").replace(/ch/g, "K");
    s = s.replace(/[vw]/g, "b").replace(/[kqc]/g, "K").replace(/[zx]/g, "s").replace(/j/g, "y");
    s = s.replace(/h/g, "");
    const head = s[0] || "", rest = s.slice(1).replace(/[aeiouy]/g, "");
    return (head + rest).replace(/(.)\1+/g, "$1");
  }
  function singularCandidates(w) {
    w = (w || "").toLowerCase();
    const out = [];
    if (w.endsWith("'s") || w.endsWith("’s")) out.push(w.slice(0, -2));
    if ((w.endsWith("'") || w.endsWith("’")) && w.length > 3) out.push(w.slice(0, -1));
    if (w.endsWith("ies") && w.length > 4) out.push(w.slice(0, -3) + "y");
    if (w.endsWith("es") && w.length > 3) out.push(w.slice(0, -2));
    if (w.endsWith("s") && w.length > 3) out.push(w.slice(0, -1));
    if (w.endsWith("e") && w.length > 3) out.push(w.slice(0, -1));
    if (w.endsWith("im") && w.length > 4) out.push(w.slice(0, -2));
    if (w.endsWith("oth") && w.length > 4) out.push(w.slice(0, -3));
    return [...new Set(out)];
  }

  /* openscriptures Strong's (fallback dictionary) */
  async function ext(sid) {
    const S = await tbl("taviel_strongs");
    if (!sid) return {};
    const m = /^([HG])0*(\d+)/i.exec(sid.trim());
    const key = m ? m[1].toUpperCase() + m[2] : sid;
    return S[key] || {};
  }
  async function extDef(sid) {
    const e = await ext(sid);
    return cleanMarkup(((e.def || e.kjv) || "").trim());
  }

  /* glossaries */
  async function glossarySense(w) {
    const G = await tbl("gnostic_glossary");
    const g = G[(w || "").toLowerCase().trim()];
    if (g) return { pos: g.type || "gnostic term", gloss: g.def || g.definition || "", lang: "Gnostic" };
    return apocGlossarySense(w);
  }
  let APOC = null;
  async function apocData() {
    if (APOC) return APOC;
    const d = await tbl("glossary");
    const gloss = {}, varidx = {}, aliases = {};
    for (const [k, v] of Object.entries(d.gloss || {})) {
      if (!(k.toLowerCase() in gloss)) gloss[k.toLowerCase()] = v;
      if (!(fold(k) in gloss)) gloss[fold(k)] = v;
      const vk = variantKey(k);
      if (vk && !(vk in varidx)) varidx[vk] = [k.toLowerCase(), v];
    }
    for (const [k, v] of Object.entries(d.aliases || {})) aliases[k.toLowerCase()] = String(v).toLowerCase();
    APOC = { gloss, varidx, aliases };
    return APOC;
  }
  async function isEnglishWord(w) {
    const r = await Q("english", "SELECT 1 FROM english WHERE word=? LIMIT 1", [w]);
    return r.length > 0;
  }
  async function apocGlossarySense(w) {
    const A = await apocData();
    const lw = A.aliases[(w || "").toLowerCase().trim()] || (w || "").toLowerCase().trim();
    let g = A.gloss[lw], note = "";
    if (!g && !(await isEnglishWord(lw))) {
      g = A.gloss[fold(w)];
      if (!g) {
        const hit = A.varidx[variantKey(lw)] || A.varidx[variantKey(fold(w))];
        if (hit && hit[0] !== lw) { g = hit[1]; note = "(as the spelling “" + hit[0] + "”) "; }
      }
    }
    if (!g) return null;
    return { pos: g.type || "term", gloss: note + (g.def || ""), lang: "Ethiopian" };
  }

  /* ---------- english dictionary ---------- */
  async function englishDef(word) {
    const w = (word || "").toLowerCase().trim();
    if (!w) return { found: false };
    let row = await Q("english", "SELECT defs FROM english WHERE word=?", [w]);
    if (!row.length) {
      const alts = [];
      if (w.endsWith("ies")) alts.push(w.slice(0, -3) + "y");
      if (w.endsWith("es")) alts.push(w.slice(0, -2));
      if (w.endsWith("s")) alts.push(w.slice(0, -1));
      for (const a of alts) {
        row = await Q("english", "SELECT defs FROM english WHERE word=?", [a]);
        if (row.length) break;
      }
    }
    if (!row.length) return { found: false, word };
    let items = [];
    try { items = JSON.parse(row[0][0]); } catch (e) {}
    return { found: true, word, english: true, originals: [], strongs: [],
             senses: items.map((it) => ({ pos: it.pos || "", gloss: it.def || "", lang: "English" })) };
  }

  /* ---------- lexicon core ---------- */
  const LANG_NAME_P = tbl("tables");
  async function LN(nl, fallback) {
    const T = await LANG_NAME_P;
    return T.lang_name[nl] || fallback || nl || "?";
  }
  async function originalFor(strongAddr) {
    const r = await Q("lex",
      "SELECT n.source_id,n.canonical_lemma FROM lexical_routes r JOIN lexical_nodes n" +
      " ON n.address24=r.source_address24 WHERE r.target_address24=? AND" +
      " r.relation_type='strongs' LIMIT 1", [strongAddr]);
    return r.length ? r[0] : null;
  }
  async function fallbackSenses(w) {
    for (const cand of singularCandidates(w)) {
      const sub = await wordLookup(cand, false);
      const subs = (sub || {}).senses || [];
      if (subs.length)
        return subs.map((s) => ({ ...s, gloss: "(plural/variant of “" + cand + "”) " + (s.gloss || "") }));
    }
    return [];
  }
  async function wordLookup(w, fb) {
    if (fb === undefined) fb = true;
    const T = await tbl("tables");
    const keep = new Set(T.keep_lang);
    const rows = await Q("lex",
      "SELECT address24,node_type,source_id,language,source_record FROM lexical_nodes" +
      " INDEXED BY idx_nodes_lemma WHERE canonical_lemma=? LIMIT 60", [w]);
    if (!rows.length) {
      const gs = await glossarySense(w);
      let senses0 = gs ? [gs] : [];
      if (fb && !senses0.length) senses0 = await fallbackSenses(w);
      if (senses0.length)
        return { found: true, word: w, address24: null, originals: [], strongs: [], senses: senses0 };
      return { found: false, word: w };
    }
    const addr = rows[0][0];
    let strongs = [], senses = [];
    const seenGloss = new Set();
    for (const [a, nt, sid, lang, rec] of rows) {
      const nl = normLang(lang);
      const [gloss, pos] = glossFrom(rec);
      if (nt === "strongs_entry") {
        const sidNum = sid.split(":").pop();
        strongs.push({ id: sidNum, addr: a, language: await LN(nl), pos,
                       definition: gloss || (await extDef(sidNum)) });
        continue;
      }
      if (!keep.has(nl)) continue;
      if (!gloss || looksLikeNamedb(gloss) || looksLikeMorph(rec)) continue;
      const key = gloss.toLowerCase().slice(0, 60);
      if (seenGloss.has(key)) continue;
      seenGloss.add(key);
      senses.push({ pos, gloss, lang: await LN(nl, nl) });
      if (senses.length >= 8) break;
    }
    if (!strongs.length) {
      for (const [a, sid, lang, rec] of await Q("lex",
        "SELECT address24,source_id,language,source_record FROM lexical_nodes" +
        " INDEXED BY idx_nodes_lemma WHERE canonical_lemma=? AND node_type='strongs_entry'" +
        " LIMIT 8", [w])) {
        const [g, pos] = glossFrom(rec);
        strongs.push({ id: sid.split(":").pop(), addr: a, language: await LN(normLang(lang), lang || "?"),
                       pos, definition: g || (await extDef(sid.split(":").pop())) });
      }
    }
    const ded = [], sids = new Set(), originals = [];
    strongs.sort((a, b) => (a.id.startsWith("H") ? 0 : 1) - (b.id.startsWith("H") ? 0 : 1));
    for (const s of strongs) {
      if (sids.has(s.id)) continue;
      sids.add(s.id);
      const tok = await originalFor(s.addr);
      if (tok && origScript(tok[1])) {
        s.glyph = ng(tok[1]); s.sid = tok[0];
        originals.push({ glyph: ng(tok[1]), sid: tok[0], id: s.id, language: s.language });
      }
      if (looksLikeNamedb(s.definition || "")) s.definition = "";
      delete s.addr;
      ded.push(s);
    }
    const gs = await glossarySense(w);
    if (gs) senses = [gs, ...senses];
    if (fb && (!senses.length || senses.every((s) => isStub(s.gloss || ""))))
      senses = senses.concat(await fallbackSenses(w));
    return { found: true, word: w, address24: addr, originals, strongs: ded, senses };
  }
  async function strongsDetail(sid) {
    const src = sid.startsWith("makor:") ? sid : "makor:strong:" + sid;
    const row = await Q("lex",
      "SELECT source_id,language,source_record FROM lexical_nodes WHERE source_id=?", [src]);
    if (!row.length) {
      const e = await ext(sid);
      if (Object.keys(e).length)
        return { found: true, id: sid, language: sid[0].toUpperCase() === "H" ? "Hebrew" : "Greek",
                 lemma: e.lemma || "", translit: e.x || "", pos: "", pronounce: e.p || "",
                 definition: cleanMarkup(e.def || e.kjv || ""), derivation: "" };
      return { found: false, id: sid };
    }
    const [sourceId, language, rec] = row[0];
    let j = {};
    try { j = rec && rec.trim().startsWith("{") ? JSON.parse(rec) : {}; } catch (e) {}
    const [gloss, pos] = glossFrom(rec);
    const sidNum = sourceId.split(":").pop();
    const e = await ext(sidNum);
    return { found: true, id: sidNum, language: await LN(normLang(language), language || "?"),
             lemma: j.lemma || e.lemma || "",
             translit: j.translit || j.xlit || e.x || "",
             pos: pos || j.part_of_speech || "",
             pronounce: j.pronounce || e.p || "",
             definition: cleanMarkup(gloss || e.def || e.kjv || ""),
             derivation: cleanMarkup(j.derivation || "") };
  }

  /* ---------- Hebrew letters + romanization (ports) ---------- */
  const HEB_LETTERS = { "א":["Aleph","ox — strength, leader, the first, God"],"ב":["Bet","house — household, family, in, within"],"ג":["Gimel","camel — to lift up, pride, to walk, benefit"],"ד":["Dalet","door — pathway, to enter, to move, hang"],"ה":["He","behold! — window, to reveal, breath, the"],"ו":["Vav","nail/hook — and, to add, to secure, connect"],"ז":["Zayin","weapon — to cut, sword, nourishment, harvest"],"ח":["Chet","wall/fence — to separate, protect, private, inner room"],"ט":["Tet","basket — to surround, contain, mud, to twist"],"י":["Yod","hand/arm — deed, work, to make, worship"],"כ":["Kaf","open palm — to cover, to allow, to bend, to tame"],"ל":["Lamed","shepherd's staff — to teach, to lead, authority, toward"],"מ":["Mem","water — chaos, mighty, blood, nations, from"],"נ":["Nun","seed/fish — life, activity, continuation, heir, offspring"],"ס":["Samekh","prop/support — to lean, to uphold, to twist, protect"],"ע":["Ayin","eye — to see, to know, to experience, to watch, fountain"],"פ":["Pe","mouth — to speak, word, to open, to blow, edge"],"צ":["Tsade","fish-hook — to catch, need, desire, the righteous, to pull"],"ק":["Qof","back of the head / horizon — behind, the least, to circle, time, holiness"],"ר":["Resh","head — person, the first/top, beginning, chief"],"ש":["Shin","teeth — to consume, to destroy, sharp, two, to press, Almighty"],"ת":["Tav","mark/sign — signature, covenant, monument, to seal, the end/completion"] };
  const FINALS = { "ך":"כ","ם":"מ","ן":"נ","ף":"פ","ץ":"צ" };
  const HEB_SOUND = { "א":"ʼ","ב":"b","ג":"g","ד":"d","ה":"h","ו":"v","ז":"z","ח":"kh","ט":"t","י":"y","כ":"k","ל":"l","מ":"m","נ":"n","ס":"s","ע":"ʽ","פ":"p","צ":"ts","ק":"q","ר":"r","ש":"sh","ת":"t" };
  const GRK_SOUND = { "α":"a","β":"b","γ":"g","δ":"d","ε":"e","ζ":"z","η":"e","θ":"th","ι":"i","κ":"k","λ":"l","μ":"m","ν":"n","ξ":"x","ο":"o","π":"p","ρ":"r","σ":"s","ς":"s","τ":"t","υ":"u","φ":"ph","χ":"ch","ψ":"ps","ω":"o" };
  const VOWELS = { "ְ":"e","ֱ":"e","ֲ":"a","ֳ":"o","ִ":"i","ֵ":"e","ֶ":"e","ַ":"a","ָ":"a","ֹ":"o","ֺ":"o","ֻ":"u","ׇ":"o" };
  const DAGESH = "ּ", SIN_DOT = "ׂ";
  const HEB_CONS = { "ג":"g","ד":"d","ה":"h","ז":"z","ח":"kh","ט":"t","י":"y","ל":"l","מ":"m","נ":"n","ס":"s","צ":"ts","ק":"q","ר":"r","ת":"t" };
  function hebGroups(word) {
    const groups = [];
    for (const ch of word || "") {
      const cc = ch.codePointAt(0);
      const base = FINALS[ch] || ch;
      if (base in HEB_LETTERS) groups.push([base, ch, []]);
      else if (cc >= 0x0591 && cc <= 0x05C7 && groups.length) groups[groups.length - 1][2].push(ch);
    }
    return groups;
  }
  function consonantSound(base, marks) {
    const dagesh = marks.includes(DAGESH);
    if (base === "ב") return dagesh ? "b" : "v";
    if (base === "כ") return dagesh ? "k" : "kh";
    if (base === "פ") return dagesh ? "p" : "f";
    if (base === "ש") return marks.includes(SIN_DOT) ? "s" : "sh";
    if (base === "א" || base === "ע") return "";
    if (base === "ו") {
      if (dagesh && !marks.some((m) => m in VOWELS)) return "u";
      if (marks.includes("ֹ") || marks.includes("ֺ")) return "o";
      return "v";
    }
    return HEB_CONS[base] || "";
  }
  function syllable(base, marks, idx) {
    let cs = consonantSound(base, marks);
    let vowels = marks.filter((m) => m in VOWELS).map((m) => VOWELS[m]).join("");
    if (base === "ו" && (cs === "o" || cs === "u")) vowels = "";
    if (base === "י" && !vowels && idx > 0) cs = "";
    return cs + vowels;
  }
  function translitHebrew(word) {
    const groups = hebGroups(word);
    const syl = groups.map(([b, , m], i) => syllable(b, m, i));
    return [syl.join(""), syl, groups];
  }
  function greekTranslit(word) {
    let out = [], rough = false, seenVowel = false;
    for (const ch of (word || "").normalize("NFD")) {
      const cc = ch.codePointAt(0);
      if (cc === 0x0314) { rough = true; continue; }
      if (cc >= 0x0300 && cc <= 0x036F) continue;
      const low = ch.toLowerCase();
      if (low in GRK_SOUND) {
        if (rough && !seenVowel && "αεηιουω".includes(low)) { out.push("h"); rough = false; }
        out.push(GRK_SOUND[low]);
        if ("αεηιουω".includes(low)) seenVowel = true;
      }
    }
    return out.join("");
  }
  function romanize(word) {
    const [full, , groups] = translitHebrew(word);
    return groups.length ? full : greekTranslit(word);
  }
  function hebrewLetters(word) {
    const [, syl, groups] = translitHebrew(word);
    return groups.map(([base, orig], i) => ({
      letter: orig, name: HEB_LETTERS[base][0], meaning: HEB_LETTERS[base][1],
      sound: HEB_SOUND[base] || "", syllable: syl[i], final: orig in FINALS }));
  }

  /* ---------- interlinear ---------- */
  const firstWords = (t, n) => (t || "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");
  function kjvForms(raw) {
    if (!raw) return [];
    const words = raw.match(/[A-Za-z]+/g) || [];
    for (const m of raw.matchAll(/([A-Za-z]{2,})\(-?([A-Za-z]{2,10})/g)) words.push(m[1] + m[2]);
    for (const m of raw.matchAll(/\(((?:[A-Za-z]+-[,\s]*){1,6})\)([A-Za-z]{2,})/g))
      for (const p of m[1].matchAll(/([A-Za-z]+)-/g)) words.push(p[1] + m[2]);
    return words;
  }
  const glyphBare = (lemma) => (lemma || "").trim().split(/\s*\(/)[0].trim().normalize("NFC");
  async function interlinear(book, ch, verse) {
    const T = await tbl("tables");
    let verseWords = new Set(), verseSeq = [], verseText = "";
    const wr = await Q("watchman",
      "SELECT text FROM verses WHERE book=? AND chapter=? AND verse=?", [book, ch, verse]);
    if (wr.length && wr[0][0]) verseText = wr[0][0];
    if (!verseText && typeof window !== "undefined" && window.YBSTORE && window.YBSTORE.mode) {
      try {                                        // iPhone: the per-book store always has the verse
        const cd = await window.YBSTORE.chapter(book, ch, "KJV");
        const v = ((cd && cd.verses) || []).find((x) => +x.verse === +verse);
        if (v) verseText = v.text;
      } catch (e) {}
    }
    if (verseText) {
      verseSeq = (verseText.match(/[A-Za-z]+/g) || []);
      verseWords = new Set(verseSeq.map((w) => w.toLowerCase()));
    }
    const abbr = T.abbr_map[book] || book.slice(0, 3);
    const lo = "step:" + abbr + "." + ch + "." + verse + "#";
    const hi = "step:" + abbr + "." + ch + "." + verse + "$";
    const rows = await Q("lex",
      "SELECT address24,source_id,canonical_lemma,language FROM lexical_nodes" +
      " WHERE source_id>=? AND source_id<? ORDER BY source_id LIMIT 60", [lo, hi]);
    const KJV_STOP = new Set(T.kjv_stop);
    const toks = [];
    for (const [addr, sid, lemma, lang] of rows) {
      let gloss = "", sidNum = "", en = "";
      const routes = await Q("lex",
        "SELECT target_address24 FROM lexical_routes WHERE source_address24=? AND" +
        " relation_type='strongs' LIMIT 8", [addr]);
      let best = null, bestContent = false;
      for (const [taddr] of routes) {
        const sr = await Q("lex",
          "SELECT source_id,canonical_lemma,source_record FROM lexical_nodes WHERE address24=?",
          [taddr]);
        if (!sr.length) continue;
        const sn = sr[0][0].split(":").pop();
        const content = !/^[HG]9\d{3}$/.test(sn);
        if (best === null || (content && !bestContent)) { best = sr[0]; bestContent = content; }
        if (content) break;
      }
      if (best) {
        sidNum = best[0].split(":").pop();
        en = best[1] || "";
        const [g] = glossFrom(best[2]);
        gloss = firstWords(g, 6);
        if (!en || /^[HG]?\d+$/i.test(en.trim()))
          en = firstWords((g || "").replace(/^[\s\d).\-]+/, ""), 4);
        if (!en) en = firstWords(((await ext(sidNum)).def || "").replace(/^[\s\d).\-]+/, ""), 4);
        if (!gloss) gloss = await extDef(sidNum);
      }
      const ov = (T.strong_overrides || {})[glyphBare(lemma)];
      if (ov) {
        sidNum = ov.sid || sidNum;
        en = ov.en || en;
        gloss = (await extDef(sidNum)) || gloss;
      }
      const kw = sidNum ? kjvForms((await ext(sidNum)).kjv || "") : [];
      /* Align to the ACTUAL KJV word(s) in this verse: the longest consecutive run
         of verse words all in this Strong's KJV-usage set (so מִנְחָה → "meat
         offering", כִּי → "when"), preferring a run that has a content word. */
      const kwSet = new Set(kw.map((w) => w.toLowerCase()));
      let bestRun = "", bestScore = -1;
      for (let i = 0; i < verseSeq.length;) {
        if (!kwSet.has(verseSeq[i].toLowerCase())) { i++; continue; }
        const run = [];
        while (i < verseSeq.length && kwSet.has(verseSeq[i].toLowerCase()) && run.length < 3) { run.push(verseSeq[i]); i++; }
        const hasContent = run.some((w) => !KJV_STOP.has(w.toLowerCase()));
        if (!hasContent) continue;                 // skip pure stop-word runs (e.g. a stray "And")
        const score = run.join(" ").length;
        if (score > bestScore) { bestScore = score; bestRun = run.join(" "); }
      }
      if (bestRun) en = bestRun;
      /* never show a Strong's gloss FRAGMENT as the aligned word */
      if (!en || /^\s*\(|very widely|by implication|relative conjunction/i.test(en))
        en = kw[0] || firstWords(gloss, 3) || ng(lemma);
      toks.push({ original: ng(lemma), lemma: ng(lemma), lang, sid, strongs: sidNum, gloss, en,
                  kjv: kw.filter((w) => w.length > 1).slice(0, 100).join(" ") });
    }
    if (!toks.length) {
      /* the compact lexicon lacks this verse (e.g. Ezekiel, Psalms, Matthew 5:1-9);
         the canon-fill pack carries the complete interlinear crawled from the desktop.
         Reading it triggers an on-demand background install of that pack. */
      const ref = book + " " + ch + ":" + verse;
      const row = await Q("canonfill", "SELECT json FROM interlinear WHERE ref=?", [ref]);
      if (row.length) {
        try { return JSON.parse(row[0][0]); } catch (e) {}
      }
    }
    return { tokens: toks };
  }

  /* Resolve the token a step-sid points at, using the interlinear (which the
     canon-fill pack completes for every verse). The sid looks like
     "step:1Pe.5.5#20=NKO" — book.chapter.verse, then #<token-index>. */
  async function tokenForSid(sid) {
    const ref = await parseStepRef(sid);
    if (!ref) return null;
    let il = { tokens: [] };
    try { il = await interlinear(ref[0], ref[1], ref[2]); } catch (e) {}
    const toks = il.tokens || [];
    if (!toks.length) return null;
    let t = toks.find((x) => x.sid === sid);
    if (!t) {
      const m = /#(\d+)/.exec(sid);
      if (m) { const idx = +m[1]; t = toks.find((x) => { const mm = /#(\d+)/.exec(x.sid || ""); return mm && +mm[1] === idx; }); }
    }
    return t || null;
  }
  /* In-depth study assembled from the interlinear token — the fallback for when
     the compact lexicon lacks the per-occurrence node (most of the canon). */
  async function deepFromInterlinear(sid) {
    const t = await tokenForSid(sid);
    if (!t) return { found: false };
    const snum = t.strongs || "";
    const e = snum ? await ext(snum) : {};
    const strong = snum ? {
      id: snum, en: t.en || "", language: await LN(normLang(t.lang), t.lang || "?"),
      translit: e.x || "", pronounce: e.p || "", pos: "",
      definition: t.gloss || e.def || e.kjv || "",
    } : null;
    const letters = hebrewLetters(t.lemma || t.original || "");
    let uses = [];
    if (snum) { try { uses = (await usecases("", snum)).uses || []; } catch (e2) {} }
    return {
      found: true, word: ng(t.original || t.lemma || ""), language: await LN(normLang(t.lang), t.lang || ""),
      strongs: strong, uses, letters,
      pronounce: (strong && (strong.pronounce || strong.translit)) || romanize(t.lemma || ""),
      is_hebrew: letters.length > 0,
    };
  }
  async function originalFromInterlinear(sid) {
    const t = await tokenForSid(sid);
    if (!t) return { found: false };
    const snum = t.strongs || "";
    const e = snum ? await ext(snum) : {};
    const strongs = snum ? [{
      id: snum, language: await LN(normLang(t.lang), t.lang || "?"), pos: "",
      definition: t.gloss || e.def || e.kjv || "",
    }] : [];
    return {
      found: true, original: t.original || t.lemma || "", lang: await LN(normLang(t.lang), t.lang || ""),
      strongs, senses: t.gloss ? [{ gloss: t.gloss, pos: "", lang: "original" }] : [],
    };
  }

  /* ---------- deep study ---------- */
  let CODE2BOOK = null;
  async function code2book() {
    if (CODE2BOOK) return CODE2BOOK;
    const T = await tbl("tables");
    const inv = {};
    for (const [book, code] of Object.entries(T.abbr_map)) inv[code] = book;
    CODE2BOOK = inv;
    return inv;
  }
  async function parseStepRef(sid) {
    if (!sid || !sid.startsWith("step:")) return null;
    const core = sid.slice(5).split("#")[0];
    const parts = core.split(".");
    if (parts.length < 3) return null;
    const book = (await code2book())[parts[0]] || parts[0];
    const ch = parseInt(parts[1]), v = parseInt(parts[2]);
    if (isNaN(ch) || isNaN(v)) return null;
    return [book, ch, v];
  }
  async function usesForStrongAddr(saddr) {
    const uses = [], seen = new Set();
    for (const [srcAddr] of await Q("lex",
      "SELECT source_address24 FROM lexical_routes WHERE target_address24=? AND" +
      " relation_type='strongs' LIMIT 400", [saddr])) {
      const nd = await Q("lex", "SELECT source_id FROM lexical_nodes WHERE address24=?", [srcAddr]);
      if (!nd.length) continue;
      const ref = await parseStepRef(nd[0][0]);
      if (ref && !seen.has(ref.join("|"))) {
        seen.add(ref.join("|"));
        uses.push({ ref: ref[0] + " " + ref[1] + ":" + ref[2], book: ref[0], chapter: ref[1], verse: ref[2] });
      }
      if (uses.length >= 60) break;
    }
    return uses;
  }
  async function deepstudy(sid) {
    const row = await Q("lex",
      "SELECT address24,canonical_lemma,language,source_record FROM lexical_nodes WHERE source_id=?",
      [sid]);
    if (!row.length) return await deepFromInterlinear(sid);
    const [addr, lemma, lang] = row[0];
    const nl = normLang(lang);
    let strong = null, uses = [];
    const st = await Q("lex",
      "SELECT target_address24 FROM lexical_routes WHERE source_address24=? AND" +
      " relation_type='strongs' LIMIT 1", [addr]);
    if (st.length) {
      const saddr = st[0][0];
      const sr = await Q("lex",
        "SELECT source_id,canonical_lemma,language,source_record FROM lexical_nodes WHERE address24=?",
        [saddr]);
      if (sr.length) {
        let j = {};
        try { j = sr[0][3] && sr[0][3].trim().startsWith("{") ? JSON.parse(sr[0][3]) : {}; } catch (e) {}
        const [g, pos] = glossFrom(sr[0][3]);
        const snum = sr[0][0].split(":").pop();
        const e = await ext(snum);
        strong = { id: snum, en: sr[0][1] || "", language: await LN(normLang(sr[0][2]), sr[0][2] || "?"),
                   translit: j.translit || j.xlit || e.x || "",
                   pronounce: j.pronounce || j.pron || e.p || "",
                   pos: pos || j.part_of_speech || "",
                   definition: g || e.def || e.kjv || "" };
        uses = await usesForStrongAddr(saddr);
      }
    }
    const letters = hebrewLetters(lemma);
    const pron = (strong || {}).pronounce || (strong || {}).translit || romanize(lemma);
    return { found: true, word: ng(lemma), language: await LN(nl, lang), strongs: strong,
             uses, letters, pronounce: pron, is_hebrew: letters.length > 0 };
  }
  async function usecases(sid, strong) {
    if (sid) {
      const d = await deepstudy(sid);
      return { uses: d.uses || [] };
    }
    if (!strong) return { uses: [] };
    const sidkey = strong.startsWith("makor:strong:") ? strong : "makor:strong:" + strong.replace(/^:+/, "");
    const row = await Q("lex", "SELECT address24 FROM lexical_nodes WHERE source_id=?", [sidkey]);
    if (!row.length) return { uses: [] };
    return { uses: await usesForStrongAddr(row[0][0]) };
  }
  async function originalDef(sid) {
    const row = await Q("lex",
      "SELECT address24,canonical_lemma,language,source_record FROM lexical_nodes WHERE source_id=?",
      [sid]);
    if (!row.length) return await originalFromInterlinear(sid);
    const [addr, lemma, lang, rec] = row[0];
    let strongs = null;
    const st = await Q("lex",
      "SELECT target_address24 FROM lexical_routes WHERE source_address24=? AND" +
      " relation_type='strongs' LIMIT 1", [addr]);
    if (st.length) {
      const sr = await Q("lex",
        "SELECT source_id,language,source_record FROM lexical_nodes WHERE address24=?", [st[0][0]]);
      if (sr.length) {
        const [gloss, pos] = glossFrom(sr[0][2]);
        strongs = { id: sr[0][0].split(":").pop(), language: await LN(normLang(sr[0][1]), sr[0][1] || "?"),
                    pos, definition: gloss || "" };
      }
    }
    const [gloss, pos] = glossFrom(rec);
    return { found: true, original: lemma, lang: await LN(normLang(lang), lang),
             strongs: strongs ? [strongs] : [],
             senses: gloss ? [{ gloss, pos, lang: "original" }] : [] };
  }
  async function wordLookupCtx(w, book, ch, verse) {
    const wl = (w || "").toLowerCase().trim();
    if (book && ch && verse) {
      let il = { tokens: [] };
      try { il = await interlinear(book, parseInt(ch), parseInt(verse)); } catch (e) {}
      const N = (x) => (x || "").toLowerCase().replace(/[^a-z]/g, "");
      const tw = N(wl);
      let best = null;
      if (tw) {
        for (const t of il.tokens || []) {
          const en = N(t.en);
          const kjv = new Set((t.kjv || "").split(" ").map(N));
          if (en === tw || kjv.has(tw) ||
              (en && en.replace(/s+$/, "") === tw.replace(/s+$/, "") && Math.abs(en.length - tw.length) <= 1)) {
            best = t; break;
          }
        }
      }
      if (best && best.strongs) {
        const sidnum = best.strongs;
        const glyph = ng(best.original || best.lemma || "");
        const T = await tbl("tables");
        const lang = T.lang_name[normLang(best.lang)] || best.lang || "Hebrew";
        const det = await strongsDetail(sidnum);
        const defn = det.definition || best.gloss || (await extDef(sidnum));
        const senses = defn ? [{ pos: det.pos || "", gloss: defn, lang }] : [];
        return { found: true, word: w, address24: null, fromVerse: true,
                 originals: [{ glyph, sid: best.sid, id: sidnum, language: lang }],
                 strongs: [{ id: sidnum, language: lang, pos: det.pos || "",
                             definition: defn, glyph, sid: best.sid }],
                 senses };
      }
    }
    const r = await wordLookup(wl);
    if (r.found && ((r.strongs || []).length || (r.originals || []).length || (r.senses || []).length))
      return r;
    const e = await englishDef(wl);
    return e.found ? e : r;
  }

  /* ---------- greek-for-word reverse index ---------- */
  let GRK_REV = null;
  async function greekForWord(w) {
    if (!GRK_REV) {
      GRK_REV = {};
      const S = await tbl("taviel_strongs");
      const bestLen = {};
      for (const [key, e] of Object.entries(S)) {
        if (!key.startsWith("G")) continue;
        const lemma = (e.lemma || "").trim();
        if (!lemma) continue;
        const renders = (e.kjv || "").match(/[A-Za-z]+/g) || [];
        const n = renders.length || 99;
        for (const r of renders) {
          const rl = r.toLowerCase();
          if (rl.length < 2) continue;
          if (!(rl in bestLen) || n < bestLen[rl]) { bestLen[rl] = n; GRK_REV[rl] = lemma; }
        }
      }
    }
    if (!w) return "";
    if (w in GRK_REV) return GRK_REV[w];
    for (const cand of [w.slice(0, -1), w.slice(0, -2), w.endsWith("ies") ? w.slice(0, -3) + "y" : ""])
      if (cand && cand in GRK_REV) return GRK_REV[cand];
    return "";
  }

  /* ---------- revelation (Nine Keys per chapter) ---------- */
  async function revelation(book, ch) {
    if (!book) return { insights: [] };
    ch = String(ch);
    const out = [];
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [pos, key, principle, color, verses] of await Q("yt",
      "SELECT position,key,principle,color,verses FROM nine_keys ORDER BY position")) {
      const vv = verses || "";
      const re = new RegExp("\\b" + esc(book) + "\\s+" + esc(ch) + "(?=[:\\s;]|$)");
      if (re.test(vv))
        out.push({ source: "Yahweh Tsidkenu -- Key " + pos + ": " + key + " (" + color + ")",
                   text: principle + " &mdash; " + vv });
    }
    return { insights: out.slice(0, 10) };
  }

  /* ---------- endpoint registrations ---------- */
  H["/api/word"] = async (q) => {
    const w = (q.get("w") || "").toLowerCase();
    const book = q.get("book"), ch = q.get("chapter"), verse = q.get("verse");
    /* In-verse click stays context-aware (interlinear + canon-fill). A generic
       word study prefers the full desktop word-study pack for sense-for-sense
       parity, falling back to the compact-lexicon lookup when absent. */
    if (!(book && ch && verse)) {
      const row = await Q("wordstudy", "SELECT json FROM word WHERE w=?", [w]);
      if (row.length) { try { const d = JSON.parse(row[0][0]); if (d && d.found) return J(d); } catch (e) {} }
    }
    return J(await wordLookupCtx(w, book, ch, verse));
  };
  H["/api/strongs"] = async (q) => J(await strongsDetail(q.get("id") || ""));
  H["/api/english"] = async (q) => J(await englishDef(q.get("w") || ""));
  H["/api/interlinear"] = async (q) =>
    J(await interlinear(q.get("book"), +(q.get("chapter") || 1), +(q.get("verse") || 1)));
  H["/api/original"] = async (q) => J(await originalDef(q.get("sid") || ""));
  H["/api/deepstudy"] = async (q) => J(await deepstudy(q.get("sid") || ""));
  H["/api/usecases"] = async (q) => J(await usecases(q.get("sid") || "", q.get("strong") || ""));
  H["/api/chapter_study"] = async (q) => {
    const cs = await tbl("chapter_study");
    const e = cs[q.get("book")];
    return J(e ? { ...e, chapter: +(q.get("chapter") || 1) }
               : { found: false, book: q.get("book"), chapter: +(q.get("chapter") || 1) });
  };
  H["/api/revelation"] = async (q) => J(await revelation(q.get("book") || "", q.get("chapter") || "1"));
  H["/api/hebrew"] = async (q) => {
    const m = await tbl("hebrew_studies");
    const nm = (q.get("name") || "").trim();
    const hit = m[nm.toLowerCase()];
    if (hit) return J(hit);
    let glyph = q.get("glyph") || "";
    if (!glyph && /[֐-׿]/.test(nm)) glyph = nm;   // the name itself is a Hebrew glyph
    const s = glyph ? hebrewStudy(glyph) : null;           // live dissection, exactly like /api/greek
    return J(s || { found: false });
  };
  /* Live Aramaic (Syriac) + Greek letter-by-letter studies — ported verbatim from
     the desktop taviel_aramaic.py / taviel_greek.py so EVERY word gets a study
     (the static snapshots only hold ~823 precomputed names). Works on iPhone, no
     packs needed. Aramaic: transliterate/genuine → Syriac letters + abjad. Greek:
     dissect a glyph → letters + isopsephy. */
  const _SYRIAC = {
    "ܐ": ["Alaph", "'", 1, "ox / strength, leader; the silent breath, the One."],
    "ܒ": ["Beth", "b", 2, "house / household, in, within."],
    "ܓ": ["Gamal", "g", 3, "camel / to lift up, to recompense, to deal out."],
    "ܕ": ["Dalath", "d", 4, "door / pathway, to enter, to move."],
    "ܗ": ["He", "h", 5, "window, lattice / behold, to reveal, breath."],
    "ܘ": ["Waw", "w", 6, "nail, hook / to fasten, to bind, 'and'."],
    "ܙ": ["Zain", "z", 7, "weapon, mattock / to cut, to nourish, to arm."],
    "ܚ": ["Heth", "kh", 8, "fence, wall / to separate, to protect, private."],
    "ܛ": ["Teth", "t", 9, "basket, coil / to surround, to store, good."],
    "ܝ": ["Yodh", "y", 10, "hand, arm / deed, work, to make, to worship."],
    "ܟ": ["Kaph", "k", 20, "open palm / to cover, to allow, to bend, to tame."],
    "ܠ": ["Lamadh", "l", 30, "ox-goad, staff / to teach, to urge, to lead, control."],
    "ܡ": ["Mim", "m", 40, "water / chaos, mighty, mass; the peoples."],
    "ܢ": ["Nun", "n", 50, "fish, seed / life, activity, continuity, the heir."],
    "ܣ": ["Semkath", "s", 60, "prop, support / to uphold, to lean upon, to trust."],
    "ܥ": ["'E", "'", 70, "eye, spring / to see, to know, to experience."],
    "ܦ": ["Pe", "p", 80, "mouth / to speak, to blow, word, edge."],
    "ܨ": ["Sadhe", "ts", 90, "fish-hook, side / to catch, to desire, to hunt, need."],
    "ܩ": ["Qoph", "q", 100, "back of the head, eye of a needle / to encircle, the least, time."],
    "ܪ": ["Resh", "r", 200, "head / chief, beginning, the highest, a person."],
    "ܫ": ["Shin", "sh", 300, "tooth / to consume, to destroy, to press, sharp; the Almighty."],
    "ܬ": ["Taw", "t", 400, "mark, cross / a sign, a covenant, to seal, the end."],
  };
  const _HEB_TO_SYR = { "א": "ܐ", "ב": "ܒ", "ג": "ܓ", "ד": "ܕ",
    "ה": "ܗ", "ו": "ܘ", "ז": "ܙ", "ח": "ܚ", "ט": "ܛ",
    "י": "ܝ", "כ": "ܟ", "ך": "ܟ", "ל": "ܠ", "מ": "ܡ",
    "ם": "ܡ", "נ": "ܢ", "ן": "ܢ", "ס": "ܣ", "ע": "ܥ",
    "פ": "ܦ", "ף": "ܦ", "צ": "ܨ", "ץ": "ܨ", "ק": "ܩ",
    "ר": "ܪ", "ש": "ܫ", "ת": "ܬ" };
  const _TL_DIGRAPHS = [["tsch", "ܛܫ"], ["sch", "ܫ"], ["tch", "ܛܫ"],
    ["sh", "ܫ"], ["ch", "ܚ"], ["ts", "ܨ"], ["tz", "ܨ"], ["th", "ܬ"],
    ["ph", "ܦ"], ["kh", "ܟ"], ["ck", "ܩ"], ["qu", "ܩܘ"], ["wh", "ܘ"]];
  const _TL_SINGLE = { a: "", b: "ܒ", c: "ܩ", d: "ܕ", e: "", f: "ܦ", g: "ܓ",
    h: "ܗ", i: "ܝ", j: "ܝ", k: "ܟ", l: "ܠ", m: "ܡ", n: "ܢ",
    o: "ܘ", p: "ܦ", q: "ܩ", r: "ܪ", s: "ܣ", t: "ܬ", u: "ܘ",
    v: "ܘ", w: "ܘ", x: "ܩܣ", y: "ܝ", z: "ܙ" };
  const _VOWEL = { a: "ܐ", e: "ܐ", i: "ܝ", o: "ܘ", u: "ܘ", y: "ܝ" };
  const _hasSyriac = (s) => { for (const c of (s || "")) if (c >= "܀" && c <= "ݏ") return true; return false; };
  const _hasHeb = (s) => { for (const c of (s || "")) if (_HEB_TO_SYR[c]) return true; return false; };
  function _translitAram(word) {
    const w = (word || "").toLowerCase().replace(/[^a-z]/g, ""); const out = []; let i = 0;
    while (i < w.length) {
      let hit = null;
      for (const d of _TL_DIGRAPHS) if (w.startsWith(d[0], i)) { hit = [d[1], d[0].length]; break; }
      if (hit) { out.push(hit[0]); i += hit[1]; } else { out.push(_TL_SINGLE[w[i]] || ""); i += 1; }
    }
    let syr = out.join("");
    if (!syr) syr = [...w].map((ch) => _VOWEL[ch] || "").join("") || "ܐ";
    return syr;
  }
  const _toSyriac = (w) => [...(w || "")].map((c) => _HEB_TO_SYR[c] || c).join("");
  function _dissectAram(word) {
    const letters = []; let total = 0;
    for (const ch of (word || "")) { const e = _SYRIAC[ch]; if (e) { letters.push({ glyph: ch, name: e[0], translit: e[1], meaning: e[3], value: e[2] }); total += e[2]; } }
    return [letters, total];
  }
  const _romanizeAram = (w) => [...(w || "")].filter((c) => _SYRIAC[c]).map((c) => _SYRIAC[c][1]).join("");
  function aramaicStudy(name) {
    if (!name) return { found: false };
    const raw = String(name).trim();
    if (_hasSyriac(raw) || _hasHeb(raw)) {
      const syr = _toSyriac(raw); const [letters, total] = _dissectAram(syr);
      return { name, aramaic: syr, translit: _romanizeAram(syr), letters, gematria: total, direct: true,
        note: "A genuine Aramaic word, written in the Syriac script of the Peshitta." };
    }
    const syr = _translitAram(raw); const [letters, total] = _dissectAram(syr);
    return { name, aramaic: syr, translit: raw.toLowerCase(), letters, gematria: total, direct: false,
      note: "A phonetic Aramaic transliteration — the Syriac letters carry the sound of the word, letter by letter, with the ancient Semitic meaning of each." };
  }
  /* live Hebrew letter-by-letter study (mirrors aramaicStudy) so the deep dive always shows
     the Hebrew breakdown even without the hebrew_studies pack -- letters, sounds, ancient
     meanings, and the gematria total, in the exact shape the 2-column view expects. */
  const HEB_VALUE = { "א":1,"ב":2,"ג":3,"ד":4,"ה":5,"ו":6,"ז":7,"ח":8,"ט":9,"י":10,"כ":20,"ל":30,
    "מ":40,"נ":50,"ס":60,"ע":70,"פ":80,"צ":90,"ק":100,"ר":200,"ש":300,"ת":400 };
  function _dissectHeb(word) {
    const letters = []; let total = 0;
    for (const ch of (word || "")) {
      const base = FINALS[ch] || ch; const e = HEB_LETTERS[base];
      if (e) { const v = HEB_VALUE[base] || 0;
        letters.push({ glyph: ch, name: e[0], translit: HEB_SOUND[base] || "", meaning: e[1], value: v });
        total += v; }
    }
    return [letters, total];
  }
  function hebrewStudy(word) {
    if (!word) return { found: false };
    const raw = String(word).trim();
    const [letters, total] = _dissectHeb(raw);
    if (!letters.length) return { found: false };
    return { found: true, name: raw, hebrew: raw, translit: translitHebrew(raw)[0], letters,
      gematria: total, meaning: "",
      note: "Letter by letter — each Hebrew letter carries an ancient pictographic meaning; the values sum to the gematria." };
  }
  const _GREEK = {
    "α": ["Alpha", "a", 1, "the first letter; 'I am Alpha and Omega, the beginning' (Rev 1:8)."],
    "β": ["Beta", "b", 2, "from Phoenician bet (house); the second letter."],
    "γ": ["Gamma", "g", 3, "from Phoenician gimel (camel/throw)."],
    "δ": ["Delta", "d", 4, "from Phoenician dalet (door); the triangular fourth letter."],
    "ε": ["Epsilon", "e", 5, "'e psilon' = plain E; the short e-vowel."],
    "ζ": ["Zeta", "z", 7, "from Phoenician zayin; note it skips 6 (the digamma/stigma)."],
    "η": ["Eta", "e", 8, "the long e-vowel (eta), from Phoenician heth."],
    "θ": ["Theta", "th", 9, "from Phoenician teth; anciently marked on a ballot for death (thanatos)."],
    "ι": ["Iota", "i", 10, "the smallest letter — 'one jot' (iota) shall not pass (Mt 5:18)."],
    "κ": ["Kappa", "k", 20, "from Phoenician kaph (palm of the hand)."],
    "λ": ["Lambda", "l", 30, "from Phoenician lamed (ox-goad)."],
    "μ": ["Mu", "m", 40, "from Phoenician mem (water)."],
    "ν": ["Nu", "n", 50, "from Phoenician nun (fish/serpent)."],
    "ξ": ["Xi", "x", 60, "the double consonant ks; from Phoenician samekh."],
    "ο": ["Omicron", "o", 70, "'o mikron' = small O; the short o-vowel."],
    "π": ["Pi", "p", 80, "from Phoenician pe (mouth)."],
    "ρ": ["Rho", "r", 100, "from Phoenician resh (head)."],
    "σ": ["Sigma", "s", 200, "from Phoenician shin (tooth); written σ within a word."],
    "ς": ["Sigma (final)", "s", 200, "the final form of sigma, written ς at a word's end."],
    "τ": ["Tau", "t", 300, "from Phoenician taw (mark) — the cross-shaped last consonant, the sign of Ezek 9:4."],
    "υ": ["Upsilon", "y", 400, "'u psilon' = plain U; the Pythagorean 'letter of life' forking two ways."],
    "φ": ["Phi", "ph", 500, "the aspirate p; also the symbol of the golden ratio."],
    "χ": ["Chi", "ch", 600, "the X-letter; the monogram of Christ (ΧΡ, Chi-Rho)."],
    "ψ": ["Psi", "ps", 700, "the double consonant ps."],
    "ω": ["Omega", "o", 800, "'o mega' = great O, the long o and LAST letter — 'I am... Omega, the end' (Rev 1:8)."],
    "ϝ": ["Digamma/Stigma", "w", 6, "the archaic 6; with chi (600) and xi (60) spells 666 (Rev 13:18)."],
    "ϛ": ["Stigma", "st", 6, "the archaic numeral 6 (ligature of sigma-tau)."],
    "ϙ": ["Koppa", "q", 90, "the archaic numeral 90."],
    "ϟ": ["Koppa", "q", 90, "the archaic numeral 90."],
    "ϡ": ["Sampi", "ss", 900, "the archaic numeral 900."],
  };
  function _greekBase(ch) {
    if (_GREEK[ch]) return ch;
    const d = ch.normalize("NFD");
    for (const c of d) { if (/\p{M}/u.test(c)) continue; const lc = c.toLowerCase(); if (_GREEK[lc]) return lc; }
    return "";
  }
  function _dissectGreek(word) {
    const letters = []; let total = 0;
    for (const ch of (word || "")) {
      if (/\s/.test(ch) || "().,·;:-—[]{}0123456789".indexOf(ch) >= 0) continue;
      const b = _greekBase(ch); if (!b) continue;
      const e = _GREEK[b]; letters.push({ glyph: ch, name: e[0], translit: e[1], meaning: e[3], value: e[2] }); total += e[2];
    }
    return [letters, total];
  }
  function _romanizeGreek(word) {
    const out = [];
    for (const ch of (word || "")) { const b = _greekBase(ch); if (!b) continue; out.push(_GREEK[b][1]); }
    return out.join("");
  }
  function greekStudy(word) {
    if (!word) return null;
    const [letters, total] = _dissectGreek(word);
    if (!letters.length) return null;
    return { greek: word, translit: _romanizeGreek(word), letters, isopsephy: total,
      note: "Greek letters are phonetic; their numeric values give the isopsephy (the Greek counterpart of gematria)." };
  }
  /* Hebrew letter breakdown for any Hebrew string — same 22 consonants (and
     ancient pictographic meanings) as the Syriac table, mapped via _HEB_TO_SYR,
     with the Hebrew letter names, so an OT word dissects in its own script. */
  const _HEB_NAMES = { "א": "Aleph", "ב": "Bet", "ג": "Gimel", "ד": "Dalet",
    "ה": "He", "ו": "Vav", "ז": "Zayin", "ח": "Chet", "ט": "Tet", "י": "Yod",
    "כ": "Kaf", "ך": "Kaf (final)", "ל": "Lamed", "מ": "Mem", "ם": "Mem (final)",
    "נ": "Nun", "ן": "Nun (final)", "ס": "Samekh", "ע": "Ayin", "פ": "Pe",
    "ף": "Pe (final)", "צ": "Tsadi", "ץ": "Tsadi (final)", "ק": "Qof",
    "ר": "Resh", "ש": "Shin", "ת": "Tav" };
  function hebrewLetters(word) {
    const letters = []; let total = 0;
    for (const ch of (word || "")) {
      const syr = _HEB_TO_SYR[ch]; if (!syr) continue;
      const e = _SYRIAC[syr]; if (!e) continue;
      letters.push({ glyph: ch, name: _HEB_NAMES[ch] || e[0], translit: e[1], meaning: e[3], value: e[2] });
      total += e[2];
    }
    return letters.length ? { hebrew: word, letters, gematria: total,
      note: "Each Hebrew letter's ancient pictographic meaning and its gematria value." } : null;
  }

  H["/api/aramaic"] = async (q) => {
    const raw = (q.get("name") || q.get("glyph") || "");
    const m = await tbl("aramaic_studies");
    const hit = m[raw.toLowerCase().trim()];
    if (hit) return J(hit);
    return J(aramaicStudy(raw));                         // live: every word gets a study
  };
  H["/api/greek"] = async (q) => {
    const m = await tbl("greek_studies");
    let glyph = q.get("glyph") || "";
    if (!glyph) glyph = await greekForWord((q.get("name") || "").toLowerCase());
    if (glyph && (m[glyph] || m[glyph.normalize("NFC")])) return J(m[glyph] || m[glyph.normalize("NFC")]);
    const s = glyph ? greekStudy(glyph) : null;          // live isopsephy dissection
    return J(s || { found: false });
  };

  window.YBSTUDY = { wordLookup, interlinear, deepstudy, hebrewLetters, romanize };
})();
