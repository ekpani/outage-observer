import { DurableObject } from "cloudflare:workers";
import { poll } from "./poller";
import { type Env } from "./telegram";

const TICK_MS = 60_000;

/**
 * Reliable 1-minute poll loop via Durable Object alarms. Cloudflare guarantees
 * alarm delivery (with retries), unlike the free-tier cron, which silently
 * stalls — this is the durable fix for the stale-board problem.
 *
 * `ensure()` arms the alarm only if one isn't already pending, so pokes from the
 * cron watchdog / heartbeat / traffic are idempotent. `alarm()` polls and
 * re-arms in a `finally`, so a poll error can never break the loop. SQLite-backed
 * (the only DO storage on the free plan); alarms are the only storage used.
 */
export class PollerDO extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    await this.ensure();
    return new Response("ok");
  }

  /** Arm the loop if it isn't already running. */
  async ensure(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
  }

  async alarm(): Promise<void> {
    try {
      await poll(this.env, Date.now());
    } catch (e) {
      console.error("DO poll failed", String(e));
    } finally {
      // Always re-arm, even if the poll threw, so the loop is self-perpetuating.
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    }
  }
}
