import type { RiskDecision } from "./risk-gate.ts";
import type { StrategyIntent } from "./strategy-intent.ts";

export type ExecutionPlan =
  | {
      executable: true;
      intent: StrategyIntent;
      plannedAtMs: number;
      notes: string[];
    }
  | {
      executable: false;
      intent: StrategyIntent;
      plannedAtMs: number;
      notes: string[];
    };

export interface ExecutionGate {
  plan(decision: RiskDecision): ExecutionPlan;
}

export class RiskApprovedExecutionGate implements ExecutionGate {
  plan(decision: RiskDecision): ExecutionPlan {
    if (!decision.approved) {
      return {
        executable: false,
        intent: decision.intent,
        plannedAtMs: Date.now(),
        notes: decision.reasons,
      };
    }

    return {
      executable: true,
      intent: decision.intent,
      plannedAtMs: Date.now(),
      notes: ["risk-approved intent; execution wiring is a later phase"],
    };
  }
}
