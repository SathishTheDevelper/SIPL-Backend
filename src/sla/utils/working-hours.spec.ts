import { addWorkingHours } from './working-hours';

const STANDARD = {
  timezone: 'UTC',
  workingDays: [1, 2, 3, 4, 5],
  workingStartTime: '09:00',
  workingEndTime: '18:00',
  holidays: [] as string[],
};

describe('addWorkingHours', () => {
  it('Friday 5:00 PM + 2 working hours = Monday 10:00 AM', () => {
    const friday5pm = new Date('2026-01-02T17:00:00.000Z');
    const due = addWorkingHours(friday5pm, 2, STANDARD);
    expect(due.toISOString()).toBe('2026-01-05T10:00:00.000Z');
  });

  it('does not use createdAt + N calendar hours', () => {
    const friday5pm = new Date('2026-01-02T17:00:00.000Z');
    const naive = new Date(friday5pm.getTime() + 2 * 60 * 60 * 1000);
    const due = addWorkingHours(friday5pm, 2, STANDARD);
    expect(due.getTime()).not.toBe(naive.getTime());
  });

  it('skips configured holidays', () => {
    const thursday5pm = new Date('2026-01-01T17:00:00.000Z');
    const due = addWorkingHours(thursday5pm, 2, {
      ...STANDARD,
      holidays: ['2026-01-02'],
    });
    expect(due.toISOString()).toBe('2026-01-05T10:00:00.000Z');
  });

  it('stays on the same working day when hours fit', () => {
    const monday9 = new Date('2026-01-05T09:00:00.000Z');
    const due = addWorkingHours(monday9, 2, STANDARD);
    expect(due.toISOString()).toBe('2026-01-05T11:00:00.000Z');
  });
});
