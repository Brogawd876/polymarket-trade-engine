import { EarlyBird, type EngineStatus } from "./early-bird.ts";
import { ReplayRunner, VirtualClock, RealClock, TelemetryBus } from "./bot-core/index.ts";
import * as fs from "fs/promises";
import * as path from "path";

export type SessionState = "idle" | "starting" | "running" | "stopping" | "completed" | "failed";

export type OperatorStatus = {
  backend: "reachable";
  telemetry: "connected"; // UI will fill this
  sessionState: SessionState;
  engineMode: "idle" | "live" | "sim" | "replay";
  engineStatus: EngineStatus | null;
  blockReason: string | null;
  activeReplayFile: string | null;
};

export class SessionManager {
  private _sessionState: SessionState = "idle";
  private _bot: EarlyBird | null = null;
  private _runner: ReplayRunner | null = null;
  private _blockReason: string | null = null;
  private _activeReplayFile: string | null = null;
  
  constructor(public telemetryBus: TelemetryBus) {}

  getStatus(): OperatorStatus {
    return {
      backend: "reachable",
      telemetry: "connected",
      sessionState: this._sessionState,
      engineMode: this._bot ? (this._runner ? "replay" : (this._bot.getStatus().mode === "live" ? "live" : "sim")) : "idle",
      engineStatus: this._bot ? this._bot.getStatus() : null,
      blockReason: this._blockReason,
      activeReplayFile: this._activeReplayFile
    };
  }

  async startSimulation(config: { strategy: string; rounds?: number; alwaysLog?: boolean; maxSessionLoss?: number }): Promise<void> {
    if (this._sessionState === "running" || this._sessionState === "starting") {
      throw new Error("Session is already active");
    }
    
    this._sessionState = "starting";
    this._blockReason = null;
    this._activeReplayFile = null;
    
    if (config.maxSessionLoss !== undefined) {
      process.env.MAX_SESSION_LOSS = config.maxSessionLoss.toString();
    }
    
    try {
      const clock = new RealClock();
      this._bot = new EarlyBird(
        config.strategy,
        1, // slotOffset
        false, // prod
        config.rounds ?? null,
        config.alwaysLog ?? false,
        undefined, // replayFile
        {
          clock,
          persistState: true,
          telemetry: this.telemetryBus
        }
      );
      
      // We do not await start() here forever, start() resolves when setup is done
      await this._bot.start();
      
      this._sessionState = "running";
      
      // We must monitor for when the bot stops naturally
      this._monitorBot();
    } catch (e: any) {
      this._sessionState = "failed";
      this._blockReason = e.message;
      this._bot = null;
      throw e;
    }
  }

  async startReplay(file: string): Promise<void> {
    if (this._sessionState === "running" || this._sessionState === "starting") {
      throw new Error("Session is already active");
    }
    
    this._sessionState = "starting";
    this._blockReason = null;
    this._activeReplayFile = file;
    
    try {
      const clock = new VirtualClock();
      this._bot = new EarlyBird(
        undefined, // strategy (defaults)
        1,
        false,
        null,
        false,
        file,
        {
          clock,
          persistState: false,
          telemetry: this.telemetryBus
        }
      );
      
      const reader = this._bot.replayReader;
      if (!reader) throw new Error("Replay reader not initialized");
      
      this._runner = new ReplayRunner(reader, this._bot, clock, this.telemetryBus);
      
      this._sessionState = "running";
      
      this._runner.run().then(() => {
        this._sessionState = "completed";
      }).catch((e) => {
        this._sessionState = "failed";
        this._blockReason = e.message;
      });
      
    } catch (e: any) {
      this._sessionState = "failed";
      this._blockReason = e.message;
      this._bot = null;
      this._runner = null;
      this._activeReplayFile = null;
      throw e;
    }
  }

  async stopSession(): Promise<void> {
    if (this._sessionState !== "running") return;
    this._sessionState = "stopping";
    try {
      if (this._bot) {
         await this._bot.stop();
      }
      this._sessionState = "completed";
      setTimeout(() => {
        if (this._sessionState === "completed") {
            this._sessionState = "idle";
            this._bot = null;
        }
      }, 2000);
    } catch (e: any) {
      this._sessionState = "failed";
      this._blockReason = e.message;
      throw e;
    }
  }

  async resetState(): Promise<void> {
    if (this._sessionState === "running" || this._sessionState === "starting") {
      throw new Error("Cannot reset state while a session is active");
    }
    try {
      // Just delete the state files to reset
      await fs.unlink("state/early-bird.json").catch(() => {});
      this._blockReason = null;
    } catch (e: any) {
      throw new Error("Failed to reset state: " + e.message);
    }
  }

  private _monitorBot() {
    if (!this._bot) return;
    const bot = this._bot;
    const interval = setInterval(() => {
      // If shutting down is true and lifecycles = 0, it has settled.
      if (bot.isShuttingDown && bot.activeLifecycleCount === 0) {
         clearInterval(interval);
         this._sessionState = "completed";
         // Transition to idle after a short delay so UI can see "completed"
         setTimeout(() => {
            if (this._sessionState === "completed") {
                this._sessionState = "idle";
                this._bot = null;
            }
         }, 3000);
      }
    }, 500);
  }
}
