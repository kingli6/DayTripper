import { clerkClient, type User } from "@clerk/express";
import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import {
  GetAdminOverviewResponse,
  ResetAdminAccountDataBody,
  ResetAdminAccountDataParams,
  ResetAdminAccountDataResponse,
} from "@workspace/api-zod";
import {
  activityChangesTable,
  activitiesTable,
  adminActionsTable,
  db,
  journalEntriesTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();
const GIB = 1024 ** 3;
const DEVELOPMENT_CAPACITY_BYTES = 20 * GIB;
const PRODUCTION_CAPACITY_BYTES = 10 * GIB;
const RESET_CONFIRMATION = "RESET ACCOUNT DATA";

type ScalarRow = Record<string, string | number | null>;

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = -1;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function adminCapacity() {
  const capacityBytes = process.env.NODE_ENV === "production"
    ? PRODUCTION_CAPACITY_BYTES
    : DEVELOPMENT_CAPACITY_BYTES;
  return {
    capacityBytes,
    capacityLabel: formatBytes(capacityBytes),
    capacitySource: process.env.NODE_ENV === "production"
      ? "Replit PostgreSQL production allowance"
      : "Replit PostgreSQL development allowance",
  };
}

function userLabel(user: User | undefined) {
  if (!user) return { email: null, displayName: null };
  const email = user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? null;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return { email, displayName };
}

async function loadUserMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, { email: string | null; displayName: string | null }>();

  try {
    const response = await clerkClient.users.getUserList({ userId: userIds });
    return new Map(response.data.map((user) => [user.id, userLabel(user)]));
  } catch (error) {
    return new Map<string, { email: string | null; displayName: string | null }>();
  }
}

router.use(requireAdmin);

router.get("/admin/overview", async (req, res): Promise<void> => {
  const [databaseRows, tableRows, accountRows, recentRows, actionRows] = await Promise.all([
    db.execute(sql`
      SELECT pg_database_size(current_database()) AS used_bytes
    `),
    db.execute(sql`
      SELECT table_name, row_count, size_bytes
      FROM (
        SELECT 'activities' AS table_name,
          (SELECT COUNT(*) FROM activities) AS row_count,
          pg_total_relation_size('public.activities'::regclass) AS size_bytes
        UNION ALL
        SELECT 'activity_changes',
          (SELECT COUNT(*) FROM activity_changes),
          pg_total_relation_size('public.activity_changes'::regclass)
        UNION ALL
        SELECT 'journal_entries',
          (SELECT COUNT(*) FROM journal_entries),
          pg_total_relation_size('public.journal_entries'::regclass)
        UNION ALL
        SELECT 'app_metadata',
          (SELECT COUNT(*) FROM app_metadata),
          pg_total_relation_size('public.app_metadata'::regclass)
        UNION ALL
        SELECT 'admin_actions',
          (SELECT COUNT(*) FROM admin_actions),
          pg_total_relation_size('public.admin_actions'::regclass)
      ) AS metrics
      ORDER BY size_bytes DESC
    `),
    db.execute(sql`
      SELECT owners.account_id,
        COALESCE(activity_metrics.activity_count, 0) AS activity_count,
        COALESCE(journal_metrics.journal_entry_count, 0) AS journal_entry_count,
        COALESCE(change_metrics.change_count, 0) AS change_count,
        activity_metrics.first_activity_at,
        activity_metrics.last_activity_at
      FROM (
        SELECT owner_id AS account_id FROM activities
        UNION
        SELECT owner_id AS account_id FROM journal_entries
        UNION
        SELECT owner_id AS account_id FROM activity_changes
      ) AS owners
      LEFT JOIN (
        SELECT owner_id, COUNT(*) AS activity_count,
          MIN(created_at) AS first_activity_at,
          MAX(created_at) AS last_activity_at
        FROM activities
        GROUP BY owner_id
      ) AS activity_metrics ON activity_metrics.owner_id = owners.account_id
      LEFT JOIN (
        SELECT owner_id, COUNT(*) AS journal_entry_count
        FROM journal_entries
        GROUP BY owner_id
      ) AS journal_metrics ON journal_metrics.owner_id = owners.account_id
      LEFT JOIN (
        SELECT owner_id, COUNT(*) AS change_count
        FROM activity_changes
        GROUP BY owner_id
      ) AS change_metrics ON change_metrics.owner_id = owners.account_id
      ORDER BY activity_count DESC, owners.account_id
    `),
    db.execute(sql`
      SELECT MAX(created_at) AS recent_activity_at FROM activities
    `),
    db.execute(sql`
      SELECT id, action_type, target_owner_id, deleted_rows, created_at
      FROM admin_actions
      ORDER BY created_at DESC
      LIMIT 12
    `),
  ]);

  const accountIds = accountRows.rows.map((row) => String((row as ScalarRow).account_id));
  const actionTargetIds = actionRows.rows.map((row) => String((row as ScalarRow).target_owner_id));
  const identityMap = await loadUserMap([...new Set([...accountIds, ...actionTargetIds])]);
  const usedBytes = numberValue((databaseRows.rows[0] as ScalarRow | undefined)?.used_bytes);
  const capacity = adminCapacity();
  const remainingBytes = Math.max(capacity.capacityBytes - usedBytes, 0);
  const tableMetrics = tableRows.rows.map((row) => {
    const item = row as ScalarRow;
    const sizeBytes = numberValue(item.size_bytes);
    return {
      tableName: String(item.table_name),
      rowCount: numberValue(item.row_count),
      sizeBytes,
      sizeLabel: formatBytes(sizeBytes),
    };
  });
  const accountActivity = accountRows.rows.map((row) => {
    const item = row as ScalarRow;
    const accountId = String(item.account_id);
    const identity = identityMap.get(accountId) ?? { email: null, displayName: null };
    return {
      accountId,
      ...identity,
      activityCount: numberValue(item.activity_count),
      journalEntryCount: numberValue(item.journal_entry_count),
      changeCount: numberValue(item.change_count),
      firstActivityAt: item.first_activity_at ? new Date(String(item.first_activity_at)).toISOString() : null,
      lastActivityAt: item.last_activity_at ? new Date(String(item.last_activity_at)).toISOString() : null,
    };
  });
  const recentAdminActions = actionRows.rows.map((row) => {
    const item = row as ScalarRow;
    const targetAccountId = String(item.target_owner_id);
    return {
      id: numberValue(item.id),
      actionType: String(item.action_type),
      targetAccountId,
      targetEmail: identityMap.get(targetAccountId)?.email ?? null,
      deletedRows: numberValue(item.deleted_rows),
      createdAt: new Date(String(item.created_at)).toISOString(),
    };
  });
  const totalRows = tableMetrics.reduce((sum, table) => sum + table.rowCount, 0);
  const recentActivityAt = (recentRows.rows[0] as ScalarRow | undefined)?.recent_activity_at;

  res.json(GetAdminOverviewResponse.parse({
    access: {
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      capacitySource: capacity.capacitySource,
    },
    accounts: accountActivity.length,
    totalRows,
    database: {
      usedBytes,
      usedLabel: formatBytes(usedBytes),
      capacityBytes: capacity.capacityBytes,
      capacityLabel: capacity.capacityLabel,
      remainingBytes,
      remainingLabel: formatBytes(remainingBytes),
      percentUsed: Number(((usedBytes / capacity.capacityBytes) * 100).toFixed(2)),
    },
    tables: tableMetrics,
    accountActivity,
    recentAdminActions,
    recentActivityAt: recentActivityAt ? new Date(String(recentActivityAt)).toISOString() : null,
  }));
});

