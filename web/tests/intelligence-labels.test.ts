import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  configStatusLabel,
  humanModelLabel,
  modeIcon,
  modeTitle,
  providerCardTitle,
} from "../src/features/configuration/intelligenceLabels.ts";

describe("PHASE 63 intelligence labels", () => {
  it("maps modes to human titles", () => {
    assert.equal(modeIcon("local"), "🔒");
    assert.equal(modeTitle("personal-agent-cloud"), "Personal Agent Cloud");
    assert.equal(modeTitle("external", "OpenAI"), "OpenAI");
    assert.equal(humanModelLabel("personal-agent-cloud", "x"), "Claude");
    assert.equal(
      humanModelLabel("personal-agent-cloud", "claude-sonnet-4-6"),
      "Claude Sonnet",
    );
    assert.equal(
      humanModelLabel("personal-agent-cloud", "pa-cloud-default"),
      "Claude Sonnet",
    );
    assert.equal(configStatusLabel("active"), "ACTIVA");
    assert.equal(configStatusLabel("not_configured"), "NO CONFIGURADO");
  });

  it("maps xAI / Grok and Gemini labels", () => {
    assert.equal(providerCardTitle("xai"), "xAI / Grok");
    assert.equal(humanModelLabel("xai", "grok-4.6"), "Grok 4.6");
    assert.equal(modeTitle("external", "xAI / Grok"), "xAI / Grok");
    assert.equal(providerCardTitle("gemini"), "Gemini");
    assert.equal(
      humanModelLabel("gemini", "gemini-3.8-flash"),
      "Gemini 3.8 Flash",
    );
    assert.equal(
      humanModelLabel("gemini", "gemini-3.6-flash"),
      "Gemini 3.6 Flash",
    );
  });
});
