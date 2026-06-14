export interface Env {
  STATUS_KV: KVNamespace;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  DEBUG_KEY: string;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

const API = "https://api.telegram.org";

export async function tg(env: Env, method: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json<any>();
}

export function sendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<any> {
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessageText(
  env: Env,
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<any> {
  return tg(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function answerCallback(env: Env, callbackQueryId: string, text?: string): Promise<any> {
  return tg(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}
