/* Adds a small launcher for Shalom'iel private (end-to-end encrypted) messages.
   The messages page is self-contained under ./messages/ and holds keys in the browser;
   it needs a coordinator URL (set on the page, or via window.YB_SHALOM_COORD). Low-risk:
   only injects one floating link, touches no menu DOM. */
(function () {
  if (typeof document === "undefined") return;
  function href() {
    let h = "messages/";
    try { if (window.YB_SHALOM_COORD) h += "?coord=" + encodeURIComponent(window.YB_SHALOM_COORD); } catch (e) {}
    return h;
  }
  function add() {
    if (document.getElementById("shalom-msg-btn")) return;
    const a = document.createElement("a");
    a.id = "shalom-msg-btn";
    a.href = href(); a.target = "_blank"; a.rel = "noopener";
    a.textContent = "🔒 Messages";
    a.title = "Private, end-to-end encrypted messages (Shalom'iel) — keys stay on your device";
    a.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:99998;background:#1f6feb;" +
      "color:#fff;padding:9px 13px;border-radius:20px;font:600 13px system-ui,sans-serif;" +
      "text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.35)";
    (document.body || document.documentElement).appendChild(a);
  }
  if (document.readyState !== "loading") add();
  else document.addEventListener("DOMContentLoaded", add);
})();
