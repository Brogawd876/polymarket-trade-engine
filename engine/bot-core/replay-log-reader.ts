import { readFileSync } from "fs";
import type { 
  RoundWindow
} from "./data-sources.ts";

export type ReplayEvent = 
  | { ts: number; type: "orderbook_snapshot"; up: any; down: any }
  | { ts: number; type: "ticker"; assetPrice: number; binancePrice?: number; coinbasePrice?: number; divergence?: number | null }
  | { ts: number; type: "slot"; action: "start" | "end"; slug: string; startTime: number; endTime: number; strategy: string }
  | { ts: number; type: "market_price"; openPrice: number; gap?: number; priceToBeat?: number }
  | { ts: number; type: string; [key: string]: any };

export class ReplayLogReader {
  private events: ReplayEvent[] = [];
  private cursor = 0;
  private virtualNowMs = 0;
  private currentRound: RoundWindow | null = null;
  private handlers = new Set<(evt: ReplayEvent) => void>();
  private latestState = new Map<string, ReplayEvent>();

  constructor(logPath: string, opts: { tolerant?: boolean } = {}) {
    const content = readFileSync(logPath, "utf-8");
    const lines = content.split("\n");
    const parseFailures: string[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]!;
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as ReplayEvent;
        if (typeof evt.ts !== "number" || !evt.type) {
          throw new Error("missing numeric ts or type");
        }
        this.events.push(evt);
      } catch (e) {
        parseFailures.push(`line ${idx + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (parseFailures.length > 0 && !opts.tolerant) {
      throw new Error(
        `Replay log parse failed for ${logPath}: ${parseFailures.slice(0, 5).join("; ")}`,
      );
    }
    this.events.sort((a, b) => a.ts - b.ts);
    if (this.events.length === 0) {
      throw new Error(`Replay log ${logPath} contains no usable events.`);
    }
    if (this.events.length > 0) {
      this.virtualNowMs = this.events[0]!.ts;
    }
  }

  subscribe(handler: (evt: ReplayEvent) => void): () => void {
    this.handlers.add(handler);
    // Replay latest known state to new subscriber
    for (const evt of this.latestState.values()) {
        handler(evt);
    }
    return () => this.handlers.delete(handler);
  }

  get nowMs(): number {
    return this.virtualNowMs;
  }

  get round(): RoundWindow | null {
    return this.currentRound;
  }

  get eventCount(): number {
    return this.events.length;
  }

  advanceTo(newNowMs: number) {
    while (this.cursor < this.events.length && this.events[this.cursor]!.ts <= newNowMs) {
      const evt = this.events[this.cursor]!;
      if (evt.type === "slot" && evt.action === "start") {
        this.currentRound = {
          slug: evt.slug,
          asset: "btc",
          window: "5m",
          startTimeMs: evt.startTime,
          endTimeMs: evt.endTime
        };
      }
      // Store by type to allow replaying latest state to new subscribers
      this.latestState.set(evt.type, evt);
      for (const h of this.handlers) h(evt);
      this.cursor++;
    }
    this.virtualNowMs = newNowMs;
  }

  peekNextTs(): number | null {
    if (this.cursor < this.events.length) {
      return this.events[this.cursor]!.ts;
    }
    return null;
  }

  isDone(): boolean {
    return this.cursor >= this.events.length;
  }
}
