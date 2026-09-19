/* Shalom'iel browser client — a real 1:1 messaging endpoint for the web/PWA.
   Mirrors app/client.py: identity + ratchet keys live only here; the coordinator carries
   opaque ciphertext envelopes and public directory keys, never plaintext/keys/IPs. Uses the
   byte-faithful browser Double Ratchet (shalomiel_ratchet.js) so it interoperates with the
   Python endpoint. Envelope + mailbox-id formats match client.py exactly. Works in the
   browser and in Node 24 (both expose fetch). */
"use strict";
(function (root) {
  const NB = root.NB || (typeof globalThis !== "undefined" && globalThis.NB);
  const SR = root.ShalomielRatchet ||
    (typeof module !== "undefined" && module.require && module.require("./shalomiel_ratchet.js"));
  if (!NB || !SR) throw new Error("noble_bundle.js + shalomiel_ratchet.js must load first");
  const _TE = new TextEncoder();
  const te = (s) => _TE.encode(s);
  const { hex, unhex, enc, dec } = SR;

  const concat = (...as) => { let n = 0; for (const a of as) n += a.length;
    const o = new Uint8Array(n); let i = 0; for (const a of as) { o.set(a, i); i += a.length; } return o; };
  const u16 = (n) => new Uint8Array([(n >>> 8) & 255, n & 255]);
  const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const rd32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const lp = (b) => concat(u16(b.length), b);
  const readLp = (b, o) => { const n = (b[o] << 8) | b[o + 1]; return [b.slice(o + 2, o + 2 + n), o + 2 + n]; };

  function mailboxId(handle) {
    // sha256(label("MAILBOX"), handle)[:16].hex()  == app/client.py _mailbox_id
    return hex(NB.sha256(concat(te("SHALOMIEL/v1/MAILBOX"), te(handle))).slice(0, 16));
  }

  class Transport {
    constructor(url) { this.url = url.replace(/\/$/, ""); }
    async _post(path, body) {
      const r = await fetch(this.url + path, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return r.json();
    }
    async _get(path) { return (await fetch(this.url + path, { cache: "no-store" })).json(); }
    register(handle, idPub, ratchetPub) {
      return this._post("/register", { handle, id_pub: idPub, ratchet_pub: ratchetPub }); }
    directory() { return this._get("/directory"); }
    mailboxPut(mid, envHex, kind) {
      return this._post("/mailbox/put", { mailbox_id: mid, envelope: envHex, expires_at_ms: 0, kind }); }
    mailboxFetch(mid) { return this._get("/mailbox/fetch?mailbox_id=" + mid); }
    mailboxAck(messageId) { return this._post("/mailbox/ack", { message_id: messageId }); }
  }

  class ShalomielClient {
    constructor(handle, coordUrl) {
      this.handle = handle;
      this.t = new Transport(coordUrl);
      const id = SR.genKeypair(), r = SR.genKeypair();
      this.idPriv = id.priv; this.idPub = id.pub;
      this.ratchetPriv = r.priv; this.ratchetPub = r.pub;
      this.directory = {};
      this.sessions = {};
    }
    async register() { return this.t.register(this.handle, hex(this.idPub), hex(this.ratchetPub)); }
    async refreshDirectory() { this.directory = await this.t.directory(); return this.directory; }
    async _peer(handle) {
      if (!this.directory[handle]) await this.refreshDirectory();
      return this.directory[handle];
    }
    async _sessionWith(peer) {
      if (this.sessions[peer]) return this.sessions[peer];
      const info = await this._peer(peer);
      const sk = SR.handshakeInitiator(this.idPriv, unhex(info.id_pub));
      const dr = this.handle < peer
        ? SR.DoubleRatchet.initAlice(sk, unhex(info.ratchet_pub))
        : SR.DoubleRatchet.initBob(sk, this.ratchetPriv, this.ratchetPub);
      this.sessions[peer] = dr;
      return dr;
    }
    async sendText(peer, text) {
      const dr = await this._sessionWith(peer);
      const { header, blob } = dr.encrypt(enc(text));
      const env = concat(lp(te(this.handle)), unhex(header.dh_pub), u32(header.pn), u32(header.n), unhex(blob));
      return this.t.mailboxPut(mailboxId(peer), hex(env), "text");
    }
    async receive() {
      const res = await this.t.mailboxFetch(mailboxId(this.handle));
      const out = [];
      for (const item of (res.items || [])) {
        if (item.kind !== "text") continue;
        const env = unhex(item.envelope);
        const [senderB, off] = readLp(env, 0);
        const sender = dec(senderB);
        const dhPub = env.slice(off, off + 32);
        const pn = rd32(env, off + 32);
        const n = rd32(env, off + 36);
        const blob = env.slice(off + 40);
        const dr = await this._sessionWith(sender);
        try {
          const text = dec(dr.decrypt({ dh_pub: hex(dhPub), pn, n }, hex(blob)));
          out.push({ from: sender, text });
          await this.t.mailboxAck(item.message_id);
        } catch (e) { /* leave undecryptable messages for retry */ }
      }
      return out;
    }
  }

  const api = { ShalomielClient, mailboxId };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShalomielClient = ShalomielClient, root.ShalomielClientAPI = api;
})(typeof window !== "undefined" ? window : globalThis);
