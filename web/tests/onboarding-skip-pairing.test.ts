import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(webRoot, "..", "desktop");

describe("onboarding omite vincular nodo/Android", () => {
  it("web: tras LLM va a done; sin pasos optional_android/remote", () => {
    const wizard = readFileSync(
      join(webRoot, "src/features/setup/OnboardingWizard.tsx"),
      "utf8",
    );
    const flow = readFileSync(
      join(webRoot, "src/features/setup/setup-flow.ts"),
      "utf8",
    );
    assert.doesNotMatch(wizard, /optional_android|optional_remote/);
    assert.doesNotMatch(wizard, /createPairingSession|Conectar mi teléfono/);
    assert.doesNotMatch(flow, /optional_android|optional_remote/);
    assert.match(wizard, /Configuración → Conexiones/);
    assert.match(wizard, /setStep\("done"\)/);
  });

  it("desktop: first-run no obliga pairing; skip a capabilities", () => {
    const html = readFileSync(
      join(desktopRoot, "renderer/index.html"),
      "utf8",
    );
    const app = readFileSync(join(desktopRoot, "renderer/app.js"), "utf8");
    assert.doesNotMatch(html, /emparejamiento con Android/);
    assert.doesNotMatch(html, /nodo de agente de IA seguro/);
    assert.match(html, /se vinculan luego/);
    assert.match(app, /skipPairingAndContinue/);
    assert.match(app, /confirmPairingOrSkip\(\{ skip: true \}\)/);
  });
});
