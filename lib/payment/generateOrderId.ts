import "server-only";
import { randomBytes } from "node:crypto";

/** Format: DMT-{timestamp}-{6 hex acak}, mis. "DMT-1735268400000-A1B2C3". */
export function generateOrderId(): string {
  const random = randomBytes(3).toString("hex").toUpperCase();
  return `DMT-${Date.now()}-${random}`;
}
