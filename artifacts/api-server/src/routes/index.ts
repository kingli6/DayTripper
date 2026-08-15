import { Router, type IRouter } from "express";
import activitiesRouter from "./activities";
import aiRouter from "./ai";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(activitiesRouter);

export default router;
