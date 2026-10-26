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
