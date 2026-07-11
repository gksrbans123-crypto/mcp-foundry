import type { User } from "@mcp-foundry/shared";
import type { Queryable } from "../pool.js";
import { mapUserRow, type UserRow } from "./rows.js";

export interface CreateUserInput {
  authRef: string;
}

export async function createUser(db: Queryable, input: CreateUserInput): Promise<User> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (auth_ref) VALUES ($1) RETURNING *`,
    [input.authRef],
  );
  return mapUserRow(result.rows[0]!);
}

export async function findUserById(db: Queryable, id: string): Promise<User | null> {
  const result = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function findUserByAuthRef(db: Queryable, authRef: string): Promise<User | null> {
  const result = await db.query<UserRow>(`SELECT * FROM users WHERE auth_ref = $1`, [authRef]);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}
