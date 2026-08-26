/**
 * Extensión `math`: aporta math.add, math.subtract, math.multiply, math.divide.
 * Código local empaquetado; no hay carga dinámica.
 */
import {
  mathAddTool,
  mathDivideTool,
  mathMultiplyTool,
  mathSubtractTool,
} from "../tools/math.ts";
import type { AgentExtension } from "./types.ts";

export const mathExtension: AgentExtension = {
  name: "math",
  version: "1.0.0",
  tools: [mathAddTool, mathSubtractTool, mathMultiplyTool, mathDivideTool],
};
