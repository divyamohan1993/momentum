import { z } from "zod";
export const SharedTaskFields = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(1500).default(""),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
  priority: z.enum(["low", "med", "high"]).default("med"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v).nullable().default(null),
  assignee: z.string().min(1).max(128).nullable().default(null),
}).strict();
export type SharedTask = z.infer<typeof SharedTaskFields> & { id: string; revision: number; updatedAt: string; updatedBy: string };
export type SharedMember = { uid: string; email: string };
export type SharedList = { id: string; name: string; ownerUid: string; version: number; members: SharedMember[]; tasks: SharedTask[]; invitations: { id: string; email: string; expiresAt: number }[] };
export type SharedSummary = Pick<SharedList, "id" | "name" | "ownerUid" | "version"> & { memberCount: number; open: number };
const id = z.string().uuid();
export const SharedAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal("accept"), token: z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/) }).strict(),
  z.object({ action: z.literal("rename"), id, name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal("delete"), id }).strict(),
  z.object({ action: z.literal("invite"), id, email: z.string().trim().email().max(254).transform(v => v.toLowerCase()) }).strict(),
  z.object({ action: z.literal("revoke"), id, inviteId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
  z.object({ action: z.literal("removeMember"), id, uid: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal("leave"), id }).strict(),
  z.object({ action: z.literal("addTask"), id, task: SharedTaskFields }).strict(),
  z.object({ action: z.literal("editTask"), id, taskId: id, revision: z.number().int().positive(), patch: SharedTaskFields.partial() }).strict(),
  z.object({ action: z.literal("deleteTask"), id, taskId: id, revision: z.number().int().positive() }).strict(),
]);
export type SharedAction = z.infer<typeof SharedAction>;
