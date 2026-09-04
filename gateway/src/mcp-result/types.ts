/**
 * Fidelidad MCP CallToolResult — independiente de Artifact / ObjectStorage.
 * No inventa artifact:// ni campos de Personal Agent dentro del protocolo MCP.
 */

export type McpTextBlock = {
  readonly type: "text";
  readonly text: string;
};

export type McpImageBlock = {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
};

export type McpAudioBlock = {
  readonly type: "audio";
  readonly data: string;
  readonly mimeType: string;
};

export type McpResourceLinkBlock = {
  readonly type: "resource_link";
  readonly uri: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly description?: string;
};

export type McpEmbeddedResourceBlock = {
  readonly type: "resource";
  readonly resource: {
    readonly uri: string;
    readonly mimeType?: string;
    readonly text?: string;
    readonly blob?: string;
  };
};

export type McpContentBlock =
  | McpTextBlock
  | McpImageBlock
  | McpAudioBlock
  | McpResourceLinkBlock
  | McpEmbeddedResourceBlock;

/**
 * Representación interna alineada con CallToolResult MCP.
 * No es AgentTool ToolResult ({ ok, content|error }).
 */
export type NormalizedMcpResult = {
  readonly content: readonly McpContentBlock[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
};
