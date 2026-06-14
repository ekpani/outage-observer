import { CATALOG, CATEGORY_ORDER, PRIORITY_IDS, type Provider } from "./catalog";
import { EMOJI, LABEL } from "./labels";
import { formatAlert } from "./poller";
import {
  getBoard,
  getWatch,
  toggleWatch,
  setStack,
  clearWatch,
  addUser,
  removeUser,
} from "./store";
import {
  sendMessage,
  editMessageText,
  answerCallback,
  type Env,
  type InlineKeyboard,
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
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function providersIn(category: string): Provider[] {
  return CATALOG.filter((p) => p.category === category);
}

// ---------- Keyboards ----------

function categoriesKeyboard(watch: Set<string>): InlineKeyboard {
  const rows = CATEGORY_ORDER.map((cat, i) => {
    const n = providersIn(cat).filter((p) => watch.has(p.id)).length;
    const label = `${CAT_EMOJI[cat] ?? "•"} ${cat}${n ? `  ·  ${n}` : ""}`;
    return [{ text: label, callback_data: `cat:${i}` }];
  });
  rows.push([
    { text: "⚡ Add essentials", callback_data: "ess" },
    { text: "🗑 Clear", callback_data: "clr" },
  ]);
  rows.push([{ text: "✓ Done", callback_data: "done" }]);
  return { inline_keyboard: rows };
}

function categoryKeyboard(catIndex: number, watch: Set<string>): InlineKeyboard {
  const cat = CATEGORY_ORDER[catIndex] ?? "";
  const rows: InlineKeyboard["inline_keyboard"] = [];
  let row: InlineKeyboard["inline_keyboard"][number] = [];
  for (const p of providersIn(cat)) {
    const on = watch.has(p.id);
    row.push({ text: `${on ? "✅" : "⬜"} ${p.name}`, callback_data: `tog:${p.id}:${catIndex}` });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([
    { text: "Select all", callback_data: `sall:${catIndex}` },
    { text: "Clear", callback_data: `scl:${catIndex}` },
  ]);
  rows.push([{ text: "‹ Categories", callback_data: "home" }]);
  return { inline_keyboard: rows };
}

// ---------- Message text ----------

function welcomeText(count: number): string {
  return (
    "🛰  <b>Welcome to Outage Observer</b>\n\n" +
    "Pick the services you actually depend on, and I'll ping you the moment one of them has trouble. Quiet otherwise.\n\n" +
    "<i>Tap a category to choose services. Picks save as you go.</i>\n\n" +
    `Watching <b>${count}</b> service${count === 1 ? "" : "s"}.`
  );
}

function categoryText(catIndex: number, watch: Set<string>): string {
  const cat = CATEGORY_ORDER[catIndex] ?? "";
  const provs = providersIn(cat);
  const n = provs.filter((p) => watch.has(p.id)).length;
  return `${CAT_EMOJI[cat] ?? "•"} <b>${esc(cat)}</b>\n${n} of ${provs.length} selected. Tap to toggle.`;
}

function doneText(watch: string[]): string {
  if (!watch.length) {
    return "You haven't picked any services yet.\n\nTap /stack to choose the ones you depend on.";
  }
  const names = CATALOG.filter((p) => watch.includes(p.id)).map((p) => esc(p.name));
  return (
    "🟢  <b>You're all set</b>\n\n" +
    `Watching <b>${watch.length}</b> service${watch.length === 1 ? "" : "s"}. I'll ping you the moment any of them changes state, and stay quiet otherwise.\n\n` +
    `<blockquote expandable>${names.join("\n")}</blockquote>\n` +
    "Manage anytime:  /stack to edit  ·  /status to check  ·  /stop to pause"
  );
}

async function statusText(env: Env, chatId: number): Promise<string> {
  const watch = await getWatch(env, chatId);
  if (!watch.length) {
    return "You're not watching anything yet.\n\nTap /stack to pick the services you depend on.";
  }
  const watchSet = new Set(watch);
  const board = await getBoard(env);
  const byId = new Map((board?.providers ?? []).map((e) => [e.id, e]));
  const lines: string[] = [`<b>Your stack</b>  (${watch.length} watched)`];
  for (const p of CATALOG) {
    if (!watchSet.has(p.id)) continue;
    const lvl = byId.get(p.id)?.level ?? "unknown";
    lines.push(`${EMOJI[lvl]} ${esc(p.name)}${lvl === "operational" ? "" : `  ${LABEL[lvl]}`}`);
  }
  return lines.join("\n");
}

async function applyWatch(env: Env, chatId: number, query: string, add: boolean): Promise<string> {
  const q = query.trim().toLowerCase();
  if (!q) return add ? "Usage: /watch &lt;service&gt;" : "Usage: /unwatch &lt;service&gt;";
  const exact = CATALOG.find((p) => p.id === q || p.name.toLowerCase() === q);
  const p = exact ?? CATALOG.find((x) => x.name.toLowerCase().includes(q) || x.id.includes(q));
  if (!p) return `No service matches "${esc(query)}". Try /stack to browse.`;
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
  const cmd = (text.split(/\s+/)[0] ?? "").toLowerCase();
  const arg = text.slice(cmd.length).trim();

  switch (cmd) {
    case "/start":
    case "/stack": {
      if (cmd === "/start") await addUser(env, chatId);
      const watch = new Set(await getWatch(env, chatId));
      await sendMessage(env, chatId, welcomeText(watch.size), categoriesKeyboard(watch));
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
      await sendMessage(env, chatId, "Commands:  /stack to choose services  ·  /status  ·  /stop");
  }
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

  if (data === "home") {
    await editMessageText(env, chatId, messageId, welcomeText(watch.size), categoriesKeyboard(watch));
    await answerCallback(env, cq.id);
  } else if (data === "done") {
    await editMessageText(env, chatId, messageId, doneText([...watch]));
    await answerCallback(env, cq.id, watch.size ? "Saved" : undefined);
  } else if (data === "ess") {
    await setStack(env, chatId, [...watch, ...PRIORITY_IDS]);
    const next = new Set(await getWatch(env, chatId));
    await editMessageText(env, chatId, messageId, welcomeText(next.size), categoriesKeyboard(next));
    await answerCallback(env, cq.id, "Added the essentials");
  } else if (data === "clr") {
    await clearWatch(env, chatId);
    await editMessageText(env, chatId, messageId, welcomeText(0), categoriesKeyboard(new Set()));
    await answerCallback(env, cq.id, "Cleared");
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
