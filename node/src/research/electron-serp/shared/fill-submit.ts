/**
 * Fill + submit genérico del buscador (union de selectores DDG / Brave / comunes).
 * Resiliente: no depende de una sola class de UI.
 */
export const FILL_AND_SUBMIT_EXPRESSION = `(query) => {
  const input =
    document.querySelector("#search_form_input_homepage") ||
    document.querySelector("#searchbox_input") ||
    document.querySelector("#searchbox") ||
    document.querySelector("input[name=q]") ||
    document.querySelector("textarea[name=q]") ||
    document.querySelector("input[type=search]") ||
    document.querySelector("form[action*='search'] input[type=text]") ||
    document.querySelector("form[action*='search'] input[type=search]") ||
    document.querySelector("input[type=text]");
  if (!input) return { ok: false, reason: "no-input" };
  input.focus();
  const proto = Object.getPrototypeOf(input);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(input, query);
  else input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const form = input.closest("form");
  if (form && typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return { ok: true, method: "requestSubmit", value: String(input.value || "") };
  }
  if (form) {
    form.submit();
    return { ok: true, method: "form.submit", value: String(input.value || "") };
  }
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
  );
  input.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
  );
  return { ok: true, method: "enter-event", value: String(input.value || "") };
}`;
