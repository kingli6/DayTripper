import { Router, type IRouter } from "express";
import activitiesRouter from "./activities";
import activityChangesRouter from "./activityChanges";
import adminRouter from "./admin";
import aiRouter from "./ai";
import healthRouter from "./health";
import journalEntriesRouter from "./journalEntries";
import planningRouter from "./planning";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(planningRouter);
router.use(activitiesRouter);
router.use(activityChangesRouter);
router.use(journalEntriesRouter);
router.use(adminRouter);

export default router;
