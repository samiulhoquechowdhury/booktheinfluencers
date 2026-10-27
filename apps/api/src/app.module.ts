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
import { IntakeController } from "./intake/intake.controller";
import { MeController } from "./me/me.controller";
import { PrismaService } from "./prisma/prisma.service";
import { StaffController } from "./staff/staff.controller";
import { StaffService } from "./staff/staff.service";
import { FollowUpsController } from "./follow-ups/follow-ups.controller";
import { FollowUpsService } from "./follow-ups/follow-ups.service";
import { SiteController } from "./site/site.controller";
import { SiteService } from "./site/site.service";
import { StaffAccountsController } from "./staff-accounts/staff-accounts.controller";
import { StaffAccountsService } from "./staff-accounts/staff-accounts.service";
import { TalentPortalController } from "./talent/talent.controller";
import { TalentAdminController } from "./talents/talent-admin.controller";
import { TalentAdminService } from "./talents/talent-admin.service";
import { DevProvidersController } from "./webhooks/dev-providers.controller";
import { WebhooksController } from "./webhooks/webhooks.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    CatalogueController,
    CustomerBookingsController,
    MeController,
    TalentPortalController,
    IntakeController,
    StaffController,
    TalentAdminController,
    StaffAccountsController,
    SiteController,
    FollowUpsController,
    WebhooksController,
    // Simulated provider screens never ship to production.
    ...(env.NODE_ENV === "production" ? [] : [DevProvidersController]),
  ],
  providers: [
    PrismaService,
    AuthService,
    StaffService,
    TalentAdminService,
    StaffAccountsService,
    SiteService,
    FollowUpsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
