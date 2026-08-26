/**
 * Extensión `office`: office.excel.read y office.excel.write.
 * Estática en el bundle. Sin carga dinámica ni macros.
 */
import type { AgentConfig } from "../config.ts";
import {
  createOfficeExcelReadTool,
  type ExcelRangeReader,
} from "../tools/office-excel-read.ts";
import {
  createOfficeExcelWriteTool,
  type ExcelRangeWriter,
} from "../tools/office-excel-write.ts";
import type { AgentExtension } from "./types.ts";

export type CreateOfficeExtensionOptions = {
  readRange?: ExcelRangeReader;
  writeRange?: ExcelRangeWriter;
};

export function createOfficeExtension(
  config: AgentConfig = {},
  options: CreateOfficeExtensionOptions = {},
): AgentExtension {
  const root = config.filesystem?.root;
  return {
    name: "office",
    version: "1.0.0",
    tools: [
      createOfficeExcelReadTool({
        root,
        ...(options.readRange !== undefined
          ? { readRange: options.readRange }
          : {}),
      }),
      createOfficeExcelWriteTool({
        root,
        ...(options.writeRange !== undefined
          ? { writeRange: options.writeRange }
          : {}),
      }),
    ],
  };
}

export const officeExtension = createOfficeExtension();
