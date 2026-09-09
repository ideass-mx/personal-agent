import type { ExperienceAction, StructuredResult } from "../contract";
import { StructuredBlockView } from "./StructuredBlockView";

type Channel = "desktop" | "mobile" | "voice";

type Props = {
  result: StructuredResult;
  channel?: Channel;
  onAction?: (action: ExperienceAction) => void;
};

/**
 * Renderer central del Experience Layer.
 * Datos del agente → componentes React. Nunca HTML del modelo.
 */
export function StructuredBlockRenderer({
  result,
  channel = "desktop",
  onAction,
}: Props) {
  return (
    <div
      className={`exp-structured channel-${channel}`}
      data-channel={channel}
    >
      {result.blocks.map((block, i) => (
        <StructuredBlockView
          key={`${block.type}-${i}`}
          block={block}
          channel={channel}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
