import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { env } from "./config/env";

/** Shared by main() and the e2e tests so both run the same middleware. */
export async function createApp() {
  // rawBody: webhook signatures are computed over the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: env.NODE_ENV === "test" ? false : undefined });
  app.setGlobalPrefix("v1");
  // The website proxies /v1 from the same machine: trust its X-Forwarded-For so sign-in history shows the visitor's IP.
  app.set("trust proxy", "loopback");
  // Image uploads (POST /v1/admin/media) arrive as raw bytes; everything else stays JSON.
  app.useBodyParser("raw", { type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" });
  // Room for a 500-row talent CSV (POST /v1/admin/talents/import); everything else is far smaller.
  app.useBodyParser("json", { limit: "1mb" });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()), credentials: true });
  app.enableShutdownHooks();
  return app;
}

async function main() {
  const app = await createApp();
  await app.listen(env.PORT);
  console.info(`API listening on http://localhost:${env.PORT}/v1`);
}

if (env.NODE_ENV !== "test") void main();
