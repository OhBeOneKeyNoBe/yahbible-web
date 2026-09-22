/* Was this answer any good?

   A like and a dislike on every answer Tav'iel gives, so the asker can say
   whether it served them. The judgement is kept per person and flows upward
   anonymously, where a great answer can be lifted into what Tav'iel knows by
   default and a poor one can be withheld from that profile in future.

   Nothing here identifies anybody. The vote is stored against the account
   already signed in, and what leaves the device is a one-way handle.

   The buttons are attached by observing the chat rather than by editing every
   place an answer is rendered -- answers arrive from a live reply, from a
   reopened conversation, and from the instant gauntlet path, and a watcher
   catches all three without three separate edits to keep in step. */
"use strict";
(function () {
  const VOTES_KEY = "yb-votes";

  function votes() {
    try { return JSON.parse(localStorage.getItem(VOTES_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function remember(id, verdict) {
    try {
      const v = votes();
      v[id] = verdict;
      localStorage.setItem(VOTES_KEY, JSON.stringify(v));
    } catch (e) {}
  }

  /* A stable id for an answer: its own text. The same answer voted twice is
     one judgement, not two, and a reopened conversation shows the vote the
     person already cast. */
  function answerId(text) {
    let h = 5381;
    const s = String(text || "").slice(0, 4000);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return "a" + (h >>> 0).toString(36);
  }

  function send(id, verdict, question, answer) {
    const body = JSON.stringify({
      id: id, verdict: verdict, question: question, answer: answer,
      at: Date.now()
    });
    try {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body
      }).catch(() => {});
    } catch (e) {}
    /* Offline or signed out, the vote still counts: it is queued on the device
       and sent when the app next reaches the server. A judgement lost because
       the network was down is a judgement the system never learns from. */
    try {
      const q = JSON.parse(localStorage.getItem("yb-votes-queue") || "[]");
      q.push(JSON.parse(body));
      localStorage.setItem("yb-votes-queue", JSON.stringify(q.slice(-200)));
    } catch (e) {}
  }

  function lastQuestion(el) {
    let n = el.closest(".msg");
    while (n && (n = n.previousElementSibling)) {
      if (n.classList && n.classList.contains("you")) return n.textContent || "";
    }
    return "";
  }

  function attach(msg) {
    if (!msg || msg.dataset.fb === "1") return;
    const body = msg.querySelector(".tbody");
    if (!body) return;
    if (body.classList.contains("think")) return;      // still generating
    const text = (body.textContent || "").trim();
    if (text.length < 12) return;

    msg.dataset.fb = "1";
    const id = answerId(text);
    const bar = document.createElement("div");
    bar.className = "fbbar";
    bar.innerHTML =
      '<button type="button" class="fbbtn" data-v="1" aria-pressed="false" '
      + 'title="This answer served me">&#128077;<span>Helpful</span></button>'
      + '<button type="button" class="fbbtn" data-v="-1" aria-pressed="false" '
      + 'title="This answer missed">&#128078;<span>Missed it</span></button>'
      + '<span class="fbnote" role="status"></span>';
    msg.appendChild(bar);

    const prior = votes()[id];
    if (prior) {
      const b = bar.querySelector('.fbbtn[data-v="' + prior + '"]');
      if (b) b.setAttribute("aria-pressed", "true");
    }

    bar.querySelectorAll(".fbbtn").forEach((btn) => {
      btn.onclick = () => {
        const v = +btn.dataset.v;
        bar.querySelectorAll(".fbbtn").forEach(
          (b) => b.setAttribute("aria-pressed", String(b === btn)));
        remember(id, v);
        send(id, v, lastQuestion(body), text);
        const note = bar.querySelector(".fbnote");
        note.textContent = v > 0
          ? "Thank you — noted."
          : "Noted. I will not answer you that way again.";
      };
    });
  }

  function sweep() {
    document.querySelectorAll(".msg.tav").forEach(attach);
  }

  function watch() {
    const box = document.getElementById("chatmsgs");
    if (!box) return false;
    if (box.dataset.fbWatch === "1") return true;
    box.dataset.fbWatch = "1";
    new MutationObserver(() => sweep()).observe(
      box, { childList: true, subtree: true, characterData: true });
    sweep();
    return true;
  }

  /* The chat panel is built on demand, so watch for it rather than assuming
     it exists at load. */
  setInterval(watch, 700);
  document.addEventListener("DOMContentLoaded", watch);
  window.__ybFeedbackSweep = sweep;
})();
