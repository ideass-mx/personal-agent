"use strict";

/**
 * Structured onboarding logs — never write secrets/tokens/keys.
 */
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config.cjs");

const SECRET_RE =
  /(HUB_TOKEN|ANTHROPIC_API_KEY|sk-ant-|Bearer\s+\S+|token["']?\s*[:=]\s*["']?[\w-]{8,})/gi;

function redact(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.replace(SECRET_RE, "[redacted]");
  }
  if (typeof value === "object") {
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|password|key|credential/i.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function logOnboarding(stage, event, details = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    stage: String(stage),
    event: String(event),
    ...redact(details),
  });
  try {
    const p = config.ensureDirs();
    const file = path.join(p.logsDir, "onboarding.log");
    fs.appendFileSync(file, `${line}\n`, "utf8");
  } catch {
    /* ignore disk errors */
  }
  return line;
}

module.exports = {
  logOnboarding,
  redact,
};
