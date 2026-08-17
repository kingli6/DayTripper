import type { RequestHandler } from "express";
import { requireAuth } from "./requireAuth";

function configuredAdminIds() {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  requireAuth(req, res, () => {
    const userId = res.locals.userId;
    if (!userId || !configuredAdminIds().has(userId)) {
      res.status(403).json({ error: "Admin access is not configured for this account." });
      return;
    }
    next();
  });
};