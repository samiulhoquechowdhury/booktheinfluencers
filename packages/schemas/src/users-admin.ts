import { z } from "zod";
import type { LoginEventRecord } from "./staff-admin";
import type { ReviewStatus } from "./talent-onboarding";

// CRM → Users: everyone who signed in on the website (customers and artists). Staff live in CRM → Staff.

export type AccountStatus = "ACTIVE" | "DEACTIVATED" | "BLOCKED";

/** Deactivate is the soft option (a request, an inactive account); block is for abuse or fraud. Both stop sign-in. */
export const AccountRestrictSchema = z.object({
  kind: z.enum(["DEACTIVATED", "BLOCKED"]),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(500),
});
export type AccountRestrictInput = z.output<typeof AccountRestrictSchema>;

export type UserRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isCustomer: boolean;
  isArtist: boolean;
  status: AccountStatus;
  enquiryCount: number;
  lastLoginAt: string | null;
  createdAt: string;
};

export type UserDetail = UserRow & {
  restriction: { reason: string | null; byName: string | null; at: string } | null;
  artist: { slug: string; stageName: string; reviewStatus: ReviewStatus | null; profileStatus: string } | null;
  /** Still in progress, so the admin knows what a restriction affects. */
  openEnquiries: number;
  openBookings: number;
  recentSignIns: LoginEventRecord[];
};

export type UsersPage = {
  rows: UserRow[];
  total: number;
  page: number;
  pageCount: number;
  counts: { all: number; active: number; deactivated: number; blocked: number };
};

export type UserFilters = { q?: string; type?: "customer" | "artist"; status?: AccountStatus; page?: number };
