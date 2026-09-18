// @file backend/utils/dates.js
// Month maths in the *user's* timezone.
//
// Transactions are stored as UTC instants (`date`), but "September spending" means September on the
// user's wall clock. A user in Asia/Kolkata who buys coffee at 00:30 IST on 1 October is at
// 19:00 UTC on 30 September — grouping by UTC would file it under the wrong month.
// So every range/grouping helper takes a `timeZone` (User.timezone, default Asia/Kolkata).
//
// Implemented with Intl only — no date library.

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (value) => typeof value === "string" && MONTH_KEY.test(value);

/** Returns true if `timeZone` is a zone Node recognises. */
export const isTimeZone = (timeZone) => {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const partsFormatter = (timeZone) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Wall-clock parts of `date` in `timeZone`. */
export const localParts = (date, timeZone) => {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)])
  );
  return { ...parts, hour: parts.hour % 24 }; // some locales render midnight as 24
};

/** Milliseconds `timeZone` is ahead of UTC at the given instant (handles DST). */
const offsetMs = (date, timeZone) => {
  const p = localParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
};

/** The UTC instant of a local wall-clock time in `timeZone`. */
export const zonedToUtc = (year, month, day, timeZone, hour = 0, minute = 0, second = 0) => {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  // First guess uses the offset at the wall-clock instant, then refine once for DST transitions.
  const firstPass = new Date(wall - offsetMs(new Date(wall), timeZone));
  return new Date(wall - offsetMs(firstPass, timeZone));
};

/** "2026-09" for the month `date` falls in, locally. */
export const monthKey = (date, timeZone) => {
  const { year, month } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
};

export const currentMonthKey = (timeZone) => monthKey(new Date(), timeZone);

/** "2026-09-14" — the local calendar day of `date`. */
export const localDateKey = (date, timeZone) => {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** Half-open UTC range `[from, to)` covering the local month "2026-09". */
export const monthRange = (key, timeZone) => {
  const [year, month] = key.split("-").map(Number);
  return {
    from: zonedToUtc(year, month, 1, timeZone),
    to: zonedToUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1, timeZone),
  };
};

/** `key` shifted by `delta` months, e.g. addMonths("2026-01", -1) → "2025-12". */
export const addMonths = (key, delta) => {
  const [year, month] = key.split("-").map(Number);
  const zeroBased = year * 12 + (month - 1) + delta;
  return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
};

/** Half-open UTC range `[from, to)` covering `days` local days ending today (inclusive). */
export const lastDaysRange = (days, timeZone) => {
  const today = localParts(new Date(), timeZone);
  const to = zonedToUtc(today.year, today.month, today.day + 1, timeZone);
  const from = zonedToUtc(today.year, today.month, today.day - (days - 1), timeZone);
  return { from, to };
};

/** Start of the local week (Monday) through tomorrow, as a half-open UTC range. */
export const weekRange = (timeZone) => {
  const now = new Date();
  const p = localParts(now, timeZone);
  // getUTCDay on the local wall clock gives the local weekday. 0 = Sunday → treat as day 7.
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() || 7;
  return {
    from: zonedToUtc(p.year, p.month, p.day - (weekday - 1), timeZone),
    to: zonedToUtc(p.year, p.month, p.day + 1, timeZone),
  };
};

/**
 * Parses a user/AI supplied date into a UTC instant.
 * Accepts a full ISO timestamp, or "YYYY-MM-DD" which is read as local midnight in `timeZone`.
 * Returns null when unparseable.
 */
export const parseDate = (value, timeZone) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const [, y, m, d] = dateOnly.map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return zonedToUtc(y, m, d, timeZone, 12); // local noon: safe from DST and offset rounding
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
