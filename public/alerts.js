// Alert setup for /alerts — browser push + Slack/Discord webhook, using the
// SAME backend endpoints and the SAME "oo-stack" localStorage as the board, so
// alerts cover the services you've already picked. No board UI required here.
(function () {
  var STACK_KEY = "oo-stack", PUSH_ON = "oo-push-on", PUSH_TOKEN = "oo-push-token";

  function stack() {
    try { return JSON.parse(localStorage.getItem(STACK_KEY) || "[]"); } catch (e) { return []; }
  }
  function $(id) { return document.getElementById(id); }
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

  async function enablePush() {
    var set = function (t) { var s = $("al-push-state"); if (s) s.textContent = t; };
    var providers = stack();
    if (!providers.length) return set("add services on the board first");
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return set("blocked — allow notifications in site settings, then retry");
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") return set("not enabled");
      var reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      var key = (await (await fetch("/api/push/key")).json()).key;
      if (!key) return set("push unavailable right now");
      var sub = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
      var res = await fetch("/api/push/subscribe", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), providers: providers }),
      });
      var d = await res.json().catch(function () { return {}; });
      if (res.ok && d.ok) {
        localStorage.setItem(PUSH_TOKEN, d.token);
        localStorage.setItem(PUSH_ON, "1");
        set("on — you’ll get a ping when a watched service changes");
        $("al-push-btn").textContent = "🔔 Browser alerts on";
      } else { set(d.error || "could not enable"); }
    } catch (e) { set("could not enable browser alerts"); }
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
        body: JSON.stringify({ url: url, providers: providers }),
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
    if (!pushSupported()) { var row = $("al-push-row"); if (row) row.style.display = "none"; }
    var pb = $("al-push-btn");
    if (pb) {
      if (localStorage.getItem(PUSH_ON) === "1") pb.textContent = "🔔 Browser alerts on";
      pb.addEventListener("click", enablePush);
    }
    var hb = $("al-hook-btn");
    if (hb) hb.addEventListener("click", connectHook);
  });
})();
