"use client";

import { ApiError } from "@repo/mock/server";
import { STAFF_USERS, type StaffUser } from "@repo/mock/internal";
import { can, seesFinance, type QuoteDraft, type QuoteDraftLine, type QuoteRate } from "@repo/mock/staff";
import type { DemoAction } from "@repo/mock/server";
import { httpApi, registerStaffDirectory } from "./http-api";
import { mockApi } from "./mock-api";

// Staff API for apps/admin. With NEXT_PUBLIC_API_BASE set it calls apps/api (/v1/admin);
// otherwise the in-browser mock. Screens don't change.

export { ApiError, can, seesFinance };
export { quoteChecks } from "./checks";
export type { LeadBooking, LeadDetail, LeadRow } from "./mock-api";
export type { DemoAction, QuoteDraft, QuoteDraftLine, QuoteRate, StaffUser };

export const USING_API = Boolean(process.env.NEXT_PUBLIC_API_BASE);

// The seeded staff accounts are the same in the mock and the database (packages/db seed).
registerStaffDirectory(STAFF_USERS);

export const api = USING_API ? httpApi : mockApi;

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}
