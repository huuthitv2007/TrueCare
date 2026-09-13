/** Calendar date in the application's single business time zone. */
export function businessDate(now: string | Date = new Date()): string {
  const value = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid business timestamp");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

export function validateDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
