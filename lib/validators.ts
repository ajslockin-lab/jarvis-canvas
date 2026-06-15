import { z } from "zod";

/** Canvas URL input — must be a valid Instructure domain */
export const canvasUrlSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .regex(
      /^https?:\/\/[a-z0-9-]+\.instructure\.com$/,
      "Must be a valid Canvas URL (e.g., https://school.instructure.com)"
    )
    .transform((url) => url.replace(/\/+$/, "")),
});

/** Voice command input */
export const voiceCommandSchema = z.object({
  text: z.string().min(1, "Text is required").max(1000, "Text too long"),
});

/** Create reminder input */
export const createReminderSchema = z.object({
  assignmentId: z.string().optional(),
  type: z.enum(["custom", "deadline", "study"]).default("custom"),
  triggeredAt: z.string().datetime("Must be a valid ISO datetime"),
});

/** Update reminder input */
export const updateReminderSchema = z.object({
  id: z.string().min(1, "Reminder ID is required"),
  active: z.boolean().optional(),
});

/** Extension agent input */
export const extensionAgentSchema = z.object({
  command: z.string().min(1, "Command is required"),
  pageContext: z.object({
    url: z.string(),
    title: z.string(),
    elements: z.array(
      z.object({
        id: z.string(),
        tag: z.string(),
        text: z.string(),
        ariaLabel: z.string().optional(),
        placeholder: z.string().optional(),
        href: z.string().optional(),
      })
    ),
  }),
});
