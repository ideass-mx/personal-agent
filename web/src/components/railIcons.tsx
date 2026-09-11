/**
 * Iconos del rail / chat — stroke 1.7, currentColor (§2.1).
 */
import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & {
  size?: number;
  strokeWidth?: number;
};

function Svg({
  size = 17,
  children,
  strokeWidth = 1.7,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconRailChat(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H9l-4 4V5.5Z" />
    </Svg>
  );
}

export function IconRailProjects(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </Svg>
  );
}

export function IconRailTasks(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 1.6-2M4 12l1 1 1.6-2M4 18l1 1 1.6-2" />
    </Svg>
  );
}

export function IconRailMemory(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4a4 4 0 0 0-4 4 3 3 0 0 0-1.5 5.6A3 3 0 0 0 9 19a3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 2.5-5.4A4 4 0 0 0 16 8a4 4 0 0 0-4-4Z" />
      <path d="M12 4v16" />
    </Svg>
  );
}

export function IconRailFiles(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </Svg>
  );
}

export function IconRailActivity(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12h4l2.5 7 5-14L17 12h4" />
    </Svg>
  );
}

export function IconRailSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconRailPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconRailBell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 20a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconRailSpark(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path
        d="M12 8.5 13.4 11 16 12l-2.6 1-1.4 2.5L10.6 13 8 12l2.6-1Z"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

export function IconRailSend(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.8}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconRailArrow(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconRailCheck(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={3}>
      <path d="M5 12l5 5 9-11" />
    </Svg>
  );
}
