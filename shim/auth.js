/* YahBible Web — unified accounts on the RealizeUS Supabase, through the
   supabase-js SDK with DEFAULT session storage. On the realizeus.org origin the
   React site stores its GoTrue session in plain localStorage under the default
   key (sb-<ref>-auth-token); by using the SDK with the same project + default
   storage this app SHARES that exact session — sign in on realizeus.org and you
   are signed in to YahBible, and vice-versa: one account across the ecosystem.
   The publishable key is a PUBLIC client key (safe to ship); every privileged
   read/write stays behind Supabase Row-Level Security. Degrades safely: if the
   SDK can't load, the browser-local auth in boot.js remains in effect. */
"use strict";
(function () {
  const SUPA_URL = "https://qkfmjdprvtayfhigsahk.supabase.co";
  const SUPA_KEY = "sb_publishable_7my5ZdJ8smVhnJk1IziJ9A_uUf6WNIr";
  const H = window.YBH, P = window.YBP;
  if (!H || !P) return;                       // boot.js must have loaded first
  const realFetch = window.fetch;             // patched by boot; Supabase is cross-origin → passthrough
  const J = (obj, code) => new Response(JSON.stringify(obj), {
    status: code || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
  const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s || "");
  const VENDOR = (function () {
    try { return new URL("../vendor/supabase.js",
      (document.currentScript && document.currentScript.src) || location.href).href; }
    catch (e) { return "vendor/supabase.js"; }
  })();

  /* one SDK client, default storage → shares realizeus.org's session on this origin.
     iOS standalone ("Add to Home Screen") is a separate storage container and can
     evict script-writable storage, so we mirror the GoTrue session into a backup
     key AND into Cache Storage (which survives localStorage eviction), then
     rehydrate from whichever copy is still present at launch. */
  let _c = null;
  const SKEY = "sb-qkfmjdprvtayfhigsahk-auth-token";

  const BKEY = "ybw_sess_mirror";
  const CACHE = "yahbible-session";
  const CURL = "https://yahbible.local/session";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  async function cacheRead() {
    try {
      if (!self.caches) return null;
      const c = await caches.open(CACHE);
      const r = await c.match(CURL);
      return r ? await r.text() : null;
    } catch (e) { return null; }
  }
  async function cacheWrite(v) {
    try {
      if (!self.caches) return;
      const c = await caches.open(CACHE);
      if (v == null) await c.delete(CURL);
      else await c.put(CURL, new Response(v, { headers: { "Content-Type": "application/json" } }));
    } catch (e) {}
  }
  function mirror(v) { lsSet(BKEY, v); cacheWrite(v); }

  /* explicit sign-out is the ONLY thing that clears the mirror; a failed refresh
     (offline, app resumed after days) must never log the user out. */
  let signingOut = false;

  const ready = (async () => {
    try {
      /* rehydrate BEFORE the client reads storage */
      if (!lsGet(SKEY)) {
        const backup = lsGet(BKEY) || (await cacheRead());
        if (backup) lsSet(SKEY, backup);
      }
      if (!(window.supabase && window.supabase.createClient)) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = VENDOR; s.onload = res; s.onerror = () => rej(new Error("supabase sdk failed"));
          (document.head || document.documentElement).appendChild(s);
        });
      }
      _c = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
                storageKey: SKEY, storage: window.localStorage, flowType: "pkce" },
      });
      _c.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") { if (signingOut) mirror(null); else { /* keep mirror */ } return; }
        if (session) mirror(JSON.stringify({ currentSession: session, expiresAt: session.expires_at }));
      });
      /* an iPhone app resumed from the background has stale timers: refresh on wake */
      const wake = () => {
        if (document.visibilityState !== "visible" || !_c) return;
        _c.auth.getSession().then(({ data }) => {
          if (data && data.session) return;
          const backup = lsGet(BKEY);
          if (!backup) return;
          try {
            const s = JSON.parse(backup).currentSession;
            if (s && s.refresh_token) _c.auth.setSession(
              { access_token: s.access_token, refresh_token: s.refresh_token });
          } catch (e) {}
        }).catch(() => {});
      };
      document.addEventListener("visibilitychange", wake);
      window.addEventListener("pageshow", wake);
    } catch (e) { _c = null; }
    return _c;
  })();
  window.YBAUTH = { ready: () => ready, get client() { return _c; } };

  function userOf(session) {
    if (!session || !session.user) return null;
    const u = session.user, m = u.user_metadata || {};
    return { user: m.username || m.handle || (u.email || "").split("@")[0] || u.id,
             email: u.email || "", id: u.id, handle: m.handle || m.username || "" };
  }
  async function sessionUser() {
    const c = await ready; if (!c) return null;
    try {
      const { data } = await c.auth.getSession();
      if (data && data.session) return userOf(data.session);
      /* offline / expired-timer launch: trust the mirrored session's user so the
         app doesn't throw up the login wall while the token refresh is pending */
      const backup = lsGet(BKEY);
      if (backup) {
        const s = JSON.parse(backup).currentSession;
        if (s && s.refresh_token) {
          try { await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token }); } catch (e) {}
          const again = await c.auth.getSession();
          if (again.data && again.data.session) return userOf(again.data.session);
          return userOf(s);
        }
      }
      return null;
    }
    catch (e) { return null; }
  }


  /* ---------- auth endpoints (override boot.js browser-local base) ---------- */
  P["/api/signup"] = async (body) => {
    const c = await ready; if (!c) return J({ ok: false, error: "sign-in service unavailable" });
    const email = isEmail(body.username) ? body.username : (body.email || "");
    const username = isEmail(body.username)
      ? (body.name || (body.username || "").split("@")[0]) : body.username;
    if (!email || !body.password)
      return J({ ok: false, error: "email and password required to sync across devices" });
    const { data, error } = await c.auth.signUp({
      email, password: body.password,
      options: { data: { username, handle: (body.handle || username || "").replace(/^@/, "") } } });
    if (error) return J({ ok: false, error: error.message || "sign-up failed" });
    return J({ ok: true, user: username,
      note: data && !data.session ? "Check your email to confirm your account." : undefined });
  };
  P["/api/login"] = async (body) => {
    const c = await ready; if (!c) return J({ ok: false, error: "sign-in service unavailable" });
    const id = (body.username || "").trim();
    if (!id || !body.password) return J({ ok: false, error: "enter your email and password" });
    /* Accounts are the RealizeUS Supabase accounts, keyed by email. Handles live
       in the public profiles table but email is (correctly) not exposed there, so
       sign-in is by email — the same credential used on realizeus.org. */
    if (!isEmail(id)) return J({ ok: false, error: "Sign in with the email you use on realizeus.org." });
    const { data, error } = await c.auth.signInWithPassword({ email: id, password: body.password });
    if (error || !data || !data.user)
      return J({ ok: false, error: (error && error.message) || "wrong email or password" });
    const su = userOf(data.session || { user: data.user });
    return J({ ok: true, user: su ? su.user : id });
  };
  H["/api/me"] = async () => J((await sessionUser()) || { user: null });
  H["/api/logout"] = async () => {
    const c = await ready;
    signingOut = true;
    if (c) { try { await c.auth.signOut(); } catch (e) {} }
    lsSet(SKEY, null); mirror(null);
    signingOut = false;
    return J({ ok: true });
  };

  P["/api/change_password"] = async (body) => {
    const c = await ready; if (!c) return J({ ok: false, error: "unavailable" });
    const { error } = await c.auth.updateUser({ password: body.new || "" });
    return J(error ? { ok: false, error: error.message || "could not change password" } : { ok: true });
  };
  H["/api/check_name"] = async (q) => {
    const c = await ready;
    const nm = (q.get("name") || "").trim().replace(/^@/, "");
    let name_taken = false;
    if (c && nm) {
      try {
        const { data } = await c.from("profiles").select("handle").eq("handle", nm).limit(1);
        name_taken = Array.isArray(data) && data.length > 0;
      } catch (e) {}
    }
    /* email is intentionally not exposed in profiles; Supabase enforces email
       uniqueness on sign-up itself, so we don't pre-check it here. */
    return J({ name_taken, email_taken: false });
  };

  /* ---------- profile: RealizeUS.me is the source of the public profile ---------- */
  async function realizeProfile(handle) {
    try {
      const r = await realFetch(location.origin + "/api/import_realizeus?handle=" + encodeURIComponent(handle));
      const j = await r.json();
      if (j && (j.found || j.avatar || j.bio)) return j;
    } catch (e) {}
    return null;
  }
  /* Persist the account's handle into a profiles row (there is no signup trigger),
     so it survives, shows on the profile, and powers handle lookups. Best-effort. */
  async function ensureProfileRow(su) {
    const c = await ready; if (!c || !su || !su.id || !su.handle) return;
    try { await c.from("profiles").upsert({ id: su.id, handle: su.handle, display_name: su.handle },
      { onConflict: "id" }); } catch (e) {}
  }
  H["/api/profile"] = async () => {
    const su = await sessionUser();
    if (!su) return J({ ok: false, error: "not signed in" });
    const handle = su.handle || su.user;
    ensureProfileRow(su);
    /* read the synced profile: name + avatar from the Supabase profiles row, and
       bio + social links from the account metadata (kept there so no schema change
       is needed). This is the same account across web/desktop/phone, so what the
       desktop synced shows here too. */
    let prow = null, meta = {};
    try {
      const c = await ready;
      if (c) {
        if (su.id) { const { data } = await c.from("profiles").select("handle,display_name,avatar_url").eq("id", su.id).limit(1); prow = data && data[0]; }
        const { data: u } = await c.auth.getUser(); meta = (u && u.user && u.user.user_metadata) || {};
      }
    } catch (e) {}
    const social = Array.isArray(meta.social) ? meta.social : [];   // page renders .map(), needs an array
    return J({ ok: true, user: (prow && prow.display_name) || su.user, email: su.email,
      handle: (prow && prow.handle) || handle, realizeus: (prow && prow.handle) || handle,
      name: (prow && prow.display_name) || meta.name || "", avatar: (prow && prow.avatar_url) || meta.avatar || "",
      bio: meta.bio || "", social, synced: true });
  };
  P["/api/profile"] = async (body) => {                            // save profile, synced across devices
    const c = await ready; const su = await sessionUser();
    if (!c || !su) return J({ ok: false, error: "sign in first" });
    const name = (body.name || "").trim(), avatar = (body.avatar || "").trim(), bio = (body.bio || "").trim();
    const social = Array.isArray(body.social) ? body.social : [];
    const ru = (body.realizeus || "").trim().replace(/^@/, "");
    try {
      await c.auth.updateUser({ data: { name, avatar, bio, social } });
      await c.from("profiles").upsert({ id: su.id, handle: ru || su.handle || su.user,
        display_name: name || su.user, avatar_url: avatar }, { onConflict: "id" });
      return J({ ok: true });
    } catch (e) { return J({ ok: false, error: (e && e.message) || "could not save profile" }); }
  };
  /* set / correct the @handle on the signed-in account (fixes a mis-typed handle) */
  P["/api/set_handle"] = async (body) => {
    const c = await ready; const su = await sessionUser();
    if (!c || !su) return J({ ok: false, error: "sign in first" });
    const h = (body.handle || "").trim().replace(/^@/, "").replace(/[^A-Za-z0-9_.-]/g, "");
    if (!h) return J({ ok: false, error: "enter a handle" });
    try {
      await c.auth.updateUser({ data: { username: h, handle: h } });
      await c.from("profiles").upsert({ id: su.id, handle: h, display_name: h }, { onConflict: "id" });
      return J({ ok: true, handle: h });
    } catch (e) { return J({ ok: false, error: (e && e.message) || "could not save handle" }); }
  };
  H["/api/notes"] = async () => {
    const c = await ready; const su = await sessionUser();
    if (!c || !su) return J({ notes: {} });
    try {
      const { data } = await c.from("notes").select("key,body").eq("user_id", su.id);
      if (Array.isArray(data)) { const o = {}; data.forEach((n) => { o[n.key] = n.body; }); return J({ notes: o }); }
    } catch (e) {}
    return J({ notes: {} });
  };
  /* The login field was labelled "username", which led people to type their
     @handle and fail (Supabase signs in by EMAIL). Relabel it: email on the
     Sign-in tab, @handle on the Create-account tab. */
  function tuneAuthUI() {
    const user = document.getElementById("au_user");
    const tabs = document.getElementById("authtabs");
    if (!user || !tabs || user.__ybtuned) return;
    user.__ybtuned = 1;
    const apply = () => {
      const active = tabs.querySelector("button.on");
      const signup = active && active.getAttribute("data-a") === "signup";
      if (signup) { user.placeholder = "choose a @handle"; }
      else { user.placeholder = "email address"; user.setAttribute("inputmode", "email"); user.setAttribute("autocomplete", "email"); }
    };
    tabs.addEventListener("click", () => setTimeout(apply, 0));
    apply();
  }
  setInterval(tuneAuthUI, 1000); tuneAuthUI();

  /* Once signed in, let the user set/correct their @handle from the profile pane
     (their account may have no handle, or a mis-typed one). */
  function injectHandleEditor() {
    const pane = document.querySelector("#reader .profpane, .profpane");
    if (!pane || pane.querySelector(".ybhandle")) return;
    sessionUser().then((su) => {
      if (!su || !pane.isConnected || pane.querySelector(".ybhandle")) return;
      const wrap = document.createElement("div");
      wrap.className = "ybhandle";
      wrap.style.cssText = "margin:10px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap";
      const hv = (su.handle || "").replace(/"/g, "&quot;");
      wrap.innerHTML = "<span style='opacity:.7'>@handle</span>" +
        "<input class='ybh_in' value=\"" + hv + "\" placeholder='your @handle' " +
        "style='flex:1;min-width:130px;padding:6px 8px;border-radius:8px;border:1px solid #c9a86a55;background:#1c1536;color:#eee'>" +
        "<button class='ybh_save' style='padding:6px 12px;border-radius:8px;border:1px solid #c9a86a55;background:#2a2050;color:#f3e8c8;cursor:pointer'>Save</button>" +
        "<span class='ybh_msg' style='opacity:.75;font-size:12px'></span>";
      pane.insertBefore(wrap, pane.firstChild);
      const inp = wrap.querySelector(".ybh_in"), btn = wrap.querySelector(".ybh_save"), msg = wrap.querySelector(".ybh_msg");
      btn.onclick = async () => {
        msg.textContent = "saving…";
        try {
          const r = await realFetch(location.origin + "/api/set_handle", { method: "POST",
            headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: inp.value }) });
          const j = await r.json();
          msg.textContent = j.ok ? "saved ✓ @" + j.handle : (j.error || "failed");
        } catch (e) { msg.textContent = "failed"; }
      };
    });
  }
  setInterval(injectHandleEditor, 1200);

  P["/api/note"] = async (body) => {
    const c = await ready; const su = await sessionUser();
    if (!c || !su) return J({ ok: false, error: "sign in to save notes across devices" });
    try {
      await c.from("notes").upsert({ user_id: su.id, key: body.key, body: body.body },
        { onConflict: "user_id,key" });
      return J({ ok: true });
    } catch (e) { return J({ ok: false, error: "could not save" }); }
  };

  /* ---------- reading progress: synced across devices via Supabase ---------- */
  P["/api/progress"] = async (body) => {
    const c = await ready; const su = await sessionUser();
    if (!c || !su) return J({ ok: false });
    if (!body || !body.ref) return J({ ok: true });
    try {
      await c.from("reading_progress").upsert({ user_id: su.id, ref: body.ref },
        { onConflict: "user_id,ref", ignoreDuplicates: true });
    } catch (e) {}
    return J({ ok: true });
  };
  H["/api/progress_summary"] = async () => {
    const c = await ready; const su = await sessionUser();
    const total = 1189;
    if (!c || !su) return J({ overall: { read: 0, total, pct: 0 }, sources: [] });
    try {
      const { count } = await c.from("reading_progress")
        .select("ref", { count: "exact", head: true }).eq("user_id", su.id);
      const read = count || 0;
      return J({ overall: { read, total, pct: Math.round(read * 1000 / total) / 10 }, sources: [] });
    } catch (e) {
      return J({ overall: { read: 0, total, pct: 0 }, sources: [] });
    }
  };
})();
