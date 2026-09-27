import { CalendarWindow } from '../interfaces/calendar-window.interface';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDay: number;
  dateKey: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseClock(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map((part) => parseInt(part, 10));
  return { hour, minute };
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const weekday = parts.weekday;
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10);
  const day = parseInt(parts.day, 10);
  return {
    year,
    month,
    day,
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    isoDay: weekdayMap[weekday] ?? 1,
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
  };
}

function fromZoned(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const shifted = new Date(utcGuess);
  const parts = zonedParts(shifted, timeZone);
  const asUtcMinutes = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  );
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(utcGuess + (desired - asUtcMinutes));
}

function isWorkingDay(parts: ZonedParts, calendar: CalendarWindow): boolean {
  return (
    calendar.workingDays.includes(parts.isoDay) &&
    !calendar.holidays.includes(parts.dateKey)
  );
}

function addDays(
  parts: ZonedParts,
  days: number,
  timeZone: string,
  hour: number,
  minute: number,
): Date {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0);
  const noon = zonedParts(new Date(utc), timeZone);
  return fromZoned(noon.year, noon.month, noon.day, hour, minute, timeZone);
}

function nextWorkingStart(from: Date, calendar: CalendarWindow): Date {
  let cursor = new Date(from.getTime());
  for (let i = 0; i < 370; i += 1) {
    const parts = zonedParts(cursor, calendar.timezone);
    const start = parseClock(calendar.workingStartTime);
    const end = parseClock(calendar.workingEndTime);
    if (isWorkingDay(parts, calendar)) {
      const startDate = fromZoned(
        parts.year,
        parts.month,
        parts.day,
        start.hour,
        start.minute,
        calendar.timezone,
      );
      const endDate = fromZoned(
        parts.year,
        parts.month,
        parts.day,
        end.hour,
        end.minute,
        calendar.timezone,
      );
      if (cursor < startDate) {
        return startDate;
      }
      if (cursor < endDate) {
        return cursor;
      }
    }
    cursor = addDays(parts, 1, calendar.timezone, start.hour, start.minute);
  }
  throw new Error('Unable to find a working window');
}

export function addWorkingHours(
  start: Date,
  hours: number,
  calendar: CalendarWindow,
): Date {
  if (hours < 0) {
    throw new Error('Working hours must be >= 0');
  }
  let remainingMs = hours * 60 * 60 * 1000;
  let cursor = nextWorkingStart(start, calendar);
  const endClock = parseClock(calendar.workingEndTime);

  while (remainingMs > 0) {
    const parts = zonedParts(cursor, calendar.timezone);
    const endDate = fromZoned(
      parts.year,
      parts.month,
      parts.day,
      endClock.hour,
      endClock.minute,
      calendar.timezone,
    );
    const available = endDate.getTime() - cursor.getTime();
    if (available >= remainingMs) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= Math.max(available, 0);
    cursor = nextWorkingStart(
      new Date(endDate.getTime() + 60 * 1000),
      calendar,
    );
  }
  return cursor;
}
