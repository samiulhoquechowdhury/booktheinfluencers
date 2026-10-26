"use client";

import { useStaffSession } from "@/lib/hooks";
import { Card, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password";

export default function AccountPage() {
  const { data: staff } = useStaffSession();
  return (
    <div className="max-w-md space-y-5">
      <PageHeader title="Your account" description={staff ? `${staff.name} · ${staff.email}` : undefined} />
      <Card title="Change password">
        <ChangePasswordForm />
      </Card>
      <p className="text-xs text-muted">Lost the phone with your authenticator? Ask a super admin to reset it — you'll set it up again at your next sign-in.</p>
    </div>
  );
}
