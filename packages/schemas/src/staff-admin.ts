import { z } from "zod";

// Staff accounts, managed by super admins in the CRM. Shared by apps/api and apps/admin.

export const StaffRoleSchema = z.enum(["SUPER_ADMIN", "SALES", "TALENT_MANAGER", "OPS", "ACCOUNTS"]);
export type StaffRoleName = z.infer<typeof StaffRoleSchema>;

const Roles = z.array(StaffRoleSchema).min(1, "Pick at least one role").max(5);

export const StaffCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.email("Enter a valid work email").trim().toLowerCase().max(120),
  roles: Roles,
});
export type StaffCreateInput = z.output<typeof StaffCreateSchema>;

export const StaffUpdateSchema = z.object({ name: z.string().trim().min(2, "Enter their name").max(80), roles: Roles });
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
