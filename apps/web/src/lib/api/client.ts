"use client";

import { ApiError } from "@repo/mock/server";
import { httpApi } from "./http-client";
import { mockApi } from "./mock-client";

// Typed API for the web app. With NEXT_PUBLIC_API_BASE set (e.g. "/v1", proxied to apps/api by
// next.config.ts) it calls the NestJS API; otherwise it uses the in-browser mock. Components don't change.

export { ApiError };
export type { Message, Session } from "./types";

/** True when running on the in-browser mock: demo controls stand in for the staff CRM. */
export const DEMO_MODE = !process.env.NEXT_PUBLIC_API_BASE;

export const api = DEMO_MODE ? mockApi : httpApi;

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error && typeof error === "object" && "issues" in error) return "Please check the highlighted fields";
  return "Something went wrong. Please try again.";
}
