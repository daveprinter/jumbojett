import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { acceptsAdminCode } from "./admin-code.server";

describe("admin access codes", () => {
  test("4030 remains accepted even when the saved admin code is blank", () => {
    assert.equal(acceptsAdminCode("4030", ""), true);
  });
  test("the configured backend code also works", () => {
    assert.equal(acceptsAdminCode(" 7291 ", "7291"), true);
    assert.equal(acceptsAdminCode("7292", "7291"), false);
  });
  test("an empty code never grants access", () => {
    assert.equal(acceptsAdminCode(" ", ""), false);
  });
});