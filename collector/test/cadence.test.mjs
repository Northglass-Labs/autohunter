import assert from "node:assert/strict";
import test from "node:test";
import { sourceIsDue, validateCadence } from "../src/cadence.mjs";

// 2026-10-12 is a Monday; its UTC day number (20738) is even.
const monday = new Date("2026-10-12T15:00:00Z");
const tuesday = new Date("2026-10-13T15:00:00Z");
const wednesday = new Date("2026-10-14T15:00:00Z");
const firstOfMonth = new Date("2026-11-01T15:00:00Z");

test("a source without a cadence runs on every collection", () => {
  assert.equal(sourceIsDue(undefined, tuesday), true);
  assert.equal(sourceIsDue({}, tuesday), true);
});

test("everyDays alternates deterministically by UTC day so a stateless runner stays within budget", () => {
  const cadence = { everyDays: 2 };
  assert.notEqual(sourceIsDue(cadence, monday), sourceIsDue(cadence, tuesday));
  assert.equal(sourceIsDue(cadence, monday), sourceIsDue(cadence, wednesday));
  assert.equal(sourceIsDue({ everyDays: 1 }, tuesday), true);
});

test("weekday and month-day rules run OEM programs weekly plus at the start of each month", () => {
  const cadence = { weekdays: [1], monthDays: [1, 2] };
  assert.equal(sourceIsDue(cadence, monday), true);
  assert.equal(sourceIsDue(cadence, tuesday), false);
  assert.equal(sourceIsDue(cadence, firstOfMonth), true);
});

test("an explicit override runs every source for verification collections", () => {
  assert.equal(sourceIsDue({ weekdays: [1] }, tuesday, { ignoreCadence: true }), true);
});

test("cadence configuration is validated", () => {
  assert.doesNotThrow(() => validateCadence({ everyDays: 2 }, "marketcheck.cadence"));
  assert.doesNotThrow(() => validateCadence({ weekdays: [1], monthDays: [1, 2] }, "incentives.cadence"));
  assert.doesNotThrow(() => validateCadence(undefined, "x.cadence"));
  assert.throws(() => validateCadence({ everyDays: 0 }, "x.cadence"), /everyDays/);
  assert.throws(() => validateCadence({ weekdays: [7] }, "x.cadence"), /weekdays/);
  assert.throws(() => validateCadence({ monthDays: [32] }, "x.cadence"), /monthDays/);
  assert.throws(() => validateCadence({ hourly: true }, "x.cadence"), /unknown/);
});
