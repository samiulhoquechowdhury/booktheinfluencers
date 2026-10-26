import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp } from "../src/main";
import { signWebhook } from "../src/webhooks/webhooks.controller";
import { PrismaService } from "../src/prisma/prisma.service";

export async function startApp() {
  const app = await createApp();
  await app.init();
  return { app, db: app.get(PrismaService).db, http: () => request(app.getHttpServer()) };
}

/** Phone OTP sign-in with the test demo code; returns a bearer token. */
export async function signInCustomer(app: INestApplication, phone: string, name = "Test Customer") {
  const http = request(app.getHttpServer());
  await http.post("/v1/auth/otp/send").send({ phone }).expect(200);
  const res = await http.post("/v1/auth/otp/verify").send({ phone, code: "123456", name, as: "customer" }).expect(200);
  return res.body.accessToken as string;
}

export async function signInStaff(app: INestApplication, email: string) {
  const http = request(app.getHttpServer());
  const step1 = await http.post("/v1/auth/staff/login").send({ email, password: "demo1234" }).expect(200);
  const step2 = await http.post("/v1/auth/staff/mfa").send({ mfaToken: step1.body.mfaToken, code: "123456" }).expect(200);
  return step2.body.accessToken as string;
}

/** Posts a provider webhook the way a gateway would: signed over the exact body bytes. */
export function sendWebhook(app: INestApplication, path: "payments" | "esign", payload: object, signature?: string) {
  const body = JSON.stringify(payload);
  return request(app.getHttpServer())
    .post(`/v1/webhooks/${path}`)
    .set("content-type", "application/json")
    .set("x-signature", signature ?? signWebhook(body))
    .send(body);
}

/** Unique 10-digit Indian mobile per test run. */
export const randomPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

/** Every key anywhere in a JSON value. */
export function keysDeep(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, found));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      keysDeep(v, found);
    }
  return found;
}
