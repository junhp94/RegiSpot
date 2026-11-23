/**
 * Unit tests for Vancouver time helpers — no database needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  vancouverToday,
  addDays,
  weekdayOf,
  zonedToUtc,
  sessionTimes,
} from "../lib/vancouverTime.js";

describe("vancouverTime", () => {
  it("evening rollover: 23:30 Vancouver is still that day", () =>
    assert.equal(vancouverToday(new Date("2026-11-25T07:30:00Z")), "2026-11-24"));

  it("addDays crosses month boundaries", () => {
    assert.equal(addDays("2026-11-29", 3), "2026-12-02");
    assert.equal(addDays("2026-12-01", -5), "2026-11-26");
  });

  it("zonedToUtc in PST", () =>
    assert.equal(zonedToUtc("2026-11-24", "20:00").toISOString(), "2026-11-25T04:00:00.000Z"));

  it("zonedToUtc in PDT after DST", () =>
    assert.equal(zonedToUtc("2027-03-16", "20:00").toISOString(), "2027-03-17T03:00:00.000Z"));

  it("weekdayOf", () => {
    assert.equal(weekdayOf("2026-11-24"), 2);
    assert.equal(weekdayOf("2026-11-29"), 0);
  });

  it("Tuesday 20:00 opens Thursday 20:00", () => {
    const s = { date: "2026-12-01", time: "20:00", end_time: "22:00", open_days_before: 5 };
    const t = sessionTimes(s, new Date("2026-11-27T03:59:00Z"));
    assert.equal(t.opensAt.toISOString(), "2026-11-27T04:00:00.000Z");
    assert.equal(t.visible, false);
    assert.equal(sessionTimes(s, new Date("2026-11-27T04:00:00Z")).visible, true);
  });

  it("Sunday 18:00 opens Tuesday 18:00", () =>
    assert.equal(
      sessionTimes({ date: "2026-11-29", time: "18:00" }, new Date()).opensAt.toISOString(),
      "2026-11-25T02:00:00.000Z"
    ));

  it("opening time stays at wall-clock 20:00 across DST start", () =>
    // Session Tue 2027-03-16 20:00 PDT; opens Thu 2027-03-11 20:00 PST = 04:00Z on the 12th
    assert.equal(
      sessionTimes({ date: "2027-03-16", time: "20:00" }, new Date()).opensAt.toISOString(),
      "2027-03-12T04:00:00.000Z"
    ));

  it("locked from Vancouver midnight on the date, not before", () => {
    const s = { date: "2026-11-24", time: "20:00" };
    assert.equal(sessionTimes(s, new Date("2026-11-24T07:59:00Z")).locked, false); // 23:59 on the 23rd
    assert.equal(sessionTimes(s, new Date("2026-11-24T08:00:00Z")).locked, true); // 00:00 on the 24th
  });

  it("unreadable time yields an invalid start and is never visible, without throwing", () => {
    const t = sessionTimes({ date: "2026-11-24", time: "7:00 PM" }, new Date("2026-11-24T00:00:00Z"));
    assert.ok(Number.isNaN(t.startsAt.getTime()));
    assert.equal(t.visible, false);
  });

  it("ended after end_time, defaults to start + 2h without one", () => {
    assert.equal(
      sessionTimes({ date: "2026-11-24", time: "20:00", end_time: "22:00" }, new Date("2026-11-25T06:00:00Z")).ended,
      true
    );
    const noEnd = sessionTimes({ date: "2026-11-24", time: "20:00" }, new Date("2026-11-25T05:59:00Z"));
    assert.equal(noEnd.endsAt.toISOString(), "2026-11-25T06:00:00.000Z");
    assert.equal(noEnd.ended, false);
  });
});
