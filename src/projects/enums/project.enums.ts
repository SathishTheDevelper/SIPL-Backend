export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export const PROJECT_TRANSITIONS: Record<string, string[]> = {
  [ProjectStatus.PLANNING]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.ACTIVE]: [
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ],
  [ProjectStatus.ON_HOLD]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [ProjectStatus.CLOSED],
};

export enum ProjectMemberRole {
  PROJECT_HEAD = 'PROJECT_HEAD',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  SITE_MANAGER = 'SITE_MANAGER',
  SITE_ENGINEER = 'SITE_ENGINEER',
  OFFICE_USER = 'OFFICE_USER',
}

export enum ProjectMemberStatus {
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
}
