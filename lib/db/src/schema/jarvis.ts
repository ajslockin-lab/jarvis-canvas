import { pgTable, text, timestamp, boolean, real, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  // Uniqueness is enforced by users_email_lower_idx (LOWER(email)) so users can
  // sign in with mixed case. The .unique() chain was removed when we added the
  // case-insensitive index in migration 0004 — keeping both would error on push.
  email: text("email").notNull(),
  name: text("name"),
  // Password-based auth — set when the user signed up via email + password.
  // Nullable so Canvas-only users (who sign in via PAT or OAuth) are unaffected.
  // The frontend never reads this column; the backend bcrypt-verifies and returns
  // a session token. Never returned by any JSON endpoint.
  passwordHash: text("password_hash"),
  // Set when the user completes the email verification flow. Required before
  // a password-account user can sign in. Canvas-only users don't need this set
  // (their email comes from Canvas itself, not from us).
  emailVerifiedAt: timestamp("email_verified_at"),
  // Which auth methods this account has. "canvas" = PAT or OAuth only, "password"
  // = email signup only, "both" = email signup + later connected Canvas.
  // Defaults to "canvas" because that's what every existing row was created with.
  authProvider: text("auth_provider").notNull().default("canvas"),
  canvasBaseUrl: text("canvas_base_url"),
  canvasAccessTokenEncrypted: text("canvas_access_token_encrypted"),
  canvasRefreshTokenEncrypted: text("canvas_refresh_token_encrypted"),
  canvasTokenExpiresAt: timestamp("canvas_token_expires_at"),
  canvasUserId: text("canvas_user_id"),
  // Where the user first heard about Carvis — captured once on first successful sign-in.
  // Constrained vocabulary is enforced client-side via a dropdown; the server-side enum is
  // duplicated in routes/user.ts. Nullable so existing rows aren't affected by the migration.
  referredFrom: text("referred_from"),
  // Sync progress used by the dashboard's first-run UX. The client polls /canvas/sync-status
  // and renders phase-appropriate copy. Nullable so existing rows are unaffected.
  // phase values: idle | courses | assignments | grades | done | error
  lastSyncPhase: text("last_sync_phase"),
  lastSyncAt: timestamp("last_sync_at"),
  // Captures non-fatal partial failures (e.g. grades sync failed but courses succeeded).
  // Distinct from a hard error, which sets phase="error".
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Email verification: pending 6-digit codes awaiting user confirmation.
// Each signup or resend creates one row. consume marks `consumedAt` on success.
// We keep historical rows rather than DELETE on consume so audit / replay
// doesn't lose data; the "active" row is the latest one with consumedAt IS NULL.
// The 5-attempt cap is enforced in routes/auth.ts at verification time, not here.
export const emailVerificationsTable = pgTable("email_verifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // bcrypt hash of the 6-digit code. We never store the plaintext code server-side.
  codeHash: text("code_hash").notNull(),
  // Codes expire 15 minutes after issue (enforced in routes/auth.ts on insert).
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const coursesTable = pgTable("courses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  color: text("color"),
  lastSynced: timestamp("last_synced"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const assignmentsTable = pgTable("assignments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  points: real("points"),
  url: text("url"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gradesTable = pgTable("grades", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
  currentScore: real("current_score"),
  finalScore: real("final_score"),
  letterGrade: text("letter_grade"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

export const remindersTable = pgTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: text("assignment_id").references(() => assignmentsTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("custom"),
  triggeredAt: timestamp("triggered_at").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  message: text("message").notNull(),
  intent: text("intent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Activation events: tracks the moment a user reaches the "aha" of the product.
// Used for the activation metric (Sean Ellis must-have) and to power the README/GT essay
// with real numbers ("X% of users who completed first sync within 5 minutes returned within 7 days").
export const activationEventsTable = pgTable("activation_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // event types: first_sync_completed | first_question_asked | first_voice_used
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
  referredFrom: true,
  lastSyncPhase: true,
  lastSyncAt: true,
  lastSyncError: true,
  // Server-managed fields: passwordHash is bcrypt'd in routes/auth.ts; the rest
  // are set automatically (auth_provider default, emailVerifiedAt on verify).
  passwordHash: true,
  emailVerifiedAt: true,
});
export const insertCourseSchema = createInsertSchema(coursesTable).omit({ createdAt: true });
export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({ createdAt: true, updatedAt: true });
export const insertGradeSchema = createInsertSchema(gradesTable).omit({ id: true, fetchedAt: true });
export const insertReminderSchema = createInsertSchema(remindersTable).omit({ createdAt: true });
export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true });
export const insertEmailVerificationSchema = createInsertSchema(emailVerificationsTable).omit({
  createdAt: true,
  attempts: true,
  consumedAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type Course = typeof coursesTable.$inferSelect;
export type Assignment = typeof assignmentsTable.$inferSelect;
export type Grade = typeof gradesTable.$inferSelect;
export type Reminder = typeof remindersTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type ActivationEvent = typeof activationEventsTable.$inferSelect;
export type EmailVerification = typeof emailVerificationsTable.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type InsertGrade = z.infer<typeof insertGradeSchema>;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertEmailVerification = z.infer<typeof insertEmailVerificationSchema>;
