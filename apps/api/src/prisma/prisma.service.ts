import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@repo/db";
import { env } from "../config/env";

/** One Prisma client for the process. Use `this.prisma.db`. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient = createPrismaClient(env.DATABASE_URL);

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
