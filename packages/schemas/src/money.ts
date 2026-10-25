import { z } from "zod";

/** Money on the wire is integer paise as a decimal string; parses to bigint. */
export const PaiseSchema = z
  .string()
  .regex(/^-?\d+$/, "Expected an integer amount in paise")
  .transform((value) => BigInt(value));
