/* YahBible creator-feed client -- the phone/PWA side of live creator-post distribution.
   It PINS the creator's Ed25519 public key and trusts nothing else: it verifies the feed
   index signature and each post's own signature before showing anything, so an impostor
   cannot inject a post "from" the creator and a tampered feed is rejected. Byte-compatible
   with creator_feed.py (Ed25519 over canonical JSON). Runs in the browser and Node 24. */
"use strict";
(function (root) {
  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();
  const hex2b = (h) => { const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; };

  // canonical JSON (sorted keys, no spaces) -- must match python json.dumps(sort_keys,separators)
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object")
      return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    return JSON.stringify(v);
  }
  async function edVerify(pubHex, sigHex, bodyObj) {
    try {
      const key = await subtle.importKey("raw", hex2b(pubHex), { name: "Ed25519" }, false, ["verify"]);
      return await subtle.verify({ name: "Ed25519" }, key, hex2b(sigHex), enc.encode(canon(bodyObj)));
    } catch (e) { return false; }
  }

  class CreatorFeedClient {
    constructor(pinnedPubHex) { this.pin = pinnedPubHex; this.lastEpoch = 0; }

    async verifyIndex(feed) {
      const body = (feed && feed.body) || null;
      if (!body || body.author !== this.pin) return false;      // not the pinned creator
      if ((body.epoch | 0) <= this.lastEpoch) return false;      // anti-rollback (monotonic)
      return edVerify(this.pin, feed.sig, body);
    }

    // returns only genuine, creator-signed posts (forged/tampered dropped)
    async read(feed) {
      if (!(await this.verifyIndex(feed))) return [];
      this.lastEpoch = feed.body.epoch | 0;
      const out = [];
      for (const e of feed.body.posts) {
        const s = e.signed;
        if (!s || s.pub !== this.pin) continue;
        if (await edVerify(this.pin, s.sig, s.post)) out.push(s.post);
      }
      return out;
    }

    async fetchFeed(coordUrl) {
      try {
        const r = await fetch(coordUrl.replace(/\/$/, "") + "/feed", { cache: "no-store" });
        if (!r.ok) return [];
        return this.read(await r.json());
      } catch (e) { return []; }
    }
  }

  const api = { CreatorFeedClient, canon, edVerify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YahBibleFeed = api;

  /* ---- YahBible News integration (browser only) ----
     PIN = the creator's public key (safe to ship; the private half stays on the PC).
     The distribution is live once a PUBLIC coordinator URL is set (window.YB_COORD, or
     ?ybcoord= once, remembered) -- until then this is dormant and News is unchanged. A
     phone reaching the internet still needs the PC coordinator publicly reachable. */
  if (typeof window !== "undefined" && window.YBH) {
    const PIN = "8339ebbdf673e5e8f14bbe95ee7bbeb71051ba43277f8b7bf95b8bc882365a8f";
    const H = window.YBH;
    try {
      const qp = new URLSearchParams(location.search).get("ybcoord");
      if (qp) localStorage.setItem("yb_coord", qp);
    } catch (e) {}
    const coordUrl = () => {
      try { return (window.YB_COORD || localStorage.getItem("yb_coord") || "").trim(); }
      catch (e) { return (window.YB_COORD || "").trim(); }
    };
    const client = new CreatorFeedClient(PIN);
    const orig = H["/api/news"];
    H["/api/news"] = async () => {
      let base = { version: "", entries: [] };
      try { base = await (await orig()).json(); } catch (e) {}
      const url = coordUrl();
      let posts = [];
      try {
        if (url) {
          posts = await client.fetchFeed(url);         // live coordinator, if configured
        } else {
          // same-origin static signed feed -- works on any host; the sig+pin make it safe
          const r = await fetch("creator_feed.json", { cache: "no-store" });
          if (r.ok) posts = await client.read(await r.json());
        }
      } catch (e) {}
      if (posts.length) {
        const extra = posts.map((p) => ({
          id: "creator-" + (p.ts || 0), title: p.title || "",
          date: new Date((p.ts || 0) * 1000).toISOString().slice(0, 10),
          category: "creator", icon: "📣", summary: p.body || "", deepLink: "" }));
        base = { version: base.version || "", entries: extra.concat(base.entries || []) };
      }
      return new Response(JSON.stringify(base),
        { headers: { "Content-Type": "application/json; charset=utf-8" } });
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