router.post("/admin/accounts/:accountId/reset", async (req, res): Promise<void> => {
  const params = ResetAdminAccountDataParams.safeParse(req.params);
  const parsed = ResetAdminAccountDataBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: `Type ${RESET_CONFIRMATION} exactly to confirm this account reset.` });
    return;
  }
  if (parsed.data.confirmation !== RESET_CONFIRMATION) {
    res.status(400).json({ error: `Type ${RESET_CONFIRMATION} exactly to confirm this account reset.` });
    return;
  }

  const targetOwnerId = params.data.accountId;
  const result = await db.transaction(async (tx) => {
    const existing = await tx.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM activities WHERE owner_id = ${targetOwnerId}
        UNION ALL
        SELECT 1 FROM journal_entries WHERE owner_id = ${targetOwnerId}
        UNION ALL
        SELECT 1 FROM activity_changes WHERE owner_id = ${targetOwnerId}
      ) AS has_records
    `);
    const hasRecords = Boolean((existing.rows[0] as ScalarRow | undefined)?.has_records);
    if (!hasRecords) return null;

    const deleted = await tx.execute(sql`
      WITH deleted_journal AS (
        DELETE FROM journal_entries WHERE owner_id = ${targetOwnerId} RETURNING 1
      ), deleted_changes AS (
        DELETE FROM activity_changes WHERE owner_id = ${targetOwnerId} RETURNING 1
      ), deleted_activities AS (
        DELETE FROM activities WHERE owner_id = ${targetOwnerId} RETURNING 1
      )
      SELECT
        (SELECT COUNT(*) FROM deleted_journal)
        + (SELECT COUNT(*) FROM deleted_changes)
        + (SELECT COUNT(*) FROM deleted_activities) AS deleted_rows
    `);
    const deletedRows = numberValue((deleted.rows[0] as ScalarRow | undefined)?.deleted_rows);
    const [action] = await tx.insert(adminActionsTable).values({
      adminUserId: res.locals.userId as string,
      actionType: "reset_account_data",
      targetOwnerId,
      deletedRows,
    }).returning();
    return { deletedRows, action };
  });

  if (!result?.action) {
    res.status(404).json({ error: "That account has no saved planner data." });
    return;
  }

  req.log.info({
    actionId: result.action.id,
    targetOwnerId,
    deletedRows: result.deletedRows,
  }, "Admin reset account planner data");
  res.json(ResetAdminAccountDataResponse.parse({
    accountId: targetOwnerId,
    deletedRows: result.deletedRows,
    message: "That account's planner data was reset.",
    actionId: result.action.id,
    createdAt: result.action.createdAt.toISOString(),
  }));
});

export default router;