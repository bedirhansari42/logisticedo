import test from "node:test";
import assert from "node:assert/strict";
import { SETUP_STEPS, PAGE_STEPS, pageRoute, setupRoute, initialState, parseState, setupStatus, autoStartDecision, reduce } from "./model.mjs";

test("the step lists are fixed and ordered", () => {
  assert.deepEqual(SETUP_STEPS, ["letterhead", "company", "bank"]);
  assert.deepEqual(PAGE_STEPS, ["proformas", "shipments", "planner", "landed", "notes"]);
  assert.deepEqual(PAGE_STEPS.map(pageRoute), ["/proformas", "/shipments", "/planner", "/landed", "/notes"]);
});

test("parseState rejects anything invalid and starts as new", () => {
  for (const raw of [null, undefined, "", "{", '{"status":"garip"}', 42, [], '{"page":2}']) assert.deepEqual(parseState(raw), initialState(), String(raw));
});

test("parseState clamps the page to 0..4 and floors it", () => {
  assert.deepEqual(parseState({ status: "setup", page: 99 }), { status: "setup", page: 4 });
  assert.equal(parseState({ status: "pages", page: -3 }).page, 0);
  assert.equal(parseState({ status: "pages", page: 2.7 }).page, 2);
  assert.equal(parseState({ status: "pages", page: "x" }).page, 0);
});

test("a saved state survives a JSON round trip (the tour resumes after a restart)", () => {
  const s = { status: "pages", page: 3 };
  assert.deepEqual(parseState(JSON.stringify(s)), s);
});

test("setupStatus ticks each step from the data counts", () => {
  assert.deepEqual(setupStatus({ letterheads: 0, companies: 0, banks: 0 }), { letterhead: false, company: false, bank: false, complete: false });
  assert.equal(setupStatus({ letterheads: 1, companies: 0, banks: 0 }).letterhead, true);
  assert.equal(setupStatus({ letterheads: 1, companies: 1, banks: 0 }).company, true);
  assert.equal(setupStatus({ letterheads: 1, companies: 1, banks: 2 }).complete, true);
  assert.equal(setupStatus({ letterheads: 0, companies: 1, banks: 1 }).complete, false);
});

test("the bank row goes to Companies while there is no company", () => {
  assert.equal(setupRoute("bank", { companies: 0 }), "/companies");
  assert.equal(setupRoute("bank", { companies: 1 }), "/banks");
  assert.equal(setupRoute("letterhead", { companies: 0 }), "/letterheads");
  assert.equal(setupRoute("company", { companies: 5 }), "/companies");
});

test("autoStartDecision starts only on a brand-new install without data", () => {
  assert.equal(autoStartDecision({ state: { status: "new" }, ready: true, hasData: false }), "start");
  assert.equal(autoStartDecision({ state: { status: "new" }, ready: true, hasData: true }), "markDone");
  assert.equal(autoStartDecision({ state: { status: "new" }, ready: false, hasData: false }), "wait");
  for (const status of ["done", "setup", "welcome", "pages"]) for (const hasData of [true, false])
    assert.equal(autoStartDecision({ state: { status }, ready: true, hasData }), "none", `${status}/${hasData}`);
});

test("reduce walks welcome → setup → pages → done", () => {
  assert.deepEqual(reduce({ status: "welcome", page: 0 }, "start"), { status: "setup", page: 0 });
  assert.deepEqual(reduce({ status: "setup", page: 0 }, "skipSetup"), { status: "pages", page: 0 });
  assert.deepEqual(reduce({ status: "setup", page: 0 }, "finishSetup"), { status: "pages", page: 0 });
  assert.deepEqual(reduce({ status: "pages", page: 2 }, "next"), { status: "pages", page: 3 });
  assert.deepEqual(reduce({ status: "pages", page: 4 }, "next"), { status: "done", page: 0 });
  assert.deepEqual(reduce({ status: "pages", page: 3 }, "back"), { status: "pages", page: 2 });
  assert.deepEqual(reduce({ status: "pages", page: 0 }, "back"), { status: "pages", page: 0 });
});

test("close ends the tour from any state and restart reopens it from done", () => {
  for (const status of ["welcome", "setup", "pages", "done"]) assert.equal(reduce({ status, page: 1 }, "close").status, "done", status);
  assert.deepEqual(reduce({ status: "done", page: 0 }, "restart"), { status: "welcome", page: 0 });
});

test("events that do not fit the current state are ignored and nothing ever returns to new", () => {
  assert.deepEqual(reduce({ status: "done", page: 0 }, "next"), { status: "done", page: 0 });
  assert.equal(reduce({ status: "new", page: 0 }, "start").status, "new");
  assert.equal(reduce({ status: "setup", page: 0 }, "garip").status, "setup");
  for (const status of ["welcome", "setup", "pages", "done"])
    for (const ev of ["start", "skipSetup", "finishSetup", "next", "back", "close", "restart"])
      assert.notEqual(reduce({ status, page: 0 }, ev).status, "new", `${status}/${ev}`);
});
