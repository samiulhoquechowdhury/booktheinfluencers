import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";

/** Uptime check (runbook): 200 only when the database answers. */
@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up" };
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
  }
}
