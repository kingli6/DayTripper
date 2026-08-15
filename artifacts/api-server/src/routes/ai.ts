import { Router, type IRouter } from "express";
import { GetAiStatusResponse } from "@workspace/api-zod";
import { geminiPublicConfig, isGeminiConfigured } from "../lib/ai";

const router: IRouter = Router();

router.get("/ai/status", (_req, res) => {
  res.json(
    GetAiStatusResponse.parse({
      ...geminiPublicConfig,
      configured: isGeminiConfigured(),
    }),
  );
});

export default router;