export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum WorkflowInstanceStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT_BACK = 'SENT_BACK',
  ESCALATED = 'ESCALATED',
  CANCELLED = 'CANCELLED',
}

export enum WorkflowActionType {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  SEND_BACK = 'SEND_BACK',
  ESCALATE = 'ESCALATE',
}

export enum ApproverType {
  USER = 'USER',
  ROLE = 'ROLE',
  MANAGER = 'MANAGER',
  PROJECT_HEAD = 'PROJECT_HEAD',
  CONFIGURED_USER = 'CONFIGURED_USER',
}

export enum WorkflowStepType {
  APPROVAL = 'APPROVAL',
  NOTIFICATION = 'NOTIFICATION',
}
