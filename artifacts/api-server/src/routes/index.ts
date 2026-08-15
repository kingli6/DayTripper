import { Router, type IRouter } from "express";
import activitiesRouter from "./activities";
import aiRouter from "./ai";
import healthRouter from "./health";
import planningRouter from "./planning";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(planningRouter);
router.use(activitiesRouter);

export default router;
