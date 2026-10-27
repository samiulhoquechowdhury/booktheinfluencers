import { Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { reconcilePayments, type ReconciliationRun } from "@repo/db";
import type { ReconciliationOverview, ReconciliationRunRecord } from "@repo/schemas";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

// Payment reconciliation for Accounts (and the super admin): the latest nightly run, recent history, run now.

const toRecord = (r: ReconciliationRun): ReconciliationRunRecord => ({
  id: r.id,
  ranAt: r.ranAt.toISOString(),
  trigger: r.trigger,
  ok: r.ok,
  errorCount: r.errorCount,
  warnCount: r.warnCount,
  findings: r.findings as ReconciliationRunRecord["findings"],
  totals: r.totals as ReconciliationRunRecord["totals"],
});

@Controller("admin/reconciliation")
@Roles("ACCOUNTS")
export class ReconciliationController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async overview(): Promise<ReconciliationOverview> {
    const runs = await this.prisma.db.reconciliationRun.findMany({ orderBy: { ranAt: "desc" }, take: 14 });
    return {
      latest: runs[0] ? toRecord(runs[0]) : null,
      history: runs.map(({ id, ranAt, trigger, ok, errorCount, warnCount }) => ({ id, ranAt: ranAt.toISOString(), trigger, ok, errorCount, warnCount })),
    };
  }

  /** Runs the same checks as the nightly job. Nobody is emailed — the person who ran it sees the result. */
  @Post("run")
  @HttpCode(200)
  async run(@CurrentUser() user: AuthUser): Promise<ReconciliationRunRecord> {
    const me = await this.prisma.db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const run = await reconcilePayments(this.prisma.db, { trigger: me?.name ?? "Staff", notify: false });
    return toRecord(await this.prisma.db.reconciliationRun.findUniqueOrThrow({ where: { id: run.id } }));
  }
}
