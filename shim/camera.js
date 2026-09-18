/* YahBible Web — self-cam / streaming camera with a WORKING greenscreen.
   Ports the front/back/both camera from the Android edition and adds real
   background removal via MediaPipe Selfie Segmentation (vendored locally, so it
   works offline and under CSP). Each camera is an independent, draggable,
   resizable overlay with its own controls: shape (circle / landscape / portrait),
   border colour, mirror, and greenscreen (auto-remove background). A 🎥 button in
   the header opens the front / back / both menu. */
"use strict";
(function () {
  const APPBASE = (window.YBWEB && window.YBWEB.base) ||
    new URL("..", document.currentScript.src).href;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* ---------- styles ---------- */
  function injectCss() {
    if (document.getElementById("ybcam-css")) return;
    const s = document.createElement("style");
    s.id = "ybcam-css";
    s.textContent =
      "#ybcambtn{background:none;border:none;font-size:19px;cursor:pointer;line-height:1;padding:2px 4px;opacity:.9}" +
      "#ybcambtn.on{filter:drop-shadow(0 0 5px #59b8ff)}" +
      "#ybcammenu{position:fixed;z-index:100000;background:#141031f2;border:1px solid #c9a86a66;" +
      "border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;box-shadow:0 8px 30px #000c}" +
      "#ybcammenu button{background:#1c1536;border:1px solid #c9a86a44;color:#efe6cf;border-radius:8px;" +
      "padding:8px 14px;font:13px system-ui;cursor:pointer;text-align:left}" +
      ".ybcam{position:fixed;z-index:99998;width:180px;height:180px;left:16px;bottom:96px;overflow:hidden;" +
      "border:3px solid #c07ad9;box-shadow:0 4px 20px #000a;background:#000;touch-action:none;display:none}" +
      ".ybcam.on{display:block}" +
      ".ybcam.cf-round{border-radius:50%}.ybcam.cf-land{border-radius:14px;height:120px;width:210px}" +
      ".ybcam.cf-port{border-radius:16px;height:230px;width:150px}" +
      ".ybcam video,.ybcam canvas{width:100%;height:100%;object-fit:cover;display:block}" +
      ".ybcam.mir video,.ybcam.mir canvas{transform:scaleX(-1)}" +
      ".ybcam.green{background:transparent}" +
      ".ybcam.holoborder{border-color:transparent;background-clip:padding-box;" +
      "box-shadow:0 0 0 3px hsl(var(--h,0) 90% 60%),0 4px 20px #000a;animation:ybhue 6s linear infinite}" +
      "@keyframes ybhue{to{--h:360}}" +
      ".ybcam .camctl{position:absolute;top:4px;left:0;right:0;display:flex;justify-content:center;gap:6px;" +
      "opacity:0;transition:.15s;z-index:2}" +
      ".ybcam:hover .camctl,.ybcam.show .camctl{opacity:1}" +
      ".ybcam .camctl button{width:26px;height:26px;border-radius:50%;border:none;background:#000a;color:#fff;" +
      "font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center}";
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- prefs (per camera, persisted) ---------- */
  const COLORS = ["#e0563b", "#e8912e", "#e7c94e", "#5fd39a", "#59b8ff", "#6a7be8",
    "#c07ad9", "#ff7ac6", "#ffffff", "holo"];
  const FORMS = ["round", "land", "port"];
  function allPrefs() { try { return JSON.parse(localStorage.getItem("ybw_cam") || "{}"); } catch (e) { return {}; } }
  function prefs(id) {
    const d = id === "cam2" ? { color: 4, form: "round", mirror: false, green: false }
                            : { color: 6, form: "round", mirror: true, green: false };
    return Object.assign(d, (allPrefs()[id] || {}));
  }
  function savePref(id, p) { const a = allPrefs(); a[id] = Object.assign(prefs(id), p); localStorage.setItem("ybw_cam", JSON.stringify(a)); }

  const streams = {};      // id -> MediaStream
  const seg = {};          // id -> SelfieSegmentation instance
  const rafs = {};         // id -> raf id

  function applyPref(id) {
    const cam = document.getElementById(id); if (!cam) return;
    const p = prefs(id);
    FORMS.forEach((f) => cam.classList.remove("cf-" + f));
    cam.classList.add("cf-" + p.form);
    cam.classList.toggle("mir", !!p.mirror);
    cam.classList.toggle("green", !!p.green);
    const c = COLORS[p.color % COLORS.length];
    cam.classList.toggle("holoborder", c === "holo");
    if (c !== "holo") cam.style.borderColor = c;
    const vid = cam.querySelector("video"), cv = cam.querySelector("canvas");
    if (p.green) { if (vid) vid.style.display = "none"; if (cv) cv.style.display = "block"; }
    else { if (vid) vid.style.display = "block"; if (cv) cv.style.display = "none"; }
  }

  /* ---------- MediaPipe greenscreen ---------- */
  let mpLoading = null;
  function loadMP() {
    if (window.SelfieSegmentation) return Promise.resolve();
    if (mpLoading) return mpLoading;
    mpLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = APPBASE + "vendor/selfie/selfie_segmentation.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return mpLoading;
  }
  async function startGreen(id) {
    const cam = document.getElementById(id);
    const vid = cam.querySelector("video"), cv = cam.querySelector("canvas");
    try { await loadMP(); } catch (e) { return; }
    if (!window.SelfieSegmentation) return;
    if (!seg[id]) {
      seg[id] = new window.SelfieSegmentation({
        locateFile: (f) => APPBASE + "vendor/selfie/" + f,
      });
      seg[id].setOptions({ modelSelection: 1 });
      seg[id].onResults((r) => {
        const ctx = cv.getContext("2d");
        cv.width = r.image.width; cv.height = r.image.height;
        ctx.save();
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(r.segmentationMask, 0, 0, cv.width, cv.height);
        ctx.globalCompositeOperation = "source-in";       // keep only the person
        ctx.drawImage(r.image, 0, 0, cv.width, cv.height);
        ctx.restore();
      });
    }
    const pump = async () => {
      if (!prefs(id).green || !streams[id]) return;
      try { await seg[id].send({ image: vid }); } catch (e) {}
      rafs[id] = requestAnimationFrame(pump);
    };
    pump();
  }
  function stopGreen(id) { if (rafs[id]) cancelAnimationFrame(rafs[id]); rafs[id] = null; }

  /* ---------- camera lifecycle ---------- */
  const facingOf = {};                 // "user" | "environment" per overlay (for flip)
  function camNote(msg) {
    var n = document.getElementById("ybcamnote"); if (n) n.remove();
    n = el("div"); n.id = "ybcamnote";
    n.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:150px;z-index:100001;" +
      "max-width:88vw;background:#141031f2;border:1px solid #c9a86a66;color:#efe6cf;border-radius:12px;" +
      "padding:9px 14px;font:12.5px system-ui;box-shadow:0 6px 30px #000b;text-align:center";
    n.textContent = msg; document.body.appendChild(n);
    setTimeout(function () { if (n && n.parentNode) n.remove(); }, 5500);
  }
  async function openStream(id, facing) {
    try { streams[id] = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false }); }
    catch (e) {
      try { streams[id] = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      catch (e2) { return false; }
    }
    facingOf[id] = facing;
    const cam = document.getElementById(id), vid = cam.querySelector("video");
    vid.srcObject = streams[id]; vid.muted = true; vid.playsInline = true;
    await vid.play().catch(() => {});
    cam.classList.add("on");
    if (id === "cam2") { cam.style.left = "auto"; cam.style.right = "16px"; }
    else { cam.style.right = "auto"; cam.style.left = "16px"; }
    applyPref(id);
    if (prefs(id).green) startGreen(id);
    /* A phone that can only keep ONE camera live (iOS Safari) mutes/ends the older
       stream when a second opens — drop that overlay so there's no dead black box. */
    const trk = streams[id].getVideoTracks()[0];
    if (trk) {
      trk.addEventListener("ended", function () { stopCam(id); });
      trk.addEventListener("mute", function () { setTimeout(function () { if (trk.muted && streams[id]) stopCam(id); }, 500); });
    }
    return true;
  }
  async function startCam(mode) {
    injectDom();
    const wants = mode === "both" ? ["cam", "cam2"] : mode === "environment" ? ["cam2"] : ["cam"];
    for (const id of wants) await openStream(id, id === "cam2" ? "environment" : "user");
    if (mode === "both") {
      setTimeout(function () {
        const live = ["cam", "cam2"].filter(function (id) { return streams[id]; }).length;
        if (live < 2) camNote("This device streams one camera at a time — tap ⟲ on the camera to flip front / back.");
      }, 1000);
    }
    const btn = document.getElementById("ybcambtn");
    if (btn && (streams.cam || streams.cam2)) btn.classList.add("on");
  }
  async function flipCam(id) {          // switch this overlay front ↔ back
    const next = facingOf[id] === "environment" ? "user" : "environment";
    stopGreen(id);
    if (streams[id]) { streams[id].getTracks().forEach(function (t) { t.stop(); }); delete streams[id]; }
    await openStream(id, next);
  }
  function stopCam(id) {
    if (id) {
      stopGreen(id);
      if (streams[id]) { streams[id].getTracks().forEach((t) => t.stop()); delete streams[id]; }
      const cam = document.getElementById(id); if (cam) cam.classList.remove("on");
    } else { stopCam("cam"); stopCam("cam2"); }
    if (!streams.cam && !streams.cam2) {
      const btn = document.getElementById("ybcambtn"); if (btn) btn.classList.remove("on");
    }
  }

  /* ---------- overlay controls + drag/resize ---------- */
  function buildOverlay(id) {
    if (document.getElementById(id)) return;
    const cam = el("div", "ybcam");
    cam.id = id;
    cam.appendChild(el("video"));
    cam.appendChild(el("canvas"));
    const ctl = el("div", "camctl");
    const mk = (t, title, fn) => { const b = el("button", null, t); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
    ctl.appendChild(mk("◑", "Greenscreen", () => { const p = prefs(id); savePref(id, { green: !p.green }); applyPref(id); if (!p.green) startGreen(id); else stopGreen(id); }));
    ctl.appendChild(mk("⬗", "Shape", () => { const p = prefs(id); savePref(id, { form: FORMS[(FORMS.indexOf(p.form) + 1) % FORMS.length] }); applyPref(id); }));
    ctl.appendChild(mk("🎨", "Border colour", () => { const p = prefs(id); savePref(id, { color: (p.color + 1) % COLORS.length }); applyPref(id); }));
    ctl.appendChild(mk("⇋", "Mirror", () => { const p = prefs(id); savePref(id, { mirror: !p.mirror }); applyPref(id); }));
    ctl.appendChild(mk("⟲", "Flip front / back", () => flipCam(id)));
    ctl.appendChild(mk("✕", "Close", () => stopCam(id)));
    cam.appendChild(ctl);
    document.body.appendChild(cam);
    dragResize(cam);
    cam.addEventListener("click", () => { cam.classList.add("show"); setTimeout(() => cam.classList.remove("show"), 2500); });
  }
  function dragResize(cam) {
    let sx, sy, ox, oy, drag = false, pinch = false, startDist = 0, startW = 0;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    cam.addEventListener("touchstart", (e) => {
      if (e.target.closest(".camctl")) return;
      if (e.touches.length === 2) { pinch = true; drag = false; startDist = dist(e.touches); startW = cam.offsetWidth; }
      else { drag = true; pinch = false; const p = e.touches[0]; sx = p.clientX; sy = p.clientY;
        const r = cam.getBoundingClientRect(); ox = r.left; oy = r.top; cam.style.bottom = "auto"; cam.style.right = "auto"; }
    }, { passive: true });
    cam.addEventListener("touchmove", (e) => {
      if (pinch && e.touches.length === 2) {
        const w = Math.max(90, Math.min(innerWidth * 0.95, startW * dist(e.touches) / startDist));
        cam.style.width = w + "px"; cam.style.height = w + "px"; e.preventDefault(); return;
      }
      if (drag) { const p = e.touches[0]; let x = ox + (p.clientX - sx), y = oy + (p.clientY - sy);
        x = Math.max(2, Math.min(innerWidth - cam.offsetWidth - 2, x));
        y = Math.max(52, Math.min(innerHeight - cam.offsetHeight - 2, y));
        cam.style.left = x + "px"; cam.style.top = y + "px"; e.preventDefault(); }
    }, { passive: false });
    cam.addEventListener("touchend", () => { drag = false; pinch = false; });
    let md = false;
    cam.addEventListener("mousedown", (e) => { if (e.target.closest(".camctl")) return; md = true;
      const r = cam.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      cam.style.bottom = "auto"; cam.style.right = "auto"; });
    addEventListener("mousemove", (e) => { if (!md) return;
      cam.style.left = Math.max(2, ox + (e.clientX - sx)) + "px";
      cam.style.top = Math.max(52, oy + (e.clientY - sy)) + "px"; });
    addEventListener("mouseup", () => md = false);
  }
  function injectDom() { buildOverlay("cam"); buildOverlay("cam2"); }

  /* ---------- header button + menu ---------- */
  function openMenu() {
    document.querySelectorAll("#ybcammenu").forEach((x) => x.remove());
    if (streams.cam || streams.cam2) { stopCam(); return; }
    const m = el("div"); m.id = "ybcammenu";
    m.appendChild((() => { const b = el("button", null, "🤳 Front camera"); b.onclick = () => { m.remove(); startCam("user"); }; return b; })());
    m.appendChild((() => { const b = el("button", null, "📷 Back camera"); b.onclick = () => { m.remove(); startCam("environment"); }; return b; })());
    m.appendChild((() => { const b = el("button", null, "🎬 Both"); b.onclick = () => { m.remove(); startCam("both"); }; return b; })());
    m.style.zIndex = "2147483001";                  // above the Settings takeover / everything
    const btn = document.getElementById("ybcambtn");
    const r = btn ? btn.getBoundingClientRect() : null;
    const mobile = (typeof matchMedia === "function" && matchMedia("(max-width:820px)").matches) ||
      (document.body && document.body.classList.contains("framed")) || !(r && r.width > 0);
    let backdrop = null;
    if (mobile) {                                   // centred modal + tap-away backdrop
      backdrop = el("div"); backdrop.id = "ybcammbg";
      backdrop.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:#0007";
      document.body.appendChild(backdrop);
      m.style.top = "50%"; m.style.left = "50%"; m.style.right = "auto";
      m.style.transform = "translate(-50%,-50%)";
      m.style.minWidth = "min(78vw,300px)";
    }
    document.body.appendChild(m);
    if (!mobile) {                                  // desktop: anchor under the button, then clamp
      m.style.top = (r.bottom + 6) + "px";
      m.style.right = Math.max(6, innerWidth - r.right) + "px";
      const mr = m.getBoundingClientRect();
      if (mr.left < 6) { m.style.right = "auto"; m.style.left = "6px"; }
      if (mr.bottom > innerHeight - 6) m.style.top = Math.max(6, innerHeight - mr.height - 6) + "px";
    }
    const close = () => { m.remove(); if (backdrop) backdrop.remove(); document.removeEventListener("click", off); };
    const off = (e) => { if (!m.contains(e.target) && e.target !== btn) close(); };
    if (backdrop) backdrop.onclick = close;
    setTimeout(() => document.addEventListener("click", off), 0);
  }
  function ensureButton() {
    if (document.getElementById("ybcambtn")) return;
    const bar = document.querySelector("#topbar");
    if (!bar) return;
    const btn = el("button", null, "🎥"); btn.id = "ybcambtn"; btn.title = "Camera — front / back / both, with greenscreen";
    btn.onclick = openMenu;
    /* sit to the LEFT of the holographic star (✦ #splitplus) in the header */
    const star = document.getElementById("splitplus");
    if (star && star.parentNode) star.parentNode.insertBefore(btn, star);
    else {
      const anchor = document.getElementById("mrightbtn") || document.getElementById("tavielbtn");
      if (anchor && anchor.parentNode === bar) bar.insertBefore(btn, anchor);
      else bar.appendChild(btn);
    }
  }

  addEventListener("DOMContentLoaded", () => { injectCss(); ensureButton(); });
  setInterval(ensureButton, 1500);   // header may build late

  /* Public API so the Settings panel can drive the two independent streams
     (front = cam, back = cam2): ring colour, shape, greenscreen, mirror. */
  window.YBCAM = {
    COLORS: COLORS, FORMS: FORMS,
    get: (id) => prefs(id),
    set: (id, p) => { savePref(id, p); applyPref(id); },
    open: openMenu,
  };
})();
