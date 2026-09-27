import { Injectable } from '@nestjs/common';

export interface WorkflowOutcome {
  module: string;
  entityType: string;
  entityId: string;
  action: string;
  instanceStatus: string;
  reason?: string;
  actorUserId: string;
  instanceId: string;
}

export type WorkflowOutcomeHandler = (
  outcome: WorkflowOutcome,
) => Promise<void>;

@Injectable()
export class WorkflowOutcomeRegistry {
  private readonly handlers: WorkflowOutcomeHandler[] = [];

  register(handler: WorkflowOutcomeHandler): void {
    this.handlers.push(handler);
  }

  async emit(outcome: WorkflowOutcome): Promise<void> {
    for (const handler of this.handlers) {
      await handler(outcome);
    }
  }
}
