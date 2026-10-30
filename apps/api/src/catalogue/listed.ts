import type { Prisma } from "@repo/db";

/** What the public can see: published profiles (CAT-11), minus artists whose account is blocked or deactivated. */
export const LISTED = { status: "PUBLISHED", NOT: { user: { is: { disabledAt: { not: null } } } } } satisfies Prisma.TalentWhereInput;
