import { CATALOG, CATEGORY_ORDER, POPULAR_IDS, type Provider } from "./catalog";
import { type Level } from "./adapters";
import { EMOJI, LABEL } from "./labels";
import { formatAlert } from "./poller";
import { GEOS, GEO_LABEL, type Geo } from "./regions";
import {
  getBoard,
  getWatch,
  toggleWatch,
  setStack,
  clearWatch,
  addUser,
  removeUser,
  getUserRegions,
  setUserRegions,
} from "./store";
import {
  sendMessage,
  editMessageText,
  answerCallback,
  type Env,
  type InlineKeyboard,
  type InlineButton,
} from "./telegram";

const CAT_EMOJI: Record<string, string> = {
  "Cloud & hosting": "☁️",
  "Dev & CI": "🛠",
  "Data & backend": "🗄",
  "Payments": "💳",
  "Comms": "💬",
  "Auth & identity": "🔑",
  "AI & model providers": "🤖",
  "Collaboration": "🧩",
  "CDN & edge": "🌐",
  "Monitoring": "📈",
  "Commerce & CMS": "🛒",
  "Analytics": "📊",
  "Social & community": "👥",
  "Gaming & streaming": "🎮",
  "Finance & crypto": "💰",
  "Consumer & lifestyle": "🛍",
};

const SEARCH_LIMIT = 8;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function providersIn(category: string): Provider[] {
  return CATALOG.filter((p) => p.category === category);
}

/** Lowercased, colon-free, length-capped query safe to round-trip through a
 *  64-byte callback_data payload. */
function packQuery(q: string): string {
  return q.toLowerCase().replace(/:/g, " ").trim().slice(0, 40);
}

/** Rank matches: name/id starts-with first, then substring, then alphabetical. */
function searchCatalog(query: string): Provider[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = CATALOG
    .map((p) => {
      const name = p.name.toLowerCase();
      let score = -1;
      if (name === q || p.id === q) score = 3;
      else if (name.startsWith(q) || p.id.startsWith(q)) score = 2;
      else if (name.includes(q) || p.id.includes(q)) score = 1;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, SEARCH_LIMIT).map((x) => x.p);
}

// ---------- Keyboards ----------

function tile(on: boolean): string {
  return on ? "✅" : "➕";
}

/** Search-first home: popular individual quick-adds, then browse / done. */
function welcomeKeyboard(watch: Set<string>): InlineKeyboard {
  const rows: InlineButton[][] = [];
  let row: InlineButton[] = [];
  for (const id of POPULAR_IDS) {
    const p = CATALOG.find((x) => x.id === id);
    if (!p) continue;
    row.push({ text: `${tile(watch.has(id))} ${p.name}`, callback_data: `qa:${id}` });
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: "🔎 Browse all by category", callback_data: "cats" }]);
  rows.push([{ text: "🌍 Regions", callback_data: "regions" }]);
  const last: InlineButton[] = [{ text: "✓ Done", callback_data: "done" }];
  if (watch.size) last.unshift({ text: "🧹 Clear", callback_data: "clr" });
  rows.push(last);
  return { inline_keyboard: rows };
}

function regionsKeyboard(prefs: Set<string>): InlineKeyboard {
  const rows: InlineButton[][] = [];
  let row: InlineButton[] = [];
  for (const g of GEOS) {
    row.push({ text: `${tile(prefs.has(g))} ${GEO_LABEL[g]}`, callback_data: `rg:${g}` });
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: prefs.size ? "🌐 Notify me everywhere (clear)" : "✓ Everywhere", callback_data: "rg-all" }]);
  rows.push([{ text: "‹ Back", callback_data: "welcome" }]);
  return { inline_keyboard: rows };
}

function regionsText(prefs: Set<string>): string {
  const sel = prefs.size ? [...prefs].map((g) => GEO_LABEL[g as Geo] ?? g).join(", ") : "Everywhere";
  return (
    "🌍  <b>Regions</b>\n\n" +
    "For providers that report a location (Google Cloud, AWS), I'll only ping you about incidents in the regions you pick. " +
    "Global or unspecified incidents always come through.\n\n" +
    `Currently notifying: <b>${esc(sel)}</b>\n\n` +
    "Tap to toggle. Pick none to be notified everywhere."
  );
}

function categoriesKeyboard(watch: Set<string>): InlineKeyboard {
  const rows = CATEGORY_ORDER.map((cat, i) => {
    const n = providersIn(cat).filter((p) => watch.has(p.id)).length;
    const label = `${CAT_EMOJI[cat] ?? "•"} ${cat}${n ? `  ·  ${n}` : ""}`;
    return [{ text: label, callback_data: `cat:${i}` }];
  });
  rows.push([{ text: "‹ Back", callback_data: "welcome" }]);
  return { inline_keyboard: rows };
}

