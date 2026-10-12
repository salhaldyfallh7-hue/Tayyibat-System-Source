const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "..", "system-engine.js"), "utf8"), context);
const E = context.window.TayyibatEngine;

assert.deepEqual(Array.from(E.RANKS, rank => rank.code), ["E", "D", "C", "B", "A", "S", "SS", "SSS", "SSS+", "MONARCH"]);
assert.equal(Object.values(E.CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0), 100);

const weekStart = "2026-10-05";
const perfectTasks = [];
for (let day = 0; day < 7; day++) {
  for (const cat of ["worship", "study", "rest", "essential", "entertainment"]) {
    perfectTasks.push({
      date: E.addDays(weekStart, day), cat, done: true, difficulty: 2,
      priority: cat === "study" ? "high" : "normal"
    });
  }
}
const perfect = E.scoreWeek(perfectTasks, weekStart, "2026-10-11", E.DEFAULT_RULES);
assert.equal(perfect.points, 100);
assert.equal(perfect.successfulDays, 7);
assert.equal(E.rankFor(perfect, [
  { points: 97, rankIndex: 8 }, { points: 98, rankIndex: 8 }, { points: 99, rankIndex: 8 }
], E.DEFAULT_RULES), 9, "MONARCH requires three prior qualifying weeks");

const noPriority = E.scoreWeek(perfectTasks.map(task => ({ ...task, priority: "normal" })), weekStart, "2026-10-11", E.DEFAULT_RULES);
assert.equal(E.rankFor(noPriority, [], E.DEFAULT_RULES), 4, "high rank is capped without a completed high-priority requirement");

const emptyWeek = E.scoreWeek([{ date: "2026-10-06", cat: "study", done: false }], weekStart, "2026-10-11", E.DEFAULT_RULES);
assert.equal(emptyWeek.points, 0, "opening the app or an untouched task gives no points");

const weak = E.adaptation(Array.from({ length: 5 }, (_, i) => ({ date: E.addDays("2026-10-12", -i), cat: "study", done: false })), "2026-10-12", 4);
assert.equal(weak.level, 3, "sustained low completion reduces the proposed challenge one step");
const strongTasks = Array.from({ length: 14 }, (_, i) => ({ date: E.addDays("2026-10-12", -i), cat: "study", done: true, priority: "high", difficulty: 2 }));
assert.equal(E.adaptation(strongTasks, "2026-10-12", 1).level, 2, "consistent completion increases the challenge one step");

assert.equal(E.xpForTask({ difficulty: 3, priority: "high" }), 35);
const cancelled = E.scoreWeek([{ date: "2026-10-06", cat: "study", done: false, cancelled: true }], weekStart, "2026-10-11", E.DEFAULT_RULES);
assert.equal(cancelled.required, 0, "canceled tasks remain outside the failure denominator");

const shifted = E.scoreWeek([
  { date: "2026-10-06", cat: "study", done: false, notRequired: true, rescheduled: true, deferCount: 1 },
  { date: "2026-10-07", cat: "study", done: false, carried: true, accumulated: true, deferCount: 1 }
], weekStart, "2026-10-11", E.DEFAULT_RULES);
assert.equal(shifted.required, 1, "a shifted original is retained but is no longer a second active obligation");
assert.equal(shifted.overdue, 1);
assert.equal(shifted.parts.recovery, 5, "one of two reviewed deferred records was resolved");

console.log("Tayyibat System engine tests passed.");
