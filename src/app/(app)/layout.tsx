import { AppShell } from "@/components/AppShell";
import { StateProvider } from "@/components/state";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <StateProvider>
      <AppShell>{children}</AppShell>
    </StateProvider>
  );
}
