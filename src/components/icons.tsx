// Small hand-drawn icon set (stroke icons, 24px grid). Decorative unless given a label.
type P = { className?: string; label?: string };

function Svg({ className, label, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}

export const DoorIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M4 21h16" />
    <circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" />
  </Svg>
);

export const BellIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
);

export const PackageIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
    <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
  </Svg>
);

export const PersonIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="7" r="3.5" />
    <path d="M5 21a7 7 0 0 1 14 0" />
  </Svg>
);

export const CarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 16v-3l2-5h12l2 5v3" />
    <path d="M3 16h18v2H3z" />
    <circle cx="7.5" cy="18.5" r="1.5" />
    <circle cx="16.5" cy="18.5" r="1.5" />
  </Svg>
);

export const PawIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="9" r="1.8" />
    <circle cx="11" cy="6" r="1.8" />
    <circle cx="15.5" cy="7" r="1.8" />
    <circle cx="18" cy="11" r="1.8" />
    <path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3Z" />
  </Svg>
);

export const MotionIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 12h3M17 12h3M12 4v3M12 17v3" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const EyeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="0.9" fill="currentColor" />
    <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
    <circle cx="4.5" cy="18" r="0.9" fill="currentColor" />
  </Svg>
);

export const NoteIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4M9 12h7M9 16h5" />
  </Svg>
);

export const HeartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z" />
  </Svg>
);

export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5.5" />
    <circle cx="12" cy="16.3" r="0.9" fill="currentColor" />
  </Svg>
);

export const SparkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2L12 3.5Z" />
  </Svg>
);

export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const PlayIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 5v14l12-7L7 5Z" />
  </Svg>
);

export const PauseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" />
  </Svg>
);

export const KIND_ICON: Record<string, (p: P) => React.ReactElement> = {
  person: PersonIcon,
  ding: BellIcon,
  package: PackageIcon,
  vehicle: CarIcon,
  animal: PawIcon,
  motion: MotionIcon,
  on_demand: EyeIcon,
};

export const KIND_LABEL: Record<string, string> = {
  person: "Person",
  ding: "Doorbell",
  package: "Package",
  vehicle: "Vehicle",
  animal: "Animal",
  motion: "Motion",
  on_demand: "Live view",
};
