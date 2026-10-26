import type { z } from "zod";

/** Validates untrusted input with a shared schema; a ZodError becomes a 400 in ErrorFilter. */
export const parse = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> => schema.parse(value);

/** Paise as a decimal string — the wire format for money (docs/memory.md). */
export const paise = (value: bigint | null | undefined) => (value === null || value === undefined ? null : value.toString());

export const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
