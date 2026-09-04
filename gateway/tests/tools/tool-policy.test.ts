import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HubAgentError } from "../../src/runtime/errors.ts";
import {
  DEFAULT_TOOL_POLICY,
  TOOL_POLICY_ERROR,
  assertToolPolicyAnnounced,
  assertValidToolPolicy,
  omitToolPolicyKeys,
} from "../../src/tools/policy.ts";

describe("13B Tool Policy", () => {
  it("policy por defecto conserva modos actuales", () => {
    assert.equal(DEFAULT_TOOL_POLICY["agent.echo"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.read"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.list"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.write"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["process.execute"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["math.multiply"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["math.divide"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["system.info"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["diagnostics.ping"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["customer.demo"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.read"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.write"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["customer.test"], undefined);
  });

  it("E: executionMode inválido (yes/allow) falla", () => {
    assert.throws(
      () => assertValidToolPolicy({ "customer.test": "yes" }),
      (err: unknown) =>
        err instanceof HubAgentError && err.code === TOOL_POLICY_ERROR,
    );
    assert.throws(
      () => assertValidToolPolicy({ "customer.test": "allow" }),
      (err: unknown) =>
        err instanceof HubAgentError && err.code === TOOL_POLICY_ERROR,
    );
  });

  it("estructura inválida falla", () => {
    assert.throws(
      () => assertValidToolPolicy(null),
      (err: unknown) =>
        err instanceof HubAgentError && err.code === TOOL_POLICY_ERROR,
    );
    assert.throws(
      () => assertValidToolPolicy([{ name: "agent.echo", mode: "automatic" }]),
      (err: unknown) =>
        err instanceof HubAgentError && err.code === TOOL_POLICY_ERROR,
    );
    assert.throws(
      () => assertValidToolPolicy({ "": "automatic" }),
      (err: unknown) =>
        err instanceof HubAgentError && err.code === TOOL_POLICY_ERROR,
    );
  });

  it("F: policy de tool no anunciada falla fail-closed", () => {
    const policy = assertValidToolPolicy({
      ...DEFAULT_TOOL_POLICY,
      "does.not.exist": "automatic",
    });
    assert.throws(
      () =>
        assertToolPolicyAnnounced(policy, Object.keys(DEFAULT_TOOL_POLICY)),
      (err: unknown) =>
        err instanceof HubAgentError &&
        err.code === TOOL_POLICY_ERROR &&
        /does\.not\.exist/.test((err as Error).message),
    );
  });

  it("omitir keys produce policy sin esas tools", () => {
    const next = omitToolPolicyKeys(DEFAULT_TOOL_POLICY, ["customer.demo"]);
    assert.equal(next["customer.demo"], undefined);
    assert.equal(next["filesystem.read"], "automatic");
  });
});
