"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, can } from "@/lib/api";
import { useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, PageHeader } from "@/components/ui";
import { TalentForm } from "@/components/talent/talent-form";

export default function NewTalentPage() {
  const router = useRouter();
  const { data: staff } = useStaffSession();
  const create = useStaffMutation(api.talents.create, "Draft created");

  if (!staff) return <Loading />;
  if (!can(staff, "TALENT_MANAGER")) return <Failure message="Only talent managers can add artists" />;

  return (
    <div className="space-y-5">
      <Link href="/talents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Talents
      </Link>
      <PageHeader title="New talent" description="Starts as a draft. Add a verified representative and a rate card, then publish it from the profile." />
      <Card>
        <TalentForm submitLabel="Create draft" pending={create.isPending} onSubmit={(input) => create.mutate(input, { onSuccess: ({ slug }) => router.push(`/talents/${slug}`) })} onCancel={() => router.push("/talents")} />
      </Card>
    </div>
  );
}
