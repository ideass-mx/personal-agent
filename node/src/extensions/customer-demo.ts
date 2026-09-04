/**
 * Extensión de demostración de cliente (`customer-demo.ts`).
 * Identidad 11A: `customer` → `customer.demo` y `customer.test`.
 * Código empaquetado estáticamente; no hay carga dinámica.
 */
import { customerDemoTool } from "../tools/customer-demo.ts";
import { customerTestTool } from "../tools/customer-test.ts";
import type { AgentExtension } from "./types.ts";

export const customerDemoExtension: AgentExtension = {
  name: "customer",
  version: "1.0.0",
  tools: [customerDemoTool, customerTestTool],
};
