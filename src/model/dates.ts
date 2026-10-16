export const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a real `YYYY-MM-DD` date to milliseconds at 00:00 UTC. */
export function parseDate(value: string): number {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  if (Number.isNaN(time) || formatDate(time) !== value) {
    throw new RangeError(`invalid date, expected a real YYYY-MM-DD: ${value}`);
  }
  return time;
}

/** Format milliseconds as a UTC `YYYY-MM-DD` date. */
export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Day of the week in UTC, 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(ms: number): number {
  return new Date(ms).getUTCDay();
}
