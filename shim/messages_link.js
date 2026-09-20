/* Adds a "Private Messages" entry inside the Profile page (not a floating button — that
   covered the mobile bottom menu). The messages page is self-contained under ./messages/,
   holds keys in the browser, and needs a coordinator URL (set on the page, or via
   window.YB_SHALOM_COORD). Injected by observing #reader so it survives re-renders and
   needs no change to the core page. */
(function () {
  if (typeof document === "undefined") return;

  function href() {
    let h = "messages/";
    try { if (window.YB_SHALOM_COORD) h += "?coord=" + encodeURIComponent(window.YB_SHALOM_COORD); } catch (e) {}
    return h;
  }

  function inject(pane) {
    if (!pane || pane.querySelector("#shalom-msg-entry")) return;
    const wrap = document.createElement("div");
    wrap.id = "shalom-msg-entry";
    wrap.style.cssText = "margin-top:14px;border-top:1px solid var(--line,#232a34);padding-top:12px";
    const label = document.createElement("div");
    label.textContent = "🔒 Private messages";
    label.style.cssText = "font:800 10.5px Inter,system-ui,sans-serif;letter-spacing:.08em;" +
      "text-transform:uppercase;color:var(--mut,#8b949e);margin-bottom:4px";
    const hint = document.createElement("div");
    hint.textContent = "End-to-end encrypted — your keys stay on this device; the server only relays ciphertext.";
    hint.style.cssText = "font:12px Inter,system-ui,sans-serif;color:var(--mut,#8b949e);margin-bottom:8px";
    const a = document.createElement("a");
    a.className = "go";
    a.href = href(); a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Open Private Messages";
    a.style.cssText = "display:inline-block;text-decoration:none";
    wrap.appendChild(label); wrap.appendChild(hint); wrap.appendChild(a);
    pane.appendChild(wrap);
  }

  function scan() {
    const pane = document.querySelector("#reader .profpane") || document.querySelector(".profpane");
    if (pane) inject(pane);
  }

  function start() {
    const reader = document.getElementById("reader") || document.body;
    scan();
    try {
      new MutationObserver(() => scan()).observe(reader, { childList: true, subtree: true });
    } catch (e) { setInterval(scan, 1500); }  // fallback if MutationObserver is unavailable
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