function categoryKeyboard(catIndex: number, watch: Set<string>): InlineKeyboard {
  const cat = CATEGORY_ORDER[catIndex] ?? "";
  const rows: InlineButton[][] = [];
  let row: InlineButton[] = [];
  for (const p of providersIn(cat)) {
    row.push({ text: `${tile(watch.has(p.id))} ${p.name}`, callback_data: `tog:${p.id}:${catIndex}` });
    if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  rows.push([
    { text: "Select all", callback_data: `sall:${catIndex}` },
    { text: "Clear", callback_data: `scl:${catIndex}` },
  ]);
  rows.push([{ text: "‹ Categories", callback_data: "cats" }]);
  return { inline_keyboard: rows };
}

function searchKeyboard(matches: Provider[], watch: Set<string>, levels: Map<string, Level>, q: string): InlineKeyboard {
  const packed = packQuery(q);
  const rows: InlineButton[][] = matches.map((p) => {
    const lvl = levels.get(p.id) ?? "unknown";
    const dot = lvl === "operational" || lvl === "unknown" ? "" : `${EMOJI[lvl]} `;
    return [{ text: `${tile(watch.has(p.id))} ${dot}${p.name}`, callback_data: `find:${p.id}:${packed}` }];
  });
  rows.push([{ text: "🔎 Browse all by category", callback_data: "cats" }]);
  return { inline_keyboard: rows };
}

// ---------- Message text ----------

function welcomeText(count: number): string {
  return (
    "🛰  <b>Outage Observer</b>\n\n" +
    "I'll ping you the moment a service you watch has trouble, and stay quiet otherwise.\n\n" +
    "<b>Add the services you depend on:</b>\n" +
    "•  <b>Type a name</b> to search — e.g. <code>stripe</code>\n" +
    "•  Tap a popular pick below\n" +
    "•  Or browse the full list by category\n\n" +
    `Watching <b>${count}</b> service${count === 1 ? "" : "s"}.`
  );
}

function categoriesText(watch: Set<string>): string {
  return `🔎  <b>Browse by category</b>\n\nTap a category to see its services. Watching <b>${watch.size}</b> so far.`;
}

function categoryText(catIndex: number, watch: Set<string>): string {
  const cat = CATEGORY_ORDER[catIndex] ?? "";
  const provs = providersIn(cat);
  const n = provs.filter((p) => watch.has(p.id)).length;
  return `${CAT_EMOJI[cat] ?? "•"} <b>${esc(cat)}</b>\n${n} of ${provs.length} selected. Tap to toggle.`;
}

function searchText(query: string, matches: Provider[]): string {
  if (!matches.length) {
    return (
      `No service matches "<b>${esc(query)}</b>".\n\n` +
      "Try another name, or tap browse to see everything."
    );
  }
  return (
    `🔎  Results for "<b>${esc(query)}</b>" — tap to add or remove:`
  );
}

function doneText(watch: string[]): string {
  if (!watch.length) {
    return "You haven't added any services yet.\n\nType a name to search, or /stack to start again.";
  }
  const names = CATALOG.filter((p) => watch.includes(p.id)).map((p) => esc(p.name));
  return (
    "🟢  <b>You're all set</b>\n\n" +
    `Watching <b>${watch.length}</b> service${watch.length === 1 ? "" : "s"}. I'll ping you the moment any of them changes state, and stay quiet otherwise.\n\n` +
    `<blockquote expandable>${names.join("\n")}</blockquote>\n` +
    "Manage anytime:  /stack to edit  ·  /status to check  ·  /stop to pause"
  );
}

async function levelMap(env: Env): Promise<Map<string, Level>> {
  const board = await getBoard(env);
  return new Map((board?.providers ?? []).map((e) => [e.id, e.level] as const));
}

async function statusText(env: Env, chatId: number): Promise<string> {
  const watch = await getWatch(env, chatId);
  if (!watch.length) {
    return "You're not watching anything yet.\n\nType a service name to search, or /stack to browse.";
  }
  const watchSet = new Set(watch);
  const levels = await levelMap(env);
  const lines: string[] = [`<b>Your stack</b>  (${watch.length} watched)`];
  for (const p of CATALOG) {
    if (!watchSet.has(p.id)) continue;
    const lvl = levels.get(p.id) ?? "unknown";
    lines.push(`${EMOJI[lvl]} ${esc(p.name)}${lvl === "operational" ? "" : `  ${LABEL[lvl]}`}`);
  }
  return lines.join("\n");
}

async function applyWatch(env: Env, chatId: number, query: string, add: boolean): Promise<string> {
  const q = query.trim().toLowerCase();
  if (!q) return add ? "Usage: /watch &lt;service&gt;" : "Usage: /unwatch &lt;service&gt;";
  const exact = CATALOG.find((p) => p.id === q || p.name.toLowerCase() === q);
  const p = exact ?? CATALOG.find((x) => x.name.toLowerCase().includes(q) || x.id.includes(q));
  if (!p) return `No service matches "${esc(query)}". Type a name to search, or /stack to browse.`;
  const watching = new Set(await getWatch(env, chatId));
  if (add && watching.has(p.id)) return `Already watching ${esc(p.name)}.`;
  if (!add && !watching.has(p.id)) return `You weren't watching ${esc(p.name)}.`;
  await toggleWatch(env, chatId, p.id);
  return add ? `Now watching ${esc(p.name)}.` : `Stopped watching ${esc(p.name)}.`;
}

// ---------- Update routing ----------

export async function onUpdate(env: Env, update: any): Promise<void> {
  if (update?.callback_query) {
    await handleCallback(env, update.callback_query);
  } else if (update?.message?.text) {
    await handleMessage(env, update.message);
  }
}

async function handleMessage(env: Env, message: any): Promise<void> {
  const chatId: number = message.chat.id;
  const text = String(message.text).trim();

  // Anything that isn't a slash-command is treated as a service search.
  if (!text.startsWith("/")) {
    await runSearch(env, chatId, text);
    return;
  }

  const cmd = (text.split(/\s+/)[0] ?? "").toLowerCase();
  const arg = text.slice(cmd.length).trim();

  switch (cmd) {
    case "/start":
    case "/stack": {
      if (cmd === "/start") await addUser(env, chatId);
      const watch = new Set(await getWatch(env, chatId));
      await sendMessage(env, chatId, welcomeText(watch.size), welcomeKeyboard(watch));
      break;
    }
    case "/find":
    case "/search":
      await runSearch(env, chatId, arg);
      break;
    case "/regions": {
      const prefs = new Set(await getUserRegions(env, chatId));
      await sendMessage(env, chatId, regionsText(prefs), regionsKeyboard(prefs));
      break;
    }
    case "/status":
      await sendMessage(env, chatId, await statusText(env, chatId));
      break;
    case "/watch":
      await sendMessage(env, chatId, await applyWatch(env, chatId, arg, true));
      break;
    case "/unwatch":
      await sendMessage(env, chatId, await applyWatch(env, chatId, arg, false));
      break;
    case "/clear":
      await clearWatch(env, chatId);
      await sendMessage(env, chatId, "Cleared. You're watching nothing now. /stack to pick again.");
      break;
    case "/stop":
      await removeUser(env, chatId);
      await sendMessage(env, chatId, "Paused. You won't get any pings. /start to set up again.");
      break;
    case "/test":
      // A fictional provider, clearly labelled, so a test can never be mistaken
      // for a real incident. Real alerts only ever come from real transitions.
      await sendMessage(
        env,
        chatId,
        "🧪 <b>Test alert</b>. A sample so you can see the format. This is not a real incident.\n\n" +
          formatAlert("Example Service", "operational", "major_outage", {
            level: "major_outage",
            description: "",
            incidents: [{ name: "Sample incident (test only)", impact: "major", status: "investigating" }],
          }),
      );
      break;
    default:
      await sendMessage(
        env,
        chatId,
        "Type a service name to search, or use:  /stack to browse  ·  /status  ·  /stop",
      );
  }
}

async function runSearch(env: Env, chatId: number, query: string): Promise<void> {
  const q = query.trim();
  if (!q) {
    const watch = new Set(await getWatch(env, chatId));
    await sendMessage(env, chatId, welcomeText(watch.size), welcomeKeyboard(watch));
    return;
  }
  const matches = searchCatalog(q);
  if (!matches.length) {
    await sendMessage(env, chatId, searchText(q, matches), { inline_keyboard: [[{ text: "🔎 Browse all by category", callback_data: "cats" }]] });
    return;
  }
  const watch = new Set(await getWatch(env, chatId));
  const levels = await levelMap(env);
  await sendMessage(env, chatId, searchText(q, matches), searchKeyboard(matches, watch, levels, q));
}

async function handleCallback(env: Env, cq: any): Promise<void> {
  const data: string = cq.data ?? "";
  const chatId: number | undefined = cq.message?.chat?.id;
  const messageId: number | undefined = cq.message?.message_id;
  if (chatId === undefined || messageId === undefined) {
    await answerCallback(env, cq.id);
    return;
  }

  const watch = new Set(await getWatch(env, chatId));

  if (data === "welcome") {
    await editMessageText(env, chatId, messageId, welcomeText(watch.size), welcomeKeyboard(watch));
    await answerCallback(env, cq.id);
  } else if (data === "regions") {
    const prefs = new Set(await getUserRegions(env, chatId));
    await editMessageText(env, chatId, messageId, regionsText(prefs), regionsKeyboard(prefs));
    await answerCallback(env, cq.id);
  } else if (data === "rg-all") {
    await setUserRegions(env, chatId, []);
    await editMessageText(env, chatId, messageId, regionsText(new Set()), regionsKeyboard(new Set()));
    await answerCallback(env, cq.id, "Notifying everywhere");
  } else if (data.startsWith("rg:")) {
    const g = data.slice(3);
    const prefs = new Set(await getUserRegions(env, chatId));
    if (prefs.has(g)) prefs.delete(g); else prefs.add(g);
    await setUserRegions(env, chatId, [...prefs]);
    await editMessageText(env, chatId, messageId, regionsText(prefs), regionsKeyboard(prefs));
    await answerCallback(env, cq.id);
  } else if (data === "cats") {
    await editMessageText(env, chatId, messageId, categoriesText(watch), categoriesKeyboard(watch));
    await answerCallback(env, cq.id);
  } else if (data === "done") {
    await editMessageText(env, chatId, messageId, doneText([...watch]));
    await answerCallback(env, cq.id, watch.size ? "Saved" : undefined);
  } else if (data === "clr") {
    await clearWatch(env, chatId);
    await editMessageText(env, chatId, messageId, welcomeText(0), welcomeKeyboard(new Set()));
    await answerCallback(env, cq.id, "Cleared");
  } else if (data.startsWith("qa:")) {
    // Popular quick-add from the home screen — toggle, re-render home.
    const pid = data.slice(3);
    const nowOn = await toggleWatch(env, chatId, pid);
    const next = new Set(await getWatch(env, chatId));
    await editMessageText(env, chatId, messageId, welcomeText(next.size), welcomeKeyboard(next));
    const prov = CATALOG.find((p) => p.id === pid);
    await answerCallback(env, cq.id, prov ? `${nowOn ? "Added" : "Removed"} ${prov.name}` : undefined);
  } else if (data.startsWith("find:")) {
    // Toggle from a search-results message — re-render the same results in place.
    const rest = data.slice("find:".length);
    const idx = rest.indexOf(":");
    const pid = idx >= 0 ? rest.slice(0, idx) : rest;
    const q = idx >= 0 ? rest.slice(idx + 1) : "";
    const nowOn = await toggleWatch(env, chatId, pid);
    const next = new Set(await getWatch(env, chatId));
    const matches = searchCatalog(q);
    const levels = await levelMap(env);
    await editMessageText(env, chatId, messageId, searchText(q, matches), searchKeyboard(matches, next, levels, q));
    const prov = CATALOG.find((p) => p.id === pid);
    await answerCallback(env, cq.id, prov ? `${nowOn ? "Added" : "Removed"} ${prov.name}` : undefined);
  } else if (data.startsWith("cat:")) {
    const i = Number(data.slice(4));
    await editMessageText(env, chatId, messageId, categoryText(i, watch), categoryKeyboard(i, watch));
    await answerCallback(env, cq.id);
  } else if (data.startsWith("tog:")) {
    const parts = data.split(":");
    const pid = parts[1] ?? "";
    const i = Number(parts[2] ?? "0");
    const nowOn = await toggleWatch(env, chatId, pid);
    const next = new Set(await getWatch(env, chatId));
    await editMessageText(env, chatId, messageId, categoryText(i, next), categoryKeyboard(i, next));
    const prov = CATALOG.find((p) => p.id === pid);
    await answerCallback(env, cq.id, prov ? `${nowOn ? "Watching" : "Removed"} ${prov.name}` : undefined);
  } else if (data.startsWith("sall:") || data.startsWith("scl:")) {
    const select = data.startsWith("sall:");
    const i = Number(data.split(":")[1] ?? "0");
    const next = new Set(watch);
    for (const p of providersIn(CATEGORY_ORDER[i] ?? "")) {
      if (select) next.add(p.id);
      else next.delete(p.id);
    }
    await setStack(env, chatId, [...next]);
    await editMessageText(env, chatId, messageId, categoryText(i, next), categoryKeyboard(i, next));
    await answerCallback(env, cq.id, select ? "Selected all" : "Cleared category");
  } else {
    await answerCallback(env, cq.id);
  }
}
