import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { env } from "./config/env";
import { ErrorFilter } from "./common/errors";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/guard";
import { CustomerBookingsController } from "./bookings/customer.controller";
import { CatalogueController } from "./catalogue/catalogue.controller";
import { HealthController } from "./health/health.controller";
import { PrismaService } from "./prisma/prisma.service";
import { DevProvidersController } from "./webhooks/dev-providers.controller";
import { WebhooksController } from "./webhooks/webhooks.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    CatalogueController,
    CustomerBookingsController,
    WebhooksController,
    // Simulated provider screens never ship to production.
    ...(env.NODE_ENV === "production" ? [] : [DevProvidersController]),
  ],
  providers: [
    PrismaService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
