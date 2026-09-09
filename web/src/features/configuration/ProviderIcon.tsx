/**
 * Iconos compactos de proveedores (marcas simplificadas, no logos oficiales).
 */
type Props = {
  provider: string;
  size?: number;
};

const TONE: Record<string, { bg: string; fg: string }> = {
  openai: { bg: "#103c33", fg: "#6ee7b7" },
  anthropic: { bg: "#3a2a22", fg: "#e7c4a8" },
  xai: { bg: "#1a1a1a", fg: "#f5f5f5" },
  openrouter: { bg: "#1e1b4b", fg: "#a5b4fc" },
  groq: { bg: "#3f1210", fg: "#fda4a4" },
  "openai-compatible": { bg: "#1e293b", fg: "#94a3b8" },
};

function Mark({ provider }: { provider: string }) {
  switch (provider) {
    case "openai":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.2c1.6 0 3 .8 3.9 2.1a4.2 4.2 0 0 1 5.4 2.7 4.2 4.2 0 0 1-1.6 4.7 4.3 4.3 0 0 1 .1 5.1A4.2 4.2 0 0 1 15.9 20a4.3 4.3 0 0 1-7.8 0 4.2 4.2 0 0 1-4-.2 4.2 4.2 0 0 1 .1-5.1A4.2 4.2 0 0 1 2.7 10a4.2 4.2 0 0 1 5.4-2.7A4.3 4.3 0 0 1 12 3.2Z"
            opacity="0.9"
          />
        </svg>
      );
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4 7.2 20h2.3l1-2.8h5l1 2.8h2.3L12 4Zm0 4.6 1.8 5.1h-3.6L12 8.6Z"
          />
        </svg>
      );
    case "xai":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.2 5.5h3.1l2.8 4.1 3.3-4.1h3.2l-4.9 6.1 5.1 6.9h-3.2l-3.4-4.5-3.5 4.5H6.4l5.1-6.7-5.3-6.3Z"
          />
        </svg>
      );
    case "openrouter":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6.5" cy="12" r="2.2" fill="currentColor" />
          <circle cx="17.5" cy="7" r="2.2" fill="currentColor" />
          <circle cx="17.5" cy="17" r="2.2" fill="currentColor" />
          <path
            d="M8.5 11.2 15.2 8.1M8.5 12.8l6.7 3.1"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
          />
        </svg>
      );
    case "groq":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.5A8.5 8.5 0 1 0 20 14h-3.2a5.3 5.3 0 1 1-1.5-5.6l.1.1H20A8.5 8.5 0 0 0 12 3.5Z"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
          />
          <path
            d="M8 12h8M12 8v8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function ProviderIcon({ provider, size = 36 }: Props) {
  const tone = TONE[provider] || TONE["openai-compatible"];
  return (
    <span
      className="provider-icon"
      style={{
        width: size,
        height: size,
        background: tone.bg,
        color: tone.fg,
      }}
      aria-hidden="true"
    >
      <Mark provider={provider} />
    </span>
  );
}

export function providerShortBlurb(provider: string): string {
  if (provider === "xai") return "Grok con tu cuenta xAI";
  if (provider === "openrouter") return "Acceso a muchos modelos";
  if (provider === "anthropic") return "Claude para razonar";
  if (provider === "openai") return "Modelos GPT";
  return "Tu cuenta";
}
