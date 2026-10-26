import { z } from "zod";

// Staff accounts, managed by super admins in the CRM. Shared by apps/api and apps/admin.

export const StaffRoleSchema = z.enum(["SUPER_ADMIN", "SALES", "TALENT_MANAGER", "OPS", "ACCOUNTS"]);
export type StaffRoleName = z.infer<typeof StaffRoleSchema>;

/** There is exactly one super admin; the role only moves by transfer, never by ticking a box. */
export const AssignableRoleSchema = z.enum(["SALES", "TALENT_MANAGER", "OPS", "ACCOUNTS"]);
export type AssignableRole = z.infer<typeof AssignableRoleSchema>;

const Roles = z.array(AssignableRoleSchema).max(4);

export const StaffCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.email("Enter a valid work email").trim().toLowerCase().max(120),
  roles: Roles.min(1, "Pick at least one role"),
});
export type StaffCreateInput = z.output<typeof StaffCreateSchema>;

/** The super admin keeps the role whatever is ticked, so their list may be empty. */
export const StaffUpdateSchema = z.object({ name: z.string().trim().min(2, "Enter their name").max(80), roles: Roles });

/** Hands the super admin role to someone else. The current one confirms with their password and picks the role they keep. */
export const SuperAdminTransferSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm"),
  keepRole: AssignableRoleSchema,
});
export type SuperAdminTransferInput = z.output<typeof SuperAdminTransferSchema>;
export type StaffUpdateInput = z.output<typeof StaffUpdateSchema>;

/** At least 10 characters with a letter and a digit. */
export const NewPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/\d/, "Include a number");

export const ChangePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password"), next: NewPasswordSchema });

export type StaffAccount = {
  id: string;
  name: string;
  email: string;
  roles: StaffRoleName[];
  active: boolean;
  mfaEnrolled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** Returned once when an account is created or its password reset. Never stored in plain text. */
export type TemporaryPassword = { temporaryPassword: string };
