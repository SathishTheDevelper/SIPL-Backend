export enum SiteStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CLOSED = 'CLOSED',
}

export const SITE_TRANSITIONS: Record<string, string[]> = {
  [SiteStatus.DRAFT]: [SiteStatus.ACTIVE],
  [SiteStatus.ACTIVE]: [SiteStatus.INACTIVE, SiteStatus.CLOSED],
  [SiteStatus.INACTIVE]: [SiteStatus.ACTIVE, SiteStatus.CLOSED],
};
