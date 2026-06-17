import { pgTable, text, timestamp, boolean, real, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  canvasBaseUrl: text("canvas_base_url"),
  canvasAccessTokenEncrypted: text("canvas_access_token_encrypted"),
  canvasRefreshTokenEncrypted: text("canvas_refresh_token_encrypted"),
  canvasTokenExpiresAt: timestamp("canvas_token_expires_at"),
  canvasUserId: text("canvas_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export const insertCourseSchema = createInsertSchema(coursesTable).omit({ createdAt: true });
export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({ createdAt: true, updatedAt: true });
export const insertGradeSchema = createInsertSchema(gradesTable).omit({ id: true, fetchedAt: true });
export const insertReminderSchema = createInsertSchema(remindersTable).omit({ createdAt: true });
export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true });

export type User = typeof usersTable.$inferSelect;
export type Course = typeof coursesTable.$inferSelect;
export type Assignment = typeof assignmentsTable.$inferSelect;
export type Grade = typeof gradesTable.$inferSelect;
export type Reminder = typeof remindersTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type InsertGrade = z.infer<typeof insertGradeSchema>;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
