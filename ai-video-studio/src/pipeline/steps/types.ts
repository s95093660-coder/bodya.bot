import type { Project, StepId } from "../../core/types";
import type { RunContext } from "../context";

export interface Step {
  id: StepId;
  /** Returns a reason string if the step cannot run yet. */
  blockedReason(p: Project): string | null;
  run(ctx: RunContext): Promise<void>;
}
