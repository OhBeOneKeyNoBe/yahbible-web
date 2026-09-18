/* YahBible Web — Data Packs drawer.
   A floating scroll-seal button opens a drawer listing every data pack
   (scripture versions, lexicon, corpus, dictionary, Tav'iel KB, apocrypha),
   each with install/update + live progress, plus the storage estimate and a
   persist-storage request. First visit with no packs shows a gentle banner. */
"use strict";
(function () {
  /* native O'Tav'iel desktop = the real Python backend serves everything; there is
     no OPFS pack layer to manage, so the packs drawer is inert. */
  if (window.YB_NATIVE) return;
  const rpc = window.YBWEB.rpc;
  const NICE = {
    "watchman/watchman.db": ["King James Bible", "the complete KJV with instant search — install this first"],
    "Holorites_data/daeos/taviel_versions.sqlite": ["All Bible Versions", "every translation for verse-by-verse comparison (large)"],
    "Holorites_data/daeos/taviel_corpus.sqlite": ["Sacred Corpus", "red-letter words + the wider corpus library"],
    "Holorites_data/daeos/english_dict.sqlite": ["English Dictionary", "offline definitions for any English word"],
    "Holorites_data/daeos/reflected_red_basic.sqlite": ["Lexicon + Interlinear", "Hebrew/Greek originals, Strong's, interlinear"],
    "Holorites/torus_upgrades/enoch_source.sqlite": ["Enoch Sources", "1/2/3 Enoch source texts"],
    "Holorites_data/daeos/elaniel_yt.sqlite": ["Nine Keys", "chapter revelation insights"],
    "web/taviel_kb.sqlite": ["Tav'iel Knowledge", "the grounded answers Tav'iel speaks from"],
    "web/apoc_pack.json": ["Apocrypha Library", "every apocryphal source, book and chapter"],
  };
  const ORDER = Object.keys(NICE);
  /* Essentials small enough to bring in with the app on first visit (~27MB gz):
     KJV, lexicon+interlinear, English dictionary, Tav'iel KB, nine keys, enoch.
     The heavy opt-ins (all-versions 233MB, corpus, apocrypha) stay manual. */
  const AUTO = ["watchman/watchman.db",
                "Holorites_data/daeos/reflected_red_basic.sqlite",
                "Holorites_data/daeos/english_dict.sqlite",
                "web/taviel_kb.sqlite",
                "Holorites_data/daeos/elaniel_yt.sqlite",
                "Holorites/torus_upgrades/enoch_source.sqlite"];
  const fmt = (b) => b > 9e8 ? (b / 1e9).toFixed(1) + " GB" : b > 9e5 ? (b / 1e6).toFixed(0) + " MB"
    : Math.max(1, Math.round(b / 1e3)) + " KB";

  const css = document.createElement("style");
  css.textContent = `
  #ybpk-btn{position:fixed;right:14px;bottom:14px;z-index:99990;width:46px;height:46px;
    border-radius:50%;border:1px solid #c9a86a55;background:radial-gradient(circle at 30% 30%,#1c1536,#0a0818);
    color:#e8d9ae;font-size:20px;cursor:pointer;box-shadow:0 2px 14px #000a;display:flex;
    align-items:center;justify-content:center}
  #ybpk-btn .dot{position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:50%;
    background:#e0b34e;border:2px solid #0a0818;display:none}
  #ybpk{position:fixed;right:10px;bottom:68px;z-index:99991;width:min(340px,92vw);
    max-height:min(70vh,560px);overflow:auto;border-radius:14px;border:1px solid #c9a86a44;
    background:#0d0a1ef2;color:#efe6cf;font:13px/1.45 system-ui,sans-serif;
    box-shadow:0 8px 40px #000c;padding:12px 12px 10px;display:none}
  #ybpk h3{margin:2px 0 8px;font-size:14px;letter-spacing:.4px;color:#e8d9ae}
  #ybpk .row{display:flex;align-items:center;gap:8px;padding:7px 4px;border-top:1px solid #ffffff12}
  #ybpk .nm{flex:1;min-width:0}
  #ybpk .nm b{display:block;font-weight:600;font-size:12.5px}
  #ybpk .nm span{display:block;font-size:11px;opacity:.68}
  #ybpk button.get{border:1px solid #c9a86a66;background:#1c1536;color:#e8d9ae;border-radius:8px;
    padding:4px 10px;font-size:12px;cursor:pointer;white-space:nowrap}
  #ybpk .ok{color:#8fd49b;font-size:12px;white-space:nowrap}
  #ybpk .bar{height:4px;border-radius:2px;background:#ffffff1c;margin-top:4px;overflow:hidden;display:none}
  #ybpk .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c9a86a,#e8d9ae)}
  #ybpk .foot{margin-top:8px;font-size:11px;opacity:.72}
  #ybpk-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:70px;z-index:76;
    background:#141031f0;border:1px solid #c9a86a55;color:#efe6cf;border-radius:12px;
    padding:9px 14px;font:12.5px system-ui,sans-serif;box-shadow:0 6px 30px #000b;max-width:88vw}
  #ybpk-banner b{color:#e8d9ae}`;
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(css));

  let st = null, ui = null;
  async function refresh() {
    st = await rpc("status", {});
    if (!ui) return;
    const list = ui.querySelector("#ybpk-list");
    list.innerHTML = "";
    const files = [...st.files].sort((a, b) =>
      (ORDER.findIndex((k) => a.rel.endsWith(k)) + 99 * (ORDER.findIndex((k) => a.rel.endsWith(k)) < 0)) -
      (ORDER.findIndex((k) => b.rel.endsWith(k)) + 99 * (ORDER.findIndex((k) => b.rel.endsWith(k)) < 0)));
    for (const f of files) {
      const key = ORDER.find((k) => f.rel.endsWith(k));
      if (!key) continue;                 // only surface the packs the web app uses
      const [name, blurb] = NICE[key];
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="nm"><b>${name}</b><span>${blurb} · ${fmt(f.gz_size)} download</span>
        <div class="bar"><i></i></div></div>`;
      if (f.installed) {
        const ok = document.createElement("span");
        ok.className = "ok"; ok.textContent = "✓ installed";
        row.appendChild(ok);
      } else {
        const btn = document.createElement("button");
        btn.className = "get"; btn.textContent = "Install";
        btn.onclick = async () => {
          btn.disabled = true; btn.textContent = "…";
          const bar = row.querySelector(".bar"), fill = bar.querySelector("i");
          bar.style.display = "block";
          try {
            await rpc("install", { rel: f.rel }, (p) => {
              fill.style.width = Math.min(100, Math.round(p.got * 100 / p.total)) + "%";
            });
            await rpc("persist", {});
          } catch (e) {
            btn.disabled = false; btn.textContent = "Retry";
            row.querySelector(".nm span").textContent = "failed: " + String(e.message || e).slice(0, 60);
            return;
          }
          refresh();
        };
        row.appendChild(btn);
      }
      list.appendChild(row);
    }
    const foot = ui.querySelector(".foot");
    const inst = files.filter((f) => NICE[ORDER.find((k) => f.rel.endsWith(k))] && f.installed).length;
    const used = st.quota ? " · using " + fmt(st.quota.usage || 0) : "";
    foot.textContent = inst + " packs installed" + used +
      " — packs live on this device and work fully offline.";
    const dot = document.querySelector("#ybpk-btn .dot");
    if (dot) dot.style.display = inst === 0 ? "block" : "none";
    return inst;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    /* On iPhone (and anywhere OPFS can't run) we serve Scripture from the HTTP
       store, not installable packs — so skip the whole Data Packs UI and the
       auto-install (which would fail forever and reveal a stale download button). */
    if (window.YBSTORE && window.YBSTORE.ready) {
      try { await window.YBSTORE.ready(); } catch (e) {}
      if (window.YBSTORE.mode) return;
    }
    const btn = document.createElement("button");
    btn.id = "ybpk-btn"; btn.title = "Data Packs";
    btn.innerHTML = "🗎<span class='dot'></span>";
    /* Everything auto-installs (essentials up front, the rest in the background)
       and anything absent installs on click, so this manual button stays hidden.
       It reveals itself only as a retry affordance if a download keeps failing. */
    btn.style.display = "none";
    document.body.appendChild(btn);
    ui = document.createElement("div");
    ui.id = "ybpk";
    ui.innerHTML = `<h3>Data Packs</h3><div id="ybpk-list"></div><div class="foot"></div>`;
    document.body.appendChild(ui);
    btn.onclick = () => {
      ui.style.display = ui.style.display === "block" ? "none" : "block";
      if (ui.style.display === "block") refresh();
    };
    await refresh().catch(() => null);
    autoInstall();
  });

  /* bring the essentials in on first visit, smallest first, with a slim toast;
     one-time (installed packs are skipped), resumable, never blocks the UI. Then
     quietly continue with EVERY remaining pack in the background (the full
     apocrypha library, the corpus, the canon-fill, and all translations) so the
     whole app becomes fully offline as the user explores — most devices on wifi
     handle it, and anything still downloading is also covered by click-to-install. */
  async function autoInstall() {
    if (localStorage.getItem("ybw_autodone") !== "1") {
      const need = [];
      for (const rel of AUTO) {
        const f = (st.files || []).find((x) => x.rel.endsWith(rel));
        if (f && !f.installed) need.push(f);
      }
      if (need.length) {
        need.sort((a, b) => a.gz_size - b.gz_size);
        const toast = document.createElement("div");
        toast.id = "ybpk-banner";
        document.body.appendChild(toast);
        const totalBytes = need.reduce((s, f) => s + (f.gz_size || 0), 0) || 1;
        let doneBytes = 0;
        const setPct = (cur) => {
          const pct = Math.min(99, Math.round((doneBytes + (cur || 0)) / totalBytes * 100));
          toast.innerHTML = "<b>Preparing YahBible… " + pct + "%</b> — downloading the Scripture, " +
            "lexicon and dictionary so it all works offline. <i>You can start reading now.</i>";
        };
        setPct(0);
        for (const f of need) {
          try { await rpc("install", { rel: f.rel }, (p) => setPct(p && p.got)); } catch (e) {}
          doneBytes += (f.gz_size || 0); setPct(0);
        }
        try { await rpc("persist", {}); } catch (e) {}
        toast.innerHTML = "<b>Ready — 100%.</b> YahBible is installed on this device and works offline.";
        setTimeout(() => toast.remove(), 6000);
      }
      localStorage.setItem("ybw_autodone", "1");
      if (ui && ui.style.display === "block") refresh();
    }
    backgroundFillAll();
  }

  /* After a short idle, pull every remaining pack in the background — smallest
     first, one at a time (installs are serialized in the worker), no UI noise
     beyond the drawer's own state. Runs whenever packs are still missing. */
  let bgRunning = false;
  async function backgroundFillAll() {
    if (bgRunning) return;
    bgRunning = true;
    try {
      await new Promise((r) => setTimeout(r, 8000));   // let the essentials + first reads settle
      st = await rpc("status", {});
      const rest = (st.files || [])
        .filter((f) => NICE[ORDER.find((k) => f.rel.endsWith(k))] && !f.installed)
        .sort((a, b) => a.gz_size - b.gz_size);
      for (const f of rest) {
        try { await rpc("install", { rel: f.rel }); await rpc("persist", {}); } catch (e) {}
        if (ui && ui.style.display === "block") refresh();
      }
      st = await rpc("status", {});
      maybeRevealButton();      // show the manual retry button only if something failed
    } finally { bgRunning = false; }
  }
  function maybeRevealButton() {
    const btn = document.getElementById("ybpk-btn");
    if (!btn || !st) return;
    const missing = (st.files || [])
      .filter((f) => NICE[ORDER.find((k) => f.rel.endsWith(k))] && !f.installed).length;
    btn.style.display = missing > 0 ? "flex" : "none";
  }
})();
