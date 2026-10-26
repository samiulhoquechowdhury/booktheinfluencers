import { StaffShell } from "@/components/staff-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <StaffShell>{children}</StaffShell>;
}
