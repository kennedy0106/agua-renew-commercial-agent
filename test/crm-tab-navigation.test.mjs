import assert from "node:assert/strict";
import test from "node:test";
import { nextTabValue } from "../apps/crm/src/tab-navigation.js";

const tabs = [
  ["one", "Uno"],
  ["two", "Dos"],
  ["three", "Tres"],
];

test("tab navigation supports arrows, wrapping, Home and End", () => {
  assert.equal(nextTabValue(tabs, "one", "ArrowRight"), "two");
  assert.equal(nextTabValue(tabs, "one", "ArrowLeft"), "three");
  assert.equal(nextTabValue(tabs, "three", "ArrowRight"), "one");
  assert.equal(nextTabValue(tabs, "two", "Home"), "one");
  assert.equal(nextTabValue(tabs, "two", "End"), "three");
});

test("tab navigation ignores unrelated keys and unknown values", () => {
  assert.equal(nextTabValue(tabs, "one", "Enter"), null);
  assert.equal(nextTabValue(tabs, "missing", "ArrowRight"), null);
  assert.equal(nextTabValue([], "one", "ArrowRight"), null);
});
