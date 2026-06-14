import { type Env } from "./telegram";
import { type AlertEvent, type DeliverResult } from "./channels";

// Placeholder until the Web Push channel lands. No web-push targets can exist
// until /api/push/subscribe ships, so this is never invoked in production yet.
// Returns "retry" (never "gone") so it can't delete a target by mistake.
export async function sendWebPush(
  _env: Env,
  _target: { channel: string; address: string; meta: string | null },
  _event: AlertEvent,
): Promise<DeliverResult> {
  console.warn("web push delivery not yet implemented");
  return "retry";
}
