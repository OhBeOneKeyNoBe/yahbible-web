/* Shalom'iel Double Ratchet — browser port, byte-faithful to shalomiel/session.py.
   X25519 + HKDF-SHA256 + HMAC-SHA256 + XChaCha20-Poly1305, all via the vendored, audited
   @noble bundle (noble_bundle.js -> global NB), which is byte-verified against libsodium
   (the Python side). This gives phones/browsers TRUE end-to-end encryption identical to the
   Python endpoint, so a JS client and a Python client share one ratchet session.

   Disclosed, same as the Python side: the ratchet/handshake are the spec's PROTOTYPE-
   UNREVIEWED substitution for Signal/Noise; forward secrecy + post-compromise recovery hold
   by construction, but this is not an accredited audit. */
"use strict";
(function (root) {
  const NB = root.NB || (typeof globalThis !== "undefined" && globalThis.NB);
  if (!NB) throw new Error("noble_bundle.js (global NB) must load before shalomiel_ratchet.js");
  const CR = (root.crypto || (typeof globalThis !== "undefined" && globalThis.crypto));
  const te = new TextEncoder();
  const td = new TextDecoder();
  const DOMAIN_ROOT = "SHALOMIEL/v1";
  const MAX_SKIP = 256;

  const rand = (n) => CR.getRandomValues(new Uint8Array(n));
  const label = (s) => te.encode(DOMAIN_ROOT + "/" + s);
  const concat = (...as) => { let n = 0; for (const a of as) n += a.length;
    const o = new Uint8Array(n); let i = 0; for (const a of as) { o.set(a, i); i += a.length; } return o; };
  const eq = (a, b) => { if (!a || !b || a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
  const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  const unhex = (h) => { const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; };
  const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

  // primitives (match kdf.py / sealed.py exactly)
  const hkdf = (salt, ikm, info, len) => NB.hkdf(NB.sha256, ikm, salt, info, len);
  const hmac = (key, msg) => NB.hmac(NB.sha256, key, msg);
  const dh = (priv, pub) => NB.x25519.getSharedSecret(priv, pub);
  const dhPub = (priv) => NB.x25519.getPublicKey(priv);
  const seal = (key, nonce, pt, aad) => NB.xchacha20poly1305(key, nonce, aad).encrypt(pt); // ct||tag
  const open = (key, nonce, combined, aad) => NB.xchacha20poly1305(key, nonce, aad).decrypt(combined);

  function genKeypair() { const priv = rand(32); return { priv, pub: dhPub(priv) }; }
  function handshakeInitiator(myIdPriv, theirIdPub) {
    return hkdf(label("HANDSHAKE-SALT"), dh(myIdPriv, theirIdPub), label("HANDSHAKE"), 32);
  }
  function kdfRk(rk, dhOut) { const o = hkdf(rk, dhOut, label("RATCHET-ROOT"), 64);
    return [o.slice(0, 32), o.slice(32)]; }
  function kdfCk(ck) { return [hmac(ck, new Uint8Array([2])), hmac(ck, new Uint8Array([1]))]; } // [newCk, mk]

  function headerBytes(h) { return concat(h.dh_pub, u32(h.pn), u32(h.n)); }

  class DoubleRatchet {
    constructor(o) { Object.assign(this, { dhr_pub: null, cks: null, ckr: null,
      ns: 0, nr: 0, pn: 0, skipped: {} }, o); }

    static initAlice(sk, bobDhPub) {
      const { priv, pub } = genKeypair();
      const [rk, cks] = kdfRk(sk, dh(priv, bobDhPub));
      return new DoubleRatchet({ rk, dhs_priv: priv, dhs_pub: pub, dhr_pub: bobDhPub, cks });
    }
    static initBob(sk, bobDhPriv, bobDhPub) {
      return new DoubleRatchet({ rk: sk, dhs_priv: bobDhPriv, dhs_pub: bobDhPub });
    }

    encrypt(plaintext, aad) {
      if (!this.cks) throw new Error("no sending chain yet");
      aad = aad || new Uint8Array(0);
      const [cks, mk] = kdfCk(this.cks); this.cks = cks;
      const header = { dh_pub: this.dhs_pub, pn: this.pn, n: this.ns };
      this.ns += 1;
      const nonce = rand(24);
      const combined = seal(mk, nonce, plaintext, concat(aad, headerBytes(header)));
      return { header: { dh_pub: hex(header.dh_pub), pn: header.pn, n: header.n },
               blob: hex(concat(nonce, combined)) };
    }

    _clone() {
      const c = new DoubleRatchet({ rk: this.rk, dhs_priv: this.dhs_priv, dhs_pub: this.dhs_pub,
        dhr_pub: this.dhr_pub, cks: this.cks, ckr: this.ckr, ns: this.ns, nr: this.nr, pn: this.pn });
      c.skipped = Object.assign({}, this.skipped); return c;
    }
    _skip(until) {
      if (!this.ckr) return;
      if (until - this.nr > MAX_SKIP) throw new Error("too many skipped messages");
      while (this.nr < until) { const [ckr, mk] = kdfCk(this.ckr); this.ckr = ckr;
        this.skipped[hex(this.dhr_pub) + ":" + this.nr] = mk; this.nr += 1; }
    }
    _dhRatchet(hdrDhPub) {
      this.pn = this.ns; this.ns = 0; this.nr = 0; this.dhr_pub = hdrDhPub;
      [this.rk, this.ckr] = kdfRk(this.rk, dh(this.dhs_priv, this.dhr_pub));
      const { priv, pub } = genKeypair(); this.dhs_priv = priv; this.dhs_pub = pub;
      [this.rk, this.cks] = kdfRk(this.rk, dh(this.dhs_priv, this.dhr_pub));
    }
    decrypt(headerHex, blobHex, aad) {
      aad = aad || new Uint8Array(0);
      const header = { dh_pub: unhex(headerHex.dh_pub), pn: headerHex.pn, n: headerHex.n };
      const blob = unhex(blobHex);
      const nonce = blob.slice(0, 24), combined = blob.slice(24);
      const ad = concat(aad, headerBytes(header));
      const skKey = hex(header.dh_pub) + ":" + header.n;
      if (this.skipped[skKey]) {
        const mk = this.skipped[skKey];
        const pt = open(mk, nonce, combined, ad); delete this.skipped[skKey]; return pt;
      }
      const work = this._clone();
      if (!work.dhr_pub || !eq(header.dh_pub, work.dhr_pub)) { work._skip(header.pn); work._dhRatchet(header.dh_pub); }
      work._skip(header.n);
      const [ckr, mk] = kdfCk(work.ckr); work.ckr = ckr; work.nr += 1;
      const pt = open(mk, nonce, combined, ad);  // throws on tamper -> `this` untouched
      Object.assign(this, { rk: work.rk, dhs_priv: work.dhs_priv, dhs_pub: work.dhs_pub,
        dhr_pub: work.dhr_pub, cks: work.cks, ckr: work.ckr, ns: work.ns, nr: work.nr,
        pn: work.pn, skipped: work.skipped });
      return pt;
    }
  }

  const api = { DoubleRatchet, genKeypair, handshakeInitiator, hex, unhex,
                enc: (s) => te.encode(s), dec: (b) => td.decode(b) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShalomielRatchet = api;
})(typeof window !== "undefined" ? window : globalThis);
