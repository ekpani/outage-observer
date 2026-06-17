// Alert setup for /alerts — browser push + Slack/Discord webhook, using the
// SAME backend endpoints and the SAME "oo-stack" localStorage as the board, so
// alerts cover the services you've already picked. No board UI required here.
(function () {
  var STACK_KEY = "oo-stack", PUSH_ON = "oo-push-on", PUSH_TOKEN = "oo-push-token", REGIONS_KEY = "oo-regions";

  function stack() {
    try { return JSON.parse(localStorage.getItem(STACK_KEY) || "[]"); } catch (e) { return []; }
  }
  function $(id) { return document.getElementById(id); }

  // Region preference (empty = everywhere). Persisted, and sent with every
  // subscribe so the server filters alerts (global/unknown always come through).
  function regions() {
    var out = [], cbs = document.querySelectorAll(".al-region-cb");
    for (var i = 0; i < cbs.length; i++) if (cbs[i].checked) out.push(cbs[i].value);
    return out;
  }
  function regionState() {
    var s = $("al-region-state"); if (!s) return;
    var n = regions().length;
    s.textContent = n ? ("Notifying about " + n + " region" + (n > 1 ? "s" : "")) : "Notifying everywhere";
  }
  function saveRegions() {
    try { localStorage.setItem(REGIONS_KEY, JSON.stringify(regions())); } catch (e) {}
    regionState();
    if (localStorage.getItem(PUSH_ON) === "1") enablePush();   // resync stored regions
  }
  function loadRegions() {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem(REGIONS_KEY) || "[]"); } catch (e) {}
    var cbs = document.querySelectorAll(".al-region-cb");
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = saved.indexOf(cbs[i].value) !== -1;
      cbs[i].addEventListener("change", saveRegions);
    }
    regionState();
  }
  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function urlB64ToU8(b) {
    var pad = "=".repeat((4 - (b.length % 4)) % 4);
    var s = (b + pad).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function refreshStack() {
    var ids = stack(), n = ids.length, el = $("al-stack");
    if (el) {
      if (n === 0) {
        el.innerHTML = 'You’re not watching anything yet. <a href="/">Build your board</a> first, then switch on alerts here.';
      } else {
        el.textContent = "Alerts cover the " + n + " service" + (n > 1 ? "s" : "") + " you’re watching — edit them on the board.";
      }
    }
    var feed = $("al-stack-feed");
    if (feed) feed.href = n ? "/feed.xml?ids=" + ids.join(",") : "/feed.xml";
  }

  function pushState(t) { var s = $("al-push-state"); if (s) s.textContent = t; }
  function renderPushUI() {
    var btn = $("al-push-btn"); if (!btn) return;
    var on = localStorage.getItem(PUSH_ON) === "1";
    btn.textContent = on ? "🔔 Browser alerts on" : "🔔 Enable browser notifications";
    btn.classList.toggle("on", on);
    pushState(on ? "tap to turn off" : "");
  }

  async function enablePush() {
    var providers = stack();
    if (!providers.length) return pushState("add services on the board first");
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return pushState("blocked — allow notifications in site settings, then retry");
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") return pushState("not enabled");
      var reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      var key = (await (await fetch("/api/push/key")).json()).key;
      if (!key) return pushState("push unavailable right now");
      var sub = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
      var res = await fetch("/api/push/subscribe", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), providers: providers, regions: regions() }),
      });
      var d = await res.json().catch(function () { return {}; });
      if (res.ok && d.ok) {
        localStorage.setItem(PUSH_TOKEN, d.token);
        localStorage.setItem(PUSH_ON, "1");
        renderPushUI();
      } else { pushState(d.error || "could not enable"); }
    } catch (e) { pushState("could not enable browser alerts"); }
  }

  async function disablePush() {
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      var sub = reg && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    } catch (e) {}
    var token = localStorage.getItem(PUSH_TOKEN);
    if (token) {
      try {
        await fetch("/api/push/unsubscribe", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: token }),
        });
      } catch (e) {}
    }
    localStorage.removeItem(PUSH_ON);
    localStorage.removeItem(PUSH_TOKEN);
    renderPushUI();
  }

  function togglePush() {
    if (localStorage.getItem(PUSH_ON) === "1") disablePush(); else enablePush();
  }

  async function connectHook() {
    var set = function (t) { var s = $("al-hook-state"); if (s) s.textContent = t; };
    var url = ($("al-hook-url").value || "").trim(), providers = stack();
    if (!url) return set("paste a Slack or Discord webhook URL");
    if (!providers.length) return set("add services on the board first");
    set("connecting…");
    try {
      var res = await fetch("/api/webhook/subscribe", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url, providers: providers, regions: regions() }),
      });
      var d = await res.json().catch(function () { return {}; });
      if (res.ok && d.ok) {
        set("connected to " + d.kind + " — check the channel for a confirmation");
        $("al-hook-url").value = "";
      } else { set(d.error || "could not connect"); }
    } catch (e) { set("network error — try again"); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    refreshStack();
    loadRegions();
    if (!pushSupported()) { var row = $("al-push-row"); if (row) row.style.display = "none"; }
    var pb = $("al-push-btn");
    if (pb) {
      renderPushUI();
      pb.addEventListener("click", togglePush);
    }
    var hb = $("al-hook-btn");
    if (hb) hb.addEventListener("click", connectHook);
  });
})();
