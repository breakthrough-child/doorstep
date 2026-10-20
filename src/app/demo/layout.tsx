import type { Metadata } from "next";

export const metadata: Metadata = { title: "Doorstep · Demo panel", robots: { index: false } };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
