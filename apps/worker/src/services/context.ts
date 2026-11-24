import type { Db } from "../db/client";

export interface ServiceContext {
  db: Db;
  /** Owner of the data (lower-cased email from Cloudflare Access / MCP OAuth). */
  ownerId: string;
  /** "Today" for date-relative calculations (overridable in tests). */
  today: string;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
