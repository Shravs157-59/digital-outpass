/**
 * schemas.ts — Validation schemas using the Zod library.
 * 
 * Zod is a RUNTIME validation library (works in both JS and TS).
 * It checks data at runtime, unlike TypeScript which only checks at compile time.
 * 
 * KEY CONCEPT: z.object({...}) creates a schema that validates objects.
 * z.string() — validates that a value is a string
 * .min(10) — string must be at least 10 characters
 * .max(200) — string must be at most 200 characters
 * .refine() — custom validation logic
 * .safeParse() — validates data and returns { success, data, error }
 * 
 * Zod works identically in plain JavaScript — no TypeScript needed!
 */
import { z } from "zod";

export const outpassRequestSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(10, "Purpose must be at least 10 characters")
    .max(200, "Purpose must not exceed 200 characters")
    .refine((val) => !/<script|javascript:/i.test(val), "Invalid characters detected"),
  from_date: z
    .string()
    .datetime({ message: "Invalid start date" }),
  to_date: z
    .string()
    .datetime({ message: "Invalid end date" }),
}).refine(
  (data) => {
    const from = new Date(data.from_date);
    const to = new Date(data.to_date);
    const now = new Date();
    return to > from && from >= new Date(now.toISOString().slice(0, 16));
  },
  { message: "End date must be after start date and start cannot be in the past", path: ["to_date"] }
);

export const approvalSchema = z.object({
  request_id: z.string().uuid("Invalid request ID"),
  action: z.enum(["approved", "rejected"]),
  comments: z.string().max(500, "Comments must not exceed 500 characters").optional(),
});

export const qrCodeSchema = z.string().uuid("Please enter a valid Outpass ID");
