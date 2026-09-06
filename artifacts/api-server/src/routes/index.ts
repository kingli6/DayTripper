import { Router, type IRouter } from "express";
import activitiesRouter from "./activities";
import boardCardsRouter from "./boardCards";
import activityChangesRouter from "./activityChanges";
import adminRouter from "./admin";
import aiRouter from "./ai";
import healthRouter from "./health";
import planningRouter from "./planning";
import retentionRouter from "./retention";
import tasksRouter from "./tasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(planningRouter);
router.use(activitiesRouter);
router.use(boardCardsRouter);
router.use(activityChangesRouter);
router.use(retentionRouter);
router.use(tasksRouter);
router.use(adminRouter);

export default router;
