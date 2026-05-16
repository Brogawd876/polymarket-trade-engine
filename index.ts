import { Command } from "commander";
import * as readline from "readline";
import { EarlyBird } from "./engine/early-bird.ts";
import { strategies, DEFAULT_STRATEGY } from "./engine/strategy/index.ts";
import { acquireProcessLock } from "./utils/process-lock.ts";
import { 
    ReplayRunner,
    VirtualClock,
    RealClock,
    type Clock,
    TelemetryBus,
    ControlServer
} from "./engine/bot-core/index.ts";

const program = new Command()
  .description(
    "Automated trading engine for Polymarket binary prediction markets (e.g. BTC Up/Down 5-minute) ", 
  )
  .option(
    "-s, --strategy <name>",
    `Strategy to run (${Object.keys(strategies).join(", ")})`,
    DEFAULT_STRATEGY,
  )
  .option(
    "--slot-offset <n>",
    "Which future market slot to pre-enter or trade in current market (1 = next slot, 2 = slot after next, …)",
    (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1)
        throw new Error("--slot-offset must be a positive integer");
      return n;
    },
    1,
  )
  .option(
    "--prod",
    "Run against the real Polymarket CLOB (requires PRIVATE_KEY)",
  )
  .option(
    "--rounds <n>",
    "Number of market rounds to trade then exit (0 = recover existing only, omit for unlimited)",     
    (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 0)
        throw new Error("--rounds must be a non-negative integer");
      return n;
    },
  )
  .option(
    "--always-log",
    "Always write the slot log file even if no market was entered (useful for debugging)",
  )
  .option(
    "--replay <file>",
    "Run in historical replay mode using the specified log file",
  )
  .option(
    "--port <n>",
    "Port for the control plane server (default: 3000)",
    (v) => parseInt(v, 10),
    3000
  )
  .option(
    "--no-server",
    "Disable the control plane server"
  )
  .parse();

const opts = program.opts<{
  strategy: string;
  slotOffset: number;
  prod?: boolean;
  rounds?: number;
  alwaysLog?: boolean;
  replay?: string;
  port: number;
  server: boolean;
}>();

acquireProcessLock("early-bird");

if (!strategies[opts.strategy]) {
  console.error(`Unknown strategy: "${opts.strategy}"`);
  console.error(`Available: ${Object.keys(strategies).join(", ")}`);
  process.exit(1);
}

if (opts.prod && process.env.FORCE_PROD !== "true") {
  const answer = await new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      "Run in PRODUCTION mode with real funds? Enter Y to confirm: ",
      (ans) => {
        rl.close();
        resolve(ans);
      },
    );
  });

  if (answer !== "Y") {
    console.log("Aborted.");
    process.exit(0);
  }

  process.env.PROD = "true";
}

const rounds = opts.rounds !== undefined ? opts.rounds : null;

// Telemetry & Control Plane
const telemetryBus = new TelemetryBus();

// Clock must be created before EarlyBird so it can be passed to the constructor
const clock: Clock = opts.replay ? new VirtualClock() : new RealClock();

const bot = new EarlyBird(
  opts.strategy,
  opts.slotOffset,
  opts.prod ?? false,
  rounds,
  opts.alwaysLog ?? false,
  opts.replay,
  { 
      clock, 
      persistState: !opts.replay,
      telemetry: telemetryBus
  },
);

// Start Control Plane Server
let controlServer: ControlServer | undefined;
if (opts.server) {
    controlServer = new ControlServer({
        port: opts.port,
        telemetryBus,
        bot
    });
    controlServer.start();
}

if (opts.replay && clock instanceof VirtualClock) {
  const reader = bot.replayReader;
  if (!reader) throw new Error("Replay mode requested but no replay reader was initialized.");
  const runner = new ReplayRunner(reader, bot, clock, telemetryBus);
  await runner.run();
  if (controlServer) controlServer.stop();
  process.exit(0);
} else {
  await bot.start();
}
