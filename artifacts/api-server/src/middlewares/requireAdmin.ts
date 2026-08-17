import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

function configuredAdminIds() {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function configuredAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function isConfiguredAdmin(userId: string) {
  if (configuredAdminIds().has(userId)) return true;

  const allowedEmails = configuredAdminEmails();
  if (!allowedEmails.size) return false;

  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some((email) =>
    allowedEmails.has(email.emailAddress.trim().toLowerCase()),
  );
}

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  try {
    if (!(await isConfiguredAdmin(userId))) {
      res.status(403).json({ error: "Admin access is not configured for this account." });
      return;
    }
  } catch (error) {
    req.log.error({ err: error }, "Unable to verify admin identity");
    res.status(503).json({ error: "Admin access could not be verified. Please try again." });
    return;
  }

  res.locals.userId = userId;
  next();
};