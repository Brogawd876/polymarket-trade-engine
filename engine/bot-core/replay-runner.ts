import type { ReplayLogReader } from "./replay-log-reader.ts";
import type { Clock } from "./data-sources.ts";

export type ReplayBot = {
  start(): Promise<void>;
  tickOnce(): Promise<void>;
  startShutdown(reason: string): void;
  readonly activeLifecycleCount: number;
  readonly isShuttingDown: boolean;
  replayStateSummary(): string;
  nextReplayDeadlineMs?(): number | null;
};

export class VirtualClock implements Clock {
  private _nowMs: number = 0;
  private _timers = new Map<number, {
    handler: () => void;
    targetMs: number;
    intervalMs?: number;
    order: number;
  }>();
  private _nextTimerId = 1;
  private _nextOrder = 1;
  private _cancelled = new Set<number>();

  setNowMs(ms: number) {
    if (ms < this._nowMs) return;
    this._nowMs = ms;
    
    let triggered: number;
    do {
      triggered = 0;
      // Convert entries to array to avoid "Map changed during iteration" if handlers set new timers
      const entries = Array.from(this._timers.entries())
        .sort((a, b) => a[1].targetMs - b[1].targetMs || a[1].order - b[1].order);
      for (const [id, timer] of entries) {
        if (this._timers.get(id) !== timer) continue;
        if (this._nowMs >= timer.targetMs) {
          this._timers.delete(id);
          timer.handler();
          if (timer.intervalMs !== undefined && !this._cancelled.has(id)) {
            this._timers.set(id, {
              handler: timer.handler,
              targetMs: this._nowMs + timer.intervalMs,
              intervalMs: timer.intervalMs,
              order: this._nextOrder++,
            });
          }
          this._cancelled.delete(id);
          triggered++;
        }
      }
    } while (triggered > 0);
  }

  nowMs(): number {
    return this._nowMs;
  }

  setTimeout(handler: () => void, delayMs: number): any {
    const id = this._nextTimerId++;
    this._timers.set(id, {
      handler,
      targetMs: this._nowMs + Math.max(0, delayMs),
      order: this._nextOrder++,
    });
    return id;
  }

  setInterval(handler: () => void, intervalMs: number): any {
    const id = this._nextTimerId++;
    this._timers.set(id, {
      handler,
      targetMs: this._nowMs + Math.max(1, intervalMs),
      intervalMs: Math.max(1, intervalMs),
      order: this._nextOrder++,
    });
    return id;
  }

  clearInterval(handle: any): void {
    this._timers.delete(handle);
    this._cancelled.add(handle);
  }

  clearTimeout(handle: any): void {
    this._timers.delete(handle);
    this._cancelled.add(handle);
  }
}

export class ReplayRunner {
  private reader: ReplayLogReader;
  private bot: ReplayBot;
  private clock: VirtualClock;

  constructor(reader: ReplayLogReader, bot: ReplayBot, clock: VirtualClock) {
    this.reader = reader;
    this.bot = bot;
    this.clock = clock;
  }

  async run(): Promise<{ ticks: number; completed: true; finalTimeMs: number }> {
    console.log("[ReplayRunner] Priming data...");
    
    // Process events until the bot's orderbook and ticker are truly ready
    let primedCount = 0;
    while (!this.reader.isDone()) {
      const nextTs = this.reader.peekNextTs();
      if (nextTs === null) break;
      
      this.clock.setNowMs(nextTs);
      
      let hasData = false;
      const unsubscribe = this.reader.subscribe((evt) => {
          if (evt.type === "orderbook_snapshot" && evt.up && evt.down) {
              console.log(`[ReplayRunner] Found non-null orderbook snapshot at ts=${evt.ts}`);
              hasData = true;
          }
      });
      this.reader.advanceTo(nextTs);
      unsubscribe();
      primedCount++;

      if (hasData) break;
    }
    console.log(`[ReplayRunner] Primed ${primedCount} events. isDone=${this.reader.isDone()}`);

    console.log("[ReplayRunner] Starting engine...");
    await this.bot.start();

    const TICK_INTERVAL_MS = 100;
    const STALL_TIMEOUT_MS = 300_000; // 5 minutes of virtual time without state change
    let lastStateHash = "";
    let lastProgressMs = this.clock.nowMs();
    let tickCount = 0;
    
    while (!this.reader.isDone() || this.bot.activeLifecycleCount > 0) {
      const nextEventTs = this.reader.peekNextTs();
      const nextTickTargetMs = this.clock.nowMs() + TICK_INTERVAL_MS;

      let targetNowMs: number;
      if (nextEventTs !== null && nextEventTs < nextTickTargetMs) {
          targetNowMs = nextEventTs;
      } else {
          targetNowMs = nextTickTargetMs;
      }

      this.clock.setNowMs(targetNowMs);
      this.reader.advanceTo(targetNowMs);

      if (this.clock.nowMs() >= nextTickTargetMs - 1) {
          await this.bot.tickOnce();
          tickCount++;

          const isShuttingDown = this.bot.isShuttingDown;

          // Progress logging every 100 ticks (10s virtual time)
          if (tickCount % 100 === 0) {
             const states = this.bot.replayStateSummary();
             console.log(`[ReplayRunner] tick=${tickCount} time=${new Date(this.clock.nowMs()).toISOString()} active=${this.bot.activeLifecycleCount} states=[${states}]`);
             
             // Stall detection
             const currentStateHash = states + this.reader.isDone() + isShuttingDown;
             if (currentStateHash !== lastStateHash) {
                lastStateHash = currentStateHash;
                lastProgressMs = this.clock.nowMs();
             } else {
                const nextDeadlineMs = this.bot.nextReplayDeadlineMs?.() ?? null;
                const waitingForKnownDeadline =
                  nextDeadlineMs !== null && this.clock.nowMs() <= nextDeadlineMs;
                if (
                  this.clock.nowMs() - lastProgressMs > STALL_TIMEOUT_MS &&
                  !waitingForKnownDeadline
                ) {
                 console.error(`[ReplayRunner] STALL DETECTED at ${this.clock.nowMs()}ms. No state change for ${STALL_TIMEOUT_MS}ms virtual time.`);
                 throw new Error("Replay stalled");
                }
             }
          }

          // Terminate if engine is done
          if (isShuttingDown && this.bot.activeLifecycleCount === 0) {
              break;
          }
      }

      if (this.reader.isDone() && this.bot.activeLifecycleCount === 0) {
          break;
      }
      
      await new Promise(r => setImmediate(r));
    }

    console.log("[ReplayRunner] Replay complete. Shutting down...");
    this.bot.startShutdown("Replay complete.");
    
    while (this.bot.activeLifecycleCount > 0) {
       this.clock.setNowMs(this.clock.nowMs() + TICK_INTERVAL_MS);
       await this.bot.tickOnce();
    }
    
    console.log("[ReplayRunner] Finished.");
    return { ticks: tickCount, completed: true, finalTimeMs: this.clock.nowMs() };
  }
}
