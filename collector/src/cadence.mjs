// Stateless per-source collection cadence. The scheduled collector keeps no state between
// runs, so cadence is a pure function of the UTC date: metered providers can be spread across
// a month's allowance without coordinating with the database.

const MS_PER_DAY = 86_400_000;
const KNOWN_KEYS = new Set(["everyDays", "weekdays", "monthDays"]);

export function sourceIsDue(cadence, now = new Date(), { ignoreCadence = false } = {}) {
  if (ignoreCadence || !cadence) return true;
  const rules = [];
  if (cadence.everyDays !== undefined) {
    rules.push(Math.floor(now.getTime() / MS_PER_DAY) % cadence.everyDays === 0);
  }
  if (cadence.weekdays?.length) rules.push(cadence.weekdays.includes(now.getUTCDay()));
  if (cadence.monthDays?.length) rules.push(cadence.monthDays.includes(now.getUTCDate()));
  return rules.length === 0 || rules.some(Boolean);
}

export function validateCadence(cadence, label) {
  if (cadence === undefined || cadence === null) return;
  if (typeof cadence !== "object" || Array.isArray(cadence)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(cadence)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`${label} has unknown key ${key}`);
  }
  if (cadence.everyDays !== undefined
    && (!Number.isInteger(cadence.everyDays) || cadence.everyDays < 1 || cadence.everyDays > 31)) {
    throw new Error(`${label}.everyDays must be an integer from 1 to 31`);
  }
  integerList(cadence.weekdays, `${label}.weekdays`, 0, 6);
  integerList(cadence.monthDays, `${label}.monthDays`, 1, 31);
}

function integerList(value, label, min, max) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 31
    || value.some((item) => !Number.isInteger(item) || item < min || item > max)) {
    throw new Error(`${label} must be a list of integers from ${min} to ${max}`);
  }
}
