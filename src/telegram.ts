export interface Env {
  STATUS_KV: KVNamespace;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  DEBUG_KEY: string;
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
): Promise<any> {
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
