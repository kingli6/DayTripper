import { Router, type IRouter } from "express";
import activitiesRouter from "./activities";
import activityChangesRouter from "./activityChanges";
import adminRouter from "./admin";
import aiRouter from "./ai";
import executionRouter from "./execution";
import healthRouter from "./health";
import planningRouter from "./planning";
import retentionRouter from "./retention";
import tasksRouter from "./tasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(executionRouter);
router.use(planningRouter);
router.use(activitiesRouter);
router.use(activityChangesRouter);
router.use(retentionRouter);
router.use(tasksRouter);
router.use(adminRouter);

export default router;
