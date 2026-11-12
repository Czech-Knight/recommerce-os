import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import type { Database } from "./db";
import type { User } from "./types";
import { isDemo } from "./config";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex"),
    actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function currentUser(db: Database): Promise<User | null> {
  const token = (await cookies()).get("rc_session")?.value;
  if (token) {
    const r = await db.query<User>(
      `SELECT u.id,u.name,u.email,u.role,u.status FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status<>'suspended'`,
      [digest(token)],
    );
    if (r.rows[0]) return r.rows[0];
  }
  if (isDemo())
    return (
      (
        await db.query<User>(
          "SELECT id,name,email,role,status FROM users WHERE id='demo-admin'",
        )
      ).rows[0] || null
    );
  return null;
}
export async function newSession(db: Database, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(token), userId],
  );
  (await cookies()).set("rc_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://") || false,
    path: "/",
    maxAge: 604800,
  });
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireRole(user: User | null, ...roles: string[]): User {
  if (!user) throw new AppError("Please sign in to continue.", 401);
  if (
    user.status === "suspended" ||
    (roles.length && !roles.includes(user.role))
  )
    throw new AppError("You do not have access to this action.", 403);
  return user;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_URL || new URL(request.url).origin;
  const localDemo =
    isDemo() &&
    !process.env.APP_URL &&
    ["http://127.0.0.1:3000", "http://localhost:3000"].includes(origin || "");
  if (
    !origin ||
    (!localDemo && new URL(origin).origin !== new URL(allowed).origin)
  )
    throw new AppError("Invalid request origin.", 403);
}
