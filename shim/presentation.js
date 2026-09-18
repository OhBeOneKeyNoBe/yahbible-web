/* YahBible Web — the YahBible header link opens the LANDING in the centre reader:
   the usual home design (a random Christ / red-letter verse + the את YahBible
   brand) at the top, then a scrollable, extensive feature showcase with
   screenshots below — like the Hugging Face card, in-app. Header, footer and menus
   stay in place; it is not a full-screen takeover.

   Clicking YahBible again while the showcase is open goes straight to the plain
   home screen (no feature funnel). Every screenshot is click-to-enlarge with
   scroll-zoom and drag-pan. */
"use strict";
(function () {
  const APPBASE = (window.YBWEB && window.YBWEB.base) ||
    new URL("..", document.currentScript.src).href;
  const B = APPBASE + "assets/shots/";

  function css() {
    if (document.getElementById("ybland-css")) return;
    const s = document.createElement("style");
    s.id = "ybland-css";
    s.textContent =
      "#ybshowcase{width:100%;max-width:none;margin:22px auto 60px;padding:0 clamp(16px,3vw,40px);box-sizing:border-box}" +
      "#ybshowcase .lead{text-align:center;margin:0 auto 30px;max-width:660px}" +
      "#ybshowcase .lead h2{font:700 30px/1.1 'EB Garamond',Georgia,serif;margin:0 0 6px;" +
      "background:linear-gradient(92deg,#f3d9ff,#b98bff,#8fd4ff,#e7c94e);-webkit-background-clip:text;" +
      "background-clip:text;color:transparent}" +
      "#ybshowcase .lead p{opacity:.82;font-style:italic;font-size:17px}" +
      "#ybshowcase .ybtour{display:block;width:100%;border-radius:14px;border:1px solid #ffffff1a;box-shadow:0 10px 34px #0008;margin:6px auto 30px;max-width:600px;background:#0b0818}" +
      "#ybshowcase .feat{display:grid;grid-template-columns:1.15fr 1fr;gap:22px;align-items:center;" +
      "margin:30px 0;padding:20px;border:1px solid #c9a86a2e;border-radius:16px;" +
      "background:hsl(262 30% 12% / .5)}" +
      "#ybshowcase .feat:nth-child(even){grid-template-columns:1fr 1.15fr}" +
      "#ybshowcase .feat:nth-child(even) .txt{order:2}" +
      "#ybshowcase .feat figure{margin:0}" +
      "#ybshowcase .feat img{width:100%;border-radius:12px;border:1px solid #ffffff1a;display:block;" +
      "box-shadow:0 8px 30px #0007;cursor:zoom-in;transition:transform .12s}" +
      "#ybshowcase .feat img:hover{transform:scale(1.01)}" +
      "#ybshowcase .feat figcaption{font-size:12px;opacity:.6;margin-top:6px;text-align:center}" +
      "#ybshowcase .feat h3{color:#e8d9ae;font:600 19px 'EB Garamond',Georgia,serif;margin:0 0 6px}" +
      "#ybshowcase .feat p{margin:0;opacity:.88;font-size:15.5px;line-height:1.55}" +
      "#ybshowcase .strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));" +
      "gap:12px;margin:22px 0}" +
      "#ybshowcase .chip{border:1px solid #c9a86a2e;border-radius:12px;padding:14px;background:hsl(262 30% 12% / .5)}" +
      "#ybshowcase .chip b{display:block;color:#e8d9ae;font:600 14px system-ui;margin-bottom:3px}" +
      "#ybshowcase .chip span{font-size:13.5px;opacity:.84}" +
      "#ybshowcase h2.sec{color:#e8d9ae;font:700 13px system-ui;letter-spacing:.14em;text-transform:uppercase;" +
      "text-align:center;margin:44px 0 6px;opacity:.9}" +
      "#ybshowcase .cta{display:block;margin:34px auto 0;max-width:320px;text-align:center;padding:14px;" +
      "border:1px solid #c9a86a55;border-radius:14px;background:linear-gradient(92deg,#1c1536,#2a1f4d);" +
      "color:#e8d9ae;font:600 16px system-ui;cursor:pointer}" +
      /* lightbox */
      ".yblb{position:fixed;inset:0;z-index:100000;background:#060410ee;display:flex;align-items:center;" +
      "justify-content:center;overflow:hidden;touch-action:none}" +
      ".yblb img{max-width:94vw;max-height:88vh;border-radius:10px;box-shadow:0 20px 80px #000c;cursor:grab;" +
      "will-change:transform;user-select:none;-webkit-user-drag:none}" +
      ".yblb img.grabbing{cursor:grabbing}" +
      ".yblb .yblb-hint{position:fixed;top:14px;left:0;right:0;text-align:center;color:#cdbfe6;font:13px system-ui;opacity:.8}" +
      ".yblb .yblb-x{position:fixed;top:10px;right:16px;color:#e8d9ae;font:700 26px system-ui;cursor:pointer;line-height:1}" +
      /* problems solved */
      "#ybshowcase .probgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}" +
      "#ybshowcase .prob{border:1px solid #c9a86a2e;border-radius:14px;padding:16px 18px;background:hsl(262 30% 12% / .5)}" +
      "#ybshowcase .prob .p{color:#e7b7b7;font:600 15px system-ui;margin:0 0 6px}" +
      "#ybshowcase .prob .p::before{content:'✕ ';opacity:.7}" +
      "#ybshowcase .prob .s{opacity:.9;font-size:14.5px;line-height:1.5}" +
      "#ybshowcase .prob .s::before{content:'→ ';color:#8fd4ff}" +
      /* get the app */
      "#ybshowcase .getgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:18px 0}" +
      "#ybshowcase .get{border:1px solid #c9a86a2e;border-radius:16px;padding:18px;background:hsl(262 30% 12% / .5);text-align:center}" +
      "#ybshowcase .get h4{margin:0 0 4px;color:#e8d9ae;font:600 16px system-ui}" +
      "#ybshowcase .get .qr{width:150px;height:150px;margin:10px auto;border-radius:12px;background:#140f28;padding:8px;border:1px solid #ffffff14;display:block}" +
      "#ybshowcase .get p{font-size:13px;opacity:.82;line-height:1.45;margin:6px 0 10px}" +
      "#ybshowcase .get a.dl{display:inline-block;padding:9px 14px;border:1px solid #c9a86a55;border-radius:10px;" +
      "background:linear-gradient(92deg,#1c1536,#2a1f4d);color:#e8d9ae;font:600 13.5px system-ui;text-decoration:none}" +
      "#ybshowcase .offline{max-width:680px;margin:14px auto 0;text-align:center;font-size:13.5px;opacity:.78;line-height:1.55}" +
      /* share */
      "#ybshowcase .sharerow{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:16px 0 4px}" +
      "#ybshowcase .sharerow button,#ybshowcase .sharerow a{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;" +
      "border:1px solid #c9a86a44;border-radius:999px;background:hsl(262 30% 14%);color:#e8d9ae;font:600 14px system-ui;" +
      "cursor:pointer;text-decoration:none}" +
      "#ybshowcase .sharerow{position:relative;justify-content:center}" +
      "#ybshowcase .sharerow .prime{background:linear-gradient(92deg,#2a1f4d,#3a2a66);border-color:#c9a86a77}" +
      "#ybshowcase .ybsharepop{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);" +
      "background:#141031f2;border:1px solid #c9a86a55;border-radius:12px;padding:8px;display:flex;flex-direction:column;" +
      "gap:6px;box-shadow:0 12px 34px #000b;z-index:130;min-width:190px}" +
      "#ybshowcase .ybsharepop a,#ybshowcase .ybsharepop button{display:flex;align-items:center;gap:9px;padding:8px 12px;" +
      "border-radius:8px;background:hsl(262 30% 16%);color:#e8d9ae;text-decoration:none;border:1px solid #c9a86a33;" +
      "font:600 14px system-ui;cursor:pointer}" +
      "#ybshowcase .ybsharepop a:hover,#ybshowcase .ybsharepop button:hover{background:hsl(262 34% 22%)}" +
      /* scripture rationale */
      "#ybshowcase .screason{max-width:780px;margin:6px auto 8px}" +
      "#ybshowcase .scr{margin:12px 0;padding:12px 18px;border-left:3px solid #c9a86a88;background:hsl(262 30% 12% / .5);" +
      "border-radius:0 12px 12px 0;font:italic 17px/1.5 'EB Garamond',Georgia,serif;color:#efe6cf}" +
      "#ybshowcase .scr cite{display:block;margin-top:6px;font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;" +
      "font-style:normal;color:#e8d9ae;opacity:.85}" +
      "#ybshowcase .screasp{text-align:center;opacity:.86;font-size:15px;margin:14px auto 0;max-width:680px}" +
      /* comparison table */
      "#ybshowcase .cmpwrap{overflow-x:auto;margin:14px 0 6px;-webkit-overflow-scrolling:touch;border:1px solid #ffffff12;border-radius:12px}" +
      "#ybshowcase table.cmp{width:100%;border-collapse:collapse;min-width:540px;font-size:13.5px}" +
      "#ybshowcase table.cmp th,#ybshowcase table.cmp td{padding:9px 8px;border-bottom:1px solid #ffffff12;text-align:center;vertical-align:middle}" +
      "#ybshowcase table.cmp thead th{font:700 12px system-ui;color:#e8d9ae;border-bottom:1px solid #c9a86a55;line-height:1.2}" +
      "#ybshowcase table.cmp .feat{text-align:left;font-size:13px;opacity:.95;width:44%;min-width:190px}" +
      "#ybshowcase table.cmp td.feat{opacity:.9}" +
      "#ybshowcase table.cmp .me{background:hsl(262 40% 16% / .55)}" +
      "#ybshowcase table.cmp thead th.me{color:#f3d9ff;background:hsl(262 45% 20% / .7);border-bottom:1px solid #b98bff}" +
      "#ybshowcase .mk{font-weight:700;font-size:16px}" +
      "#ybshowcase .mk.yes{color:#6fe0a0}#ybshowcase .mk.part{color:#e7c94e}#ybshowcase .mk.paid{color:#f0a35a}#ybshowcase .mk.no{color:#7a7590}" +
      "#ybshowcase .cmpkey{font-size:12.5px;opacity:.7;text-align:center;margin:6px auto 0;max-width:720px}" +
      /* table of contents */
      "#ybshowcase .ybtoc{max-width:560px;margin:6px auto 20px}" +
      "#ybshowcase .ybtoc ol{margin:8px 0 0;padding:0;list-style:none;columns:2;column-gap:20px}" +
      "#ybshowcase .ybtoc li{margin:5px 0;break-inside:avoid}" +
      "#ybshowcase .ybtoc a{color:#cfe0ff;cursor:pointer;font-size:14px;border-bottom:1px dotted #ffffff33}" +
      "#ybshowcase .ybtoc a:hover{color:#fff}" +
      /* dedication + the wilderness image; citation links into the app */
      "#ybshowcase .dedwrap{margin:38px auto 8px;max-width:680px;text-align:center}" +
      "#ybshowcase .dedimg{width:100%;max-width:560px;border-radius:16px;border:1px solid #ffffff1a;" +
      "box-shadow:0 10px 34px #0008;display:block;margin:0 auto 16px}" +
      "#ybshowcase .dedication{max-width:640px;margin:0 auto;text-align:center;" +
      "font:600 19px/1.55 'EB Garamond',Georgia,serif;color:#e8d9ae}" +
      "#ybshowcase .dedication cite{display:block;margin-top:8px;font:700 12px system-ui;letter-spacing:.1em;" +
      "text-transform:uppercase;font-style:normal;opacity:.85}" +
      "#ybshowcase .dedication cite a{color:#cfe0ff;text-decoration:underline;cursor:pointer}" +
      /* on mobile, nudge the existing scroll fish a little off the right edge */
      "@media(max-width:820px){#scrollfish{transform:translateX(14px)}}" +
      /* 'select a book' hint removed everywhere */
      ".homeempty{display:none!important}" +
      /* LANDING (showcase open): brand + quote condensed near the header */
      "#reader:has(#ybshowcase) .homepane{min-height:auto!important}" +
      "#reader:has(#ybshowcase) .homecenter{padding-top:8px!important;justify-content:flex-start!important}" +
      "#reader:has(#ybshowcase) .homehead{margin-bottom:6px!important}" +
      "#reader:has(#ybshowcase) #christquote{margin:0 auto 4px!important}" +
      /* PLAIN HOME / app intro (no showcase): brand + quote bigger and centred */
      "#reader:not(:has(#ybshowcase)) .homecenter{justify-content:center!important;min-height:64vh}" +
      "#reader:not(:has(#ybshowcase)) .homehead{transform:scale(1.28);transform-origin:center;margin-bottom:22px}" +
      "#reader:not(:has(#ybshowcase)) #christquote{font-size:1.18em;max-width:640px;margin:0 auto}" +
      /* mobile-readable comparison: stack each row as a labelled card below 560px */
      "@media(max-width:560px){#ybshowcase .cmpwrap{border:none;overflow:visible}" +
      "#ybshowcase table.cmp{min-width:0;display:block}#ybshowcase table.cmp thead{display:none}" +
      "#ybshowcase table.cmp tbody,#ybshowcase table.cmp tr,#ybshowcase table.cmp td{display:block;width:auto}" +
      "#ybshowcase table.cmp tr{border:1px solid #ffffff14;border-radius:12px;padding:8px 12px;margin:0 0 10px;background:hsl(262 30% 12% / .5)}" +
      "#ybshowcase table.cmp td.feat{font-weight:600;color:#e8d9ae;text-align:left;width:auto;padding:0 0 6px;border:none}" +
      "#ybshowcase table.cmp td:not(.feat){display:flex;justify-content:space-between;align-items:center;border:none;padding:3px 0;text-align:left}" +
      "#ybshowcase table.cmp td:not(.feat)::before{content:attr(data-app);opacity:.72;font-size:12.5px}" +
      "#ybshowcase table.cmp td.me{background:none}}" +
      "@media(max-width:720px){#ybshowcase .feat,#ybshowcase .feat:nth-child(even){grid-template-columns:1fr}" +
      "#ybshowcase .feat:nth-child(even) .txt{order:0}" +
      "#ybshowcase .probgrid,#ybshowcase .getgrid{grid-template-columns:1fr}}" +
      /* holographic feature titles — the same living sheen as the את brand */
      "@keyframes ybholo{to{background-position:300% 0}}" +
      "#ybshowcase .feat h3.holo{background:linear-gradient(92deg,#f3d9ff,#b98bff,#8fd4ff,#7fe0c0,#e7c94e,#f3a3c8,#f3d9ff);" +
      "background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;" +
      "animation:ybholo 9s linear infinite;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--c,#b98bff) 55%,transparent))}" +
      "@media(prefers-reduced-motion:reduce){#ybshowcase .feat h3.holo{animation:none}}" +
      /* colour-coded index: each feature is a block in its section's colour */
      "#ybshowcase .ybtoc ol{columns:auto;display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
      "#ybshowcase .ybtoc li{margin:0;break-inside:auto}" +
      "#ybshowcase .ybtoc a{display:block;border:none;border-left:5px solid var(--c,#b98bff);border-radius:10px;" +
      "padding:10px 12px;background:color-mix(in srgb,var(--c,#b98bff) 16%,hsl(262 30% 12%));color:#f4eeff;" +
      "font:600 13.5px system-ui;line-height:1.3;box-shadow:0 2px 10px #0004;transition:background .12s,transform .12s}" +
      "#ybshowcase .ybtoc a:hover{background:color-mix(in srgb,var(--c,#b98bff) 30%,hsl(262 30% 14%));transform:translateX(2px);color:#fff}" +
      /* each feature card wears its index colour */
      "#ybshowcase .feat{border-color:color-mix(in srgb,var(--c,#c9a86a) 45%,transparent)!important;box-shadow:inset 5px 0 0 var(--c,#c9a86a),0 8px 26px #0006}" +
      /* comparison rendered as a designed image (canvas → PNG) */
      "#ybshowcase .cmpimg{display:block;width:100%;max-width:840px;margin:14px auto 6px;border-radius:16px;" +
      "border:1px solid #ffffff14;box-shadow:0 14px 44px #0009;cursor:zoom-in}" +
      "@media(max-width:560px){#ybshowcase .ybtoc ol{grid-template-columns:1fr}}";
    (document.head || document.documentElement).appendChild(s);
  }

  /* every feature = a screenshot from the full-data desktop edition + a caption */
  const FEATURES = [
    ["reader.png", "Read every version, side by side", "The King James Bible with 120+ English and original-language translations, verse for verse. Search however you remember a passage — “3:16 John”, “the 23rd Psalm” — and switch versions without losing your place. No more juggling three sites to compare a single verse."],
    ["commandments_all.png", "The Ten Commandments, taught in full", "All ten, each opened in the centre and read four ways at once: its Scripture, what it forbids, how to keep it inwardly, and the cross-references — the words of Christ in scarlet, every other quote in violet."],
    ["wordstudy.png", "Hebrew & Greek word study for anyone", "Tap any word in the Old or New Testament for its original Hebrew or Greek, its Strong's number, its transliteration, and every place it is used across Scripture. The kind of study that used to demand a lexicon, an interlinear and a concordance — now one tap, and it works offline."],
    ["versestudy.png", "Verse study with every translation lined up", "Select a verse to study it in the right menu with the other versions stacked beneath it — version titles holographic, the words themselves plain white and easy to read. Compare renderings and weigh a translation choice in seconds."],
    ["flatearth.png", "Uriel's Heavenly Design — 2D disc & 3D dome", "The Scriptural cosmology charted as an interactive model: the flat disc and the firmament dome, the ten ascending heavens, the four underworld hollows, the sun's doors and the wind gates. Run the 364-day year and click any gate, heaven or hollow to inspect it."],
    ["lineage.png", "The Gnostic lineage, mapped", "Trace the aeons and emanations from the Monad to Adam and Eve; tap any being to open its details and citations — a subject normally buried in scattered PDFs, here as one navigable map."],
    ["repentance.png", "Repentance & how to pray", "A guided turn toward the Father — repentance and the way of salvation, with an actual prayer to pray, all in Scripture's own words. For anyone who has ever wanted to come back but did not know how to begin."],
    ["library.png", "The whole library in one menu", "1–3 Enoch, the Nag Hammadi and gnostic scriptures, the Torah in pure Hebrew, Pistis Sophia, the Dead Sea Scrolls, Josephus, the Mishnah, Talmud, Targums, Midrash and the wider apocrypha — sources usually spread across a dozen archives, gathered and searchable in one place."],
    ["taviel.png", "Tav'iel — a guide that cites its sources", "Ask anything and Tav'iel answers from Scripture, citing chapter and verse, grounded in the text rather than guessing. Study help that shows its work, on-device and private."],
    ["taviel.png", "The Gauntlet — the 100 hardest questions, answered from Christ's own words", "The internet's hardest hundred questions about Christianity — contradictions, suffering, hell, the Trinity, other religions, science, slavery, and more — each answered first from the direct words of Yeshua the Christ that settle it, then reasoned out plainly, with real chapter and verse. Ask the same question twice and it answers afresh, never a rote reply — and every one of the hundred works entirely offline."],
    ["camera.png", "Camera & greenscreen for teaching", "Front, back, or both cameras with real background-removal greenscreen and draggable overlays — everything a teacher or streamer needs to present the Word, built in, with no extra software."],
  ];
  /* Why YahBible is free and offline — grounded in Scripture. */
  const SCRIPTURE = [
    ["Buy the truth, and sell it not; also wisdom, and instruction, and understanding.", "Proverbs 23:23"],
    ["Freely ye have received, freely give.", "Matthew 10:8"],
    ["Ho, every one that thirsteth, come ye to the waters … come, buy wine and milk without money and without price.", "Isaiah 55:1"],
  ];
  /* Comparison chart: YahBible vs the common Bible apps. Marks: 1 = yes, 0 = no,
     "p" = partial / limited, "$" = paywalled. Kept fair and specific. */
  const APPS = ["YahBible", "YouVersion", "Logos / paid suites", "Blue Letter Bible"];
  const COMPARE = [
    ["Free forever — no trial, no subscription", ["1", "1", "$", "1"]],
    ["Fully offline — every feature, no signal", ["1", "0", "0", "0"]],
    ["Offline AI search & reasoning — answers with no connection", ["1", "0", "0", "0"]],
    ["No account required", ["1", "0", "0", "1"]],
    ["No ads, and never sells your data", ["1", "0", "1", "1"]],
    ["Hebrew, Greek & Aramaic word study — free", ["1", "0", "$", "1"]],
    ["Interlinear + Strong's for every word — free", ["1", "0", "$", "1"]],
    ["The apocrypha — Enoch, Nag Hammadi, Dead Sea Scrolls, Torah in Hebrew", ["1", "0", "$", "0"]],
    ["Scriptural cosmology — Uriel's Heavenly Design (2D & 3D)", ["1", "0", "0", "0"]],
    ["An AI guide that answers from Scripture, citing chapter & verse", ["1", "0", "0", "0"]],
    ["Studio Mode + greenscreen camera for teaching & streaming", ["1", "0", "0", "0"]],
    ["Study & research never behind a paywall", ["1", "0", "$", "1"]],
  ];
  /* one distinct colour per section — the index block and the feature card share it */
  const TOCCOLORS = ["#f3a3c8", "#b98bff", "#8fd4ff", "#7fe0c0", "#e7c94e", "#f0a35a",
    "#9db8ff", "#d59bff", "#6fe0a0", "#ff9e9e", "#7fd0e0", "#c9a86a"];

  /* ---- comparison rendered as a designed image (canvas → PNG) ---- */
  function roundRectPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function wrapLines(g, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = []; let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (g.measureText(t).width <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; if (lines.length === maxLines - 1) break; }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    // if truncated, put the remaining words on the last line (ellipsis if needed)
    return lines;
  }
  function comparisonImage() {
    const cols = APPS.length, rows = COMPARE.length;
    const S = 2, W = 840, padL = 22, labelW = 336;
    const colW = (W - padL * 2 - labelW) / cols;
    const titleH = 56, headH = 72, rowH = 50, botPad = 22;
    const H = titleH + headH + rows * rowH + botPad;
    const cv = document.createElement("canvas");
    cv.width = W * S; cv.height = H * S;
    const g = cv.getContext("2d");
    g.scale(S, S);
    const FONT = "system-ui,'Segoe UI',Arial,sans-serif";
    // panel
    g.fillStyle = "#120d26"; roundRectPath(g, 0, 0, W, H, 18); g.fill();
    // YahBible column highlight, full height
    g.fillStyle = "hsl(262 44% 20% / .55)";
    roundRectPath(g, padL + labelW + 3, titleH + 6, colW - 6, H - titleH - 12, 12); g.fill();
    // title
    g.textBaseline = "middle"; g.textAlign = "left";
    g.fillStyle = "#e8d9ae"; g.font = "700 21px " + FONT;
    g.fillText("YahBible vs. other Bible apps", padL, titleH / 2 + 4);
    // header (app names)
    for (let c = 0; c < cols; c++) {
      const cx = padL + labelW + c * colW + colW / 2;
      g.textAlign = "center";
      g.fillStyle = c === 0 ? "#f3d9ff" : "#cdbfe6";
      g.font = (c === 0 ? "800" : "700") + " 13.5px " + FONT;
      const ls = wrapLines(g, APPS[c], colW - 8, 2);
      const y0 = titleH + headH / 2 - (ls.length - 1) * 8;
      ls.forEach((ln, k) => g.fillText(ln, cx, y0 + k * 16));
    }
    // rows
    for (let r = 0; r < rows; r++) {
      const [label, marks] = COMPARE[r];
      const ry = titleH + headH + r * rowH;
      if (r % 2 === 0) { g.fillStyle = "#ffffff07"; g.fillRect(padL, ry, W - padL * 2, rowH); }
      g.textAlign = "left"; g.fillStyle = "#e7ddc9"; g.font = "600 12.5px " + FONT;
      const ls = wrapLines(g, label, labelW - 12, 3);
      const y0 = ry + rowH / 2 - (ls.length - 1) * 7;
      ls.forEach((ln, k) => g.fillText(ln, padL + 4, y0 + k * 14));
      for (let c = 0; c < cols; c++) {
        const cx = padL + labelW + c * colW + colW / 2, m = marks[c];
        g.textAlign = "center";
        if (m === "1") { g.fillStyle = "#4fd684"; g.font = "800 25px " + FONT; g.fillText("✓", cx, ry + rowH / 2 + 1); }
        else if (m === "$") { g.fillStyle = "#f2cf3e"; g.font = "800 21px " + FONT; g.fillText("$", cx, ry + rowH / 2 + 1); }
        else if (m === "p") { g.fillStyle = "#f0a35a"; g.font = "800 20px " + FONT; g.fillText("◐", cx, ry + rowH / 2 + 1); }
        else { g.fillStyle = "#6b667f"; g.font = "700 18px " + FONT; g.fillText("✕", cx, ry + rowH / 2 + 1); }
      }
    }
    return cv.toDataURL("image/png");
  }

  /* ---- click-to-enlarge lightbox (scroll to zoom, drag to pan) ---- */
  function lightbox(src, alt) {
    const ov = document.createElement("div");
    ov.className = "yblb";
    ov.innerHTML = "<div class='yblb-hint'>scroll to zoom · drag to pan · click outside or ✕ to close</div>" +
      "<div class='yblb-x'>✕</div>";
    const img = document.createElement("img");
    img.src = src; img.alt = alt || "";
    ov.appendChild(img);
    document.body.appendChild(ov);
    let scale = 1, tx = 0, ty = 0, drag = false, sx = 0, sy = 0;
    const apply = () => { img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; };
    ov.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.15 : 0.87;
      scale = Math.min(6, Math.max(1, scale * f));
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }, { passive: false });
    img.addEventListener("mousedown", (e) => { drag = true; sx = e.clientX - tx; sy = e.clientY - ty; img.classList.add("grabbing"); e.preventDefault(); });
    window.addEventListener("mousemove", (e) => { if (!drag) return; tx = e.clientX - sx; ty = e.clientY - sy; apply(); });
    window.addEventListener("mouseup", () => { drag = false; img.classList.remove("grabbing"); });
    const close = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.classList.contains("yblb-x")) close(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
  }

  /* ---- share row: native Web Share where available + direct social links ---- */
  /* one Share icon that opens the options (native share on mobile; a small
     popover of links + copy on desktop) */
  function buildShare(el) {
    if (!el) return;
    const url = "https://realizeus.org/yahbible";
    const text = "YahBible — the whole counsel of Scripture: 120+ versions, Hebrew, Greek & Aramaic word study, the apocrypha, and Uriel’s Heavenly Design. Works offline.";
    const eu = encodeURIComponent(url), et = encodeURIComponent(text);
    const opts = [
      ["𝕏", "Post on X", "https://twitter.com/intent/tweet?text=" + et + "&url=" + eu],
      ["f", "Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + eu],
      ["✆", "WhatsApp", "https://wa.me/?text=" + et + "%20" + eu],
      ["✈", "Telegram", "https://t.me/share/url?url=" + eu + "&text=" + et],
    ];
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "prime"; btn.innerHTML = "<span>↗</span> Share YahBible";
    el.appendChild(btn);
    let pop = null;
    const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener("click", onDoc); } };
    const onDoc = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn) closePop(); };
    btn.onclick = (e) => {
      e.stopPropagation();
      if (navigator.share) { navigator.share({ title: "YahBible", text: text, url: url }).catch(() => {}); return; }
      if (pop) { closePop(); return; }
      pop = document.createElement("div"); pop.className = "ybsharepop";
      opts.forEach(([icon, label, href]) => {
        const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener";
        a.innerHTML = "<span>" + icon + "</span> " + label; pop.appendChild(a);
      });
      const c = document.createElement("button"); c.type = "button"; c.innerHTML = "<span>🔗</span> Copy link";
      c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => {
        c.innerHTML = "<span>✓</span> Copied"; }).catch(() => {}); };
      pop.appendChild(c);
      el.appendChild(pop);
      setTimeout(() => document.addEventListener("click", onDoc), 0);
    };
  }

  function build() {
    const reader = document.querySelector("#reader");
    if (!reader || reader.querySelector("#ybshowcase")) return;
    css();
    const sc = document.createElement("div");
    sc.id = "ybshowcase";
    /* 1) the tour video, right under the Christ quote (which the home renders above) */
    let h = "<video class='ybtour' src='" + APPBASE + "assets/video/tour.mp4' autoplay muted loop playsinline controls " +
      "poster='" + APPBASE + "assets/video/tour_poster.jpg'></video>";
    /* 2) What is YahBible? */
    h += "<div class='lead'><h2>What is YahBible?</h2>" +
      "<p>The whole counsel of Scripture — to read, search and study, in the original Hebrew, Greek and Aramaic, on any device, offline. Free for life.</p></div>";
    /* 3) table of contents — tap any feature to jump to it (the fish returns you here) */
    h += "<nav class='ybtoc' id='ybtoc'><h2 class='sec'>Explore</h2><ol>";
    FEATURES.forEach(([img, t], i) => { h += "<li style='--c:" + TOCCOLORS[i] + "'><a data-toc='ybf" + i + "'>" + t + "</a></li>"; });
    h += "<li style='--c:" + TOCCOLORS[10] + "'><a data-toc='ybget'>Download &amp; install</a></li>";
    h += "<li style='--c:" + TOCCOLORS[11] + "'><a data-toc='ybcmp'>Compare with other apps</a></li></ol></nav>";
    /* 4) features (each anchored for the table of contents) */
    h += "<h2 class='sec'>Features</h2>";
    FEATURES.forEach(([img, t, d], i) => {
      h += "<div class='feat' id='ybf" + i + "' style='--c:" + TOCCOLORS[i] + "'><div class='txt'><h3 class='holo'>" + t + "</h3><p>" + d + "</p></div>" +
        "<figure><img loading='lazy' data-full='" + B + img + "' src='" + B + img + "' alt='" + t + "'>" +
        "<figcaption>click to enlarge</figcaption></figure></div>";
    });
    /* under the hood: limitless memory + infinite context, with credits */
    h += "<h2 class='sec'>Under the hood</h2>";
    h += "<div class='strip'>" +
      "<div class='chip'><b>Limitless memory</b><span>Tav'iel remembers the start of a thousand-turn conversation — an infinite long-term memory that never loses the thread.</span></div>" +
      "<div class='chip'><b>Infinite context</b><span>Give it a document of any size and it answers from the whole of it, condensed through a toroidal knowledge store.</span></div>" +
      "<div class='chip'><b>Offline &amp; private</b><span>The search, the reasoning, the word study and the Gauntlet all run on your device — no signal, no account, no data leaving.</span></div>" +
      "</div>";
    h += "<p style='text-align:center;opacity:.72;font-size:13.5px;max-width:700px;margin:14px auto 0'>" +
      "With thanks — infinite context over documents draws on the toroidal Holorite knowledge of " +
      "<a href='https://huggingface.co/OhBeOneKeyNoBe' target='_blank' rel='noopener' style='color:#e8d9ae'>Yahweh Tsidkenu</a>, " +
      "and on the Adèlic KV-condenser research of " +
      "<a href='https://huggingface.co/sneedjak' target='_blank' rel='noopener' style='color:#e8d9ae'>Sneedjak</a>.</p>";
    /* 5) download / install links */
    const Q0 = APPBASE + "assets/qr/";
    h += "<h2 class='sec' id='ybget'>Download &amp; install</h2><div class='getgrid'>" +
      "<div class='get'><h4>iPhone &amp; iPad</h4><img class='qr' src='" + Q0 + "iphone.png' alt='Scan to open YahBible'>" +
      "<p>Open in Safari, tap <b>Share</b> → <b>Add to Home Screen</b> — installs like an app, works offline.</p>" +
      "<a class='dl' href='https://realizeus.org/yahbible'>Open the web app</a></div>" +
      "<div class='get'><h4>Android</h4><img class='qr' src='" + Q0 + "android.png' alt='Get YahBible on Android'>" +
      "<p>Add the web app to your home screen from Chrome's menu, or install the APK.</p>" +
      "<a class='dl' href='https://huggingface.co/OhBeOneKeyNoBe/YahBible-Mobile/resolve/main/YahBible-v2.apk'>Download the APK</a></div>" +
      "<div class='get'><h4>Desktop</h4><img class='qr' src='" + Q0 + "desktop.png' alt='Get YahBible for desktop'>" +
      "<p>The full-power Windows edition, with every study tool and the AI guide.</p>" +
      "<a class='dl' href='https://github.com/OhBeOneKeyNoBe/YahBible/releases/latest' target='_blank' rel='noopener'>Download for Windows</a></div>" +
      "</div>";
    /* 5) comparison vs other Bible apps — rendered as one designed image */
    h += "<h2 class='sec' id='ybcmp'>YahBible vs. other Bible apps</h2>";
    let cmpSrc = "";
    try { cmpSrc = comparisonImage(); } catch (e) { cmpSrc = ""; }
    if (cmpSrc) h += "<img class='cmpimg' src='" + cmpSrc + "' alt='Comparison: YahBible vs. YouVersion, Logos and Blue Letter Bible'>";
    h += "<p class='cmpkey'><span style='color:#4fd684;font-weight:700'>✓</span> yes &middot; " +
      "<span style='color:#f2cf3e;font-weight:700'>$</span> requires payment or subscription &middot; " +
      "<span style='color:#8a86a0;font-weight:700'>✕</span> no. Only YahBible is fully offline — including its AI search " +
      "and reasoning — and stays free with no trial or subscription. Other apps' names belong to their owners.</p>";
    /* 6) the dedication — the elect gathered in the wilderness; the citation opens in the app */
    h += "<div class='dedwrap'><img class='dedimg' loading='lazy' src='" + B + "gathering.png' alt='The gathering of the elect of God in the wilderness'>" +
      "<blockquote class='dedication'>Dedicated to God's Children, that they might come to know thee the only true God, and Jesus Christ whom thou hast sent." +
      "<cite><a data-ref='John 17:3'>John 17:3</a></cite></blockquote></div>";
    /* share — Web Share where available, plus direct social links */
    h += "<div class='sharerow' id='ybshare'></div>";
    h += "<button class='cta'>Start reading &rarr;</button>";
    sc.innerHTML = h;
    buildShare(sc.querySelector("#ybshare"));
    reader.appendChild(sc);
    /* broken screenshots collapse to text, never a broken-image icon */
    sc.querySelectorAll(".feat img").forEach((im) => {
      im.addEventListener("error", () => { const f = im.closest("figure"); if (f) f.style.display = "none"; });
      im.addEventListener("click", () => lightbox(im.dataset.full || im.src, im.alt));
    });
    /* the comparison image enlarges on tap (scroll-zoom / drag-pan lightbox) */
    const cimg = sc.querySelector(".cmpimg");
    if (cimg) cimg.addEventListener("click", () => lightbox(cimg.src, cimg.alt));
    const cta = sc.querySelector(".cta");
    if (cta) cta.onclick = () => plainHome();
    const scroller = document.querySelector("#mid") || sc.parentElement || window;
    const toEl = (el) => { if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
    /* table of contents → jump to a feature / section */
    sc.querySelectorAll("[data-toc]").forEach((a) => { a.onclick = () => toEl(document.getElementById(a.dataset.toc)); });
    /* the dedication citation opens the verse in the app itself (not a search) */
    sc.querySelectorAll("[data-ref]").forEach((a) => {
      a.onclick = () => {
        const ref = a.dataset.ref;
        plainHome();                                   // leave the showcase first
        setTimeout(() => {
          if (window.gotoRef) { try { window.gotoRef(ref); return; } catch (e) {} }
          const m = String(ref).match(/^([\w\s]+?)\s+(\d+):(\d+)/);
          if (m && window.openChapter) { try { window.openChapter(m[1].trim(), +m[2], +m[3]); } catch (e) {} }
        }, 80);
      };
    });
    /* the wilderness image collapses cleanly if the asset isn't present yet */
    const di = sc.querySelector(".dedimg");
    if (di) di.addEventListener("error", () => { di.style.display = "none"; });
    /* the EXISTING scroll fish doubles as "back to the index": a tap (not a drag)
       swims up to the table of contents while the showcase is open. */
    const sf = document.getElementById("scrollfish");
    if (sf && !sf.__ybtoc) {
      sf.__ybtoc = 1;
      let dy0 = 0, moved = false;
      sf.addEventListener("pointerdown", (e) => { dy0 = e.clientY; moved = false; });
      sf.addEventListener("pointermove", (e) => { if (Math.abs(e.clientY - dy0) > 6) moved = true; });
      sf.addEventListener("pointerup", () => { if (!moved) { const toc = document.getElementById("ybtoc"); if (toc) toEl(toc); } });
    }
  }

  function plainHome() {
    const sc = document.querySelector("#reader #ybshowcase");
    if (sc) sc.remove();
    if (window.goHome) { try { window.goHome(); } catch (e) {} }
  }
  function landing() {
    /* usual home first (random Christ verse + brand), then the showcase */
    if (window.goHome) { try { window.goHome(); } catch (e) {} }
    setTimeout(build, 60);
    setTimeout(build, 400);   // in case home renders async
  }
  window.YBpresentation = landing;

  function wire() {
    const hb = document.getElementById("homebtn");
    if (hb && !hb.dataset.ybland) {
      hb.dataset.ybland = "1";
      hb.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        /* on the showcase already? clicking YahBible again goes to plain home,
           without the feature funnel. Otherwise open the landing. */
        if (document.querySelector("#reader #ybshowcase")) plainHome();
        else landing();
      }, true);
    }
  }
  addEventListener("DOMContentLoaded", wire);
  setInterval(wire, 1500);
})();
