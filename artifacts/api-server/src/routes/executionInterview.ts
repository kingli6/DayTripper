import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  executionInterviewsTable,
  executionObservationsTable,
  type ExecutionInterviewMessage,
} from "@workspace/db";
import {
  AnswerExecutionInterviewBody,
  AnswerExecutionInterviewParams,
  AnswerExecutionInterviewResponse,
  FinishExecutionInterviewParams,
  FinishExecutionInterviewResponse,
  StartExecutionInterviewResponse,
} from "@workspace/api-zod";
import { getGeminiConfig, isGeminiConfigured } from "../lib/ai";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

const FIRST_QUESTION = "When you have several things you could do, what usually happens?";
const MAX_QUESTIONS = 4;
const INTERVIEW_SOURCE = "interview";
const INTERVIEW_INFERENCE_SOURCE = "interview-inference";
const STOPPED_SUMMARY = "That’s enough for now. Nothing was changed in your schedule.";

type InterviewCandidateObservation = {
  dimension: string;
  finding: string;
  stateContext: "baseline" | "relaxed" | "normal" | "stressed" | "overloaded" | null;
  confidence: number;
  evidenceType: "explicit" | "inferred";
};

type InterviewModelResponse = {
  observations: InterviewCandidateObservation[];
  question: string | null;
  shouldFinish: boolean;
};

function ownerIdFromRequest(res: { locals: { userId?: unknown } }): string | null {
  return typeof res.locals.userId === "string" ? res.locals.userId : null;
}

function trimAnswer(answer: string): string {
  return answer.trim();
}

function normalizeWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function findingSimilarity(first: string, second: string): number {
  const firstWords = normalizeWords(first);
  const secondWords = normalizeWords(second);
  if (!firstWords.size || !secondWords.size) return 0;
  let intersection = 0;
  for (const word of firstWords) {
    if (secondWords.has(word)) intersection += 1;
  }
  return intersection / new Set([...firstWords, ...secondWords]).size;
}

function isSameObservation(
  existing: typeof executionObservationsTable.$inferSelect,
  candidate: {
    dimension: string;
    finding: string;
    stateContext: string | null;
  },
): boolean {
  return existing.dimension.trim().toLowerCase() === candidate.dimension.trim().toLowerCase()
    && existing.stateContext === candidate.stateContext
    && (
      findingSimilarity(existing.finding, candidate.finding) >= 0.45
      || existing.finding.toLowerCase().includes(candidate.finding.toLowerCase())
      || candidate.finding.toLowerCase().includes(existing.finding.toLowerCase())
    );
}

function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
      ? (part as { text: string }).text
      : "")
    .join("")
    .trim();
  return text || null;
}

function parseGeminiJson(text: string): unknown {
  const candidates = [
    text.trim(),
    ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
      .map((match) => match[1].trim())
      .filter(Boolean),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1));
        } catch {
          // Continue to the next candidate and report a bounded parse failure.
        }
      }
    }
  }

  throw new SyntaxError("Gemini response did not contain valid JSON");
}

function geminiFinishReason(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
  const reason = (payload.candidates[0] as { finishReason?: unknown } | undefined)?.finishReason;
  return typeof reason === "string" ? reason : null;
}

function geminiResponseShape(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {
      type: Array.isArray(payload) ? "array" : typeof payload,
    };
  }

  const candidates = payload.candidates;
  const firstCandidate = Array.isArray(candidates) && isRecord(candidates[0])
    ? candidates[0]
    : null;
  const content = firstCandidate && isRecord(firstCandidate.content)
    ? firstCandidate.content
    : null;
  const parts = content?.parts;

  return {
    topLevelKeys: Object.keys(payload),
    candidateCount: Array.isArray(candidates) ? candidates.length : null,
    finishReason: firstCandidate?.finishReason ?? null,
    partCount: Array.isArray(parts) ? parts.length : null,
    textPartCount: Array.isArray(parts)
      ? parts.filter((part) => isRecord(part) && typeof part.text === "string").length
      : null,
  };
}

function interviewResponseShape(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      type: Array.isArray(value) ? "array" : typeof value,
    };
  }

  const observations = value.observations;
  const firstObservation = Array.isArray(observations) && isRecord(observations[0])
    ? observations[0]
    : null;

  return {
    keys: Object.keys(value),
    observationCount: Array.isArray(observations) ? observations.length : null,
    observationKeys: firstObservation ? Object.keys(firstObservation) : null,
    questionType: value.question === null ? "null" : typeof value.question,
    questionLength: typeof value.question === "string" ? value.question.length : null,
    shouldFinishType: typeof value.shouldFinish,
  };
}

function geminiProviderError(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return {};
  }

  const providerError = payload.error;
  const details = Array.isArray(providerError.details) ? providerError.details : [];
  const retryInfo = details.find((detail) =>
    isRecord(detail)
    && typeof detail["@type"] === "string"
    && detail["@type"].endsWith("RetryInfo"),
  );

  return {
    providerCode: typeof providerError.code === "number" ? providerError.code : null,
    providerStatus: typeof providerError.status === "string" ? providerError.status : null,
    retryDelay: retryInfo && typeof retryInfo.retryDelay === "string"
      ? retryInfo.retryDelay
      : null,
  };
}

function retryDelaySeconds(payload: unknown): number | null {
  const summary = geminiProviderError(payload);
  if (typeof summary.retryDelay !== "string") return null;
  const match = summary.retryDelay.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Math.ceil(Number(match[1]));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isStateContext(value: unknown): value is InterviewCandidateObservation["stateContext"] {
  return value === null
    || value === "baseline"
    || value === "relaxed"
    || value === "normal"
    || value === "stressed"
    || value === "overloaded";
}

function isInterviewModelResponse(value: unknown): value is InterviewModelResponse {
  if (!isRecord(value) || !hasOnlyKeys(value, ["observations", "question", "shouldFinish"])) return false;
  if (!Array.isArray(value.observations) || value.observations.length > 3) return false;
  if (value.question !== null && (typeof value.question !== "string" || value.question.length > 240)) return false;
  if (typeof value.shouldFinish !== "boolean") return false;

  return value.observations.every((observation): observation is InterviewCandidateObservation => {
    if (!isRecord(observation) || !hasOnlyKeys(observation, [
      "dimension",
      "finding",
      "stateContext",
      "confidence",
      "evidenceType",
    ])) return false;
    return typeof observation.dimension === "string"
      && observation.dimension.trim().length > 0
      && observation.dimension.length <= 120
      && typeof observation.finding === "string"
      && observation.finding.trim().length > 0
      && observation.finding.length <= 1000
      && isStateContext(observation.stateContext)
      && typeof observation.confidence === "number"
      && Number.isFinite(observation.confidence)
      && observation.confidence >= 0
      && observation.confidence <= 1
      && (observation.evidenceType === "explicit" || observation.evidenceType === "inferred");
  });
}

function buildInterviewPrompt(
  question: string,
  messages: ExecutionInterviewMessage[],
  answer: string,
  questionNumber: number,
) {
  return `You are Day Tripper's private behavioral interview guide.

Return JSON only in this exact shape:
{
  "observations": [
    {
      "dimension": "decision_making",
      "finding": "Several reasonable options can cause decision paralysis.",
      "stateContext": "stressed",
      "confidence": 0.65,
      "evidenceType": "explicit"
    }
  ],
  "question": "string or null",
  "shouldFinish": false
}

This is question ${questionNumber} of at most ${MAX_QUESTIONS}. Ask about actual behavior, not personality, labels, scores, or diagnoses.

Rules:
- Return at most 3 observations. Return an empty array when the answer does not provide meaningful evidence.
- Only use stateContext values: baseline, relaxed, normal, stressed, overloaded, or null.
- Use evidenceType "explicit" when the user directly described the behavior. Use "inferred" only for a cautious interpretation grounded in the answer.
- Keep confidence cautious. One answer must never create a strong permanent belief; use at most 0.7 for a new candidate.
- Preserve state differences. Do not flatten relaxed, normal, stressed, or overloaded behavior into one baseline finding.
- Ask one short follow-up only when an important uncertainty remains. Prefer a state-dependent clarification when relevant.
- Set shouldFinish true and question null when the answer is sufficient or when no useful follow-up remains.
- Never ask personality-test questions such as type, rating, or whether the user is a procrastinator.
- Keep the question under 240 characters and the finding under 1000 characters.

Current question:
${question}

Earlier interview messages:
${JSON.stringify(messages)}

Latest answer:
${answer}`;
}

async function getInterview(interviewId: number, ownerId: string) {
  const [interview] = await db
    .select()
    .from(executionInterviewsTable)
    .where(and(
      eq(executionInterviewsTable.id, interviewId),
      eq(executionInterviewsTable.ownerId, ownerId),
    ))
    .limit(1);
  return interview;
}

function serializeObservation(observation: typeof executionObservationsTable.$inferSelect) {
  return {
    id: observation.id,
    dimension: observation.dimension,
    finding: observation.finding,
    stateContext: observation.stateContext,
    confidence: observation.confidence,
    evidenceCount: observation.evidenceCount,
    source: observation.source,
    createdAt: observation.createdAt.toISOString(),
    updatedAt: observation.updatedAt.toISOString(),
  };
}

router.post("/execution/interview", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const [interview] = await db
    .insert(executionInterviewsTable)
    .values({
      ownerId,
      status: "active",
      questionIndex: 1,
      currentQuestion: FIRST_QUESTION,
      messages: [],
    })
    .returning();

  res.status(201).json(StartExecutionInterviewResponse.parse({
    interviewId: interview.id,
    status: "active",
    question: FIRST_QUESTION,
    questionNumber: 1,
  }));
});

router.post("/execution/interview/:interviewId/answer", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = AnswerExecutionInterviewParams.safeParse(req.params);
  const body = AnswerExecutionInterviewBody.safeParse(req.body);
  if (!params.success || !body.success || !Number.isInteger(params.data.interviewId)) {
    res.status(400).json({ error: "Please provide a valid interview answer." });
    return;
  }

  const interview = await getInterview(params.data.interviewId, ownerId);
  if (!interview) {
    res.status(404).json({ error: "Interview not found." });
    return;
  }
  if (interview.status !== "active" || !interview.currentQuestion) {
    res.status(409).json({ error: "This interview is no longer active." });
    return;
  }

  const answer = trimAnswer(body.data.answer);
  if (!answer) {
    res.status(400).json({ error: "Please share an answer or stop the interview." });
    return;
  }
  if (!isGeminiConfigured()) {
    req.log.warn("Execution interview requested while Gemini is not configured");
    res.status(503).json({ error: "The interview is not available right now." });
    return;
  }

  const config = getGeminiConfig();
  const priorMessages = interview.messages ?? [];
  const prompt = buildInterviewPrompt(
    interview.currentQuestion,
    priorMessages,
    answer,
    interview.questionIndex,
  );

  let candidate: unknown;
  let providerPayload: unknown = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 1800,
          temperature: 0.35,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const providerErrorPayload = await response.json().catch(() => null);
      const providerError = geminiProviderError(providerErrorPayload);
      const retryAfter = retryDelaySeconds(providerErrorPayload);
      req.log.warn({
        interviewId: interview.id,
        questionNumber: interview.questionIndex,
        status: response.status,
        ...providerError,
      }, "Execution interview provider request was rejected");
      if (retryAfter) {
        res.setHeader("Retry-After", String(retryAfter));
      }
      res.status(503).json({
        error: response.status === 429
          ? "The check-in is temporarily rate limited. Please try again shortly."
          : "The interview is not available right now.",
      });
      return;
    }

    providerPayload = await response.json();
    const text = extractGeminiText(providerPayload);
    if (!text) {
      req.log.warn({
        interviewId: interview.id,
        questionNumber: interview.questionIndex,
        finishReason: geminiFinishReason(providerPayload),
        responseShape: geminiResponseShape(providerPayload),
      }, "Execution interview provider returned no text");
      res.status(502).json({ error: "The interview returned an invalid response." });
      return;
    }

    try {
      candidate = parseGeminiJson(text);
    } catch {
      req.log.warn({
        interviewId: interview.id,
        questionNumber: interview.questionIndex,
        finishReason: geminiFinishReason(providerPayload),
        responseShape: geminiResponseShape(providerPayload),
        textLength: text.length,
      }, "Execution interview provider returned invalid JSON");
      res.status(502).json({ error: "The interview returned an invalid response. Please try again." });
      return;
    }
  } catch (error) {
    req.log.error({
      errorName: error instanceof Error ? error.name : typeof error,
      timeout: error instanceof Error && error.name === "AbortError",
    }, "Execution interview provider request failed");
    res.status(503).json({ error: "The interview is not available right now." });
    return;
  } finally {
    clearTimeout(timeout);
  }

  if (!isInterviewModelResponse(candidate)) {
    req.log.warn({
      interviewId: interview.id,
      questionNumber: interview.questionIndex,
      responseShape: interviewResponseShape(candidate),
    }, "Execution interview provider returned an invalid response shape");
    res.status(502).json({ error: "The interview returned an invalid response." });
    return;
  }

  const modelResponse = candidate;
  const shouldFinish = modelResponse.shouldFinish
    || interview.questionIndex >= MAX_QUESTIONS
    || !modelResponse.question;
  const nextQuestion = shouldFinish
    ? null
    : typeof modelResponse.question === "string"
      ? modelResponse.question.trim()
      : null;
  if (!shouldFinish && !nextQuestion) {
    res.status(502).json({ error: "The interview returned an invalid next question." });
    return;
  }

  const savedObservations = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(executionObservationsTable)
      .where(eq(executionObservationsTable.ownerId, ownerId))
      .orderBy(desc(executionObservationsTable.updatedAt));

    const saved: Array<typeof executionObservationsTable.$inferSelect> = [];
    for (const observation of modelResponse.observations) {
      const dimension = observation.dimension.trim();
      const finding = observation.finding.trim();
      const match = existing.find((item) => isSameObservation(item, {
        dimension,
        finding,
        stateContext: observation.stateContext,
      }));
      const candidateConfidence = Math.min(0.7, observation.confidence);

      if (match) {
        const nextConfidence = Math.min(
          0.85,
          Math.max(0, match.confidence + (candidateConfidence - match.confidence) * 0.2),
        );
        const [updated] = await tx
          .update(executionObservationsTable)
          .set({
            evidenceCount: match.evidenceCount + 1,
            confidence: nextConfidence,
            source: observation.evidenceType === "explicit"
              ? INTERVIEW_SOURCE
              : match.source,
          })
          .where(and(
            eq(executionObservationsTable.id, match.id),
            eq(executionObservationsTable.ownerId, ownerId),
          ))
          .returning();
        if (updated) saved.push(updated);
      } else {
        const [created] = await tx
          .insert(executionObservationsTable)
          .values({
            ownerId,
            dimension,
            finding,
            stateContext: observation.stateContext,
            confidence: candidateConfidence,
            evidenceCount: 1,
            source: observation.evidenceType === "explicit"
              ? INTERVIEW_SOURCE
              : INTERVIEW_INFERENCE_SOURCE,
          })
          .returning();
        if (created) {
          existing.push(created);
          saved.push(created);
        }
      }
    }

    const messages: ExecutionInterviewMessage[] = [
      ...priorMessages,
      { role: "user", content: answer },
      ...(nextQuestion ? [{ role: "assistant" as const, content: nextQuestion }] : []),
    ];

    await tx
      .update(executionInterviewsTable)
      .set({
        status: shouldFinish ? "finished" : "active",
        questionIndex: shouldFinish ? interview.questionIndex : interview.questionIndex + 1,
        currentQuestion: nextQuestion,
        messages,
        finishedAt: shouldFinish ? new Date() : null,
      })
      .where(and(
        eq(executionInterviewsTable.id, interview.id),
        eq(executionInterviewsTable.ownerId, ownerId),
      ));

    return saved;
  });

  res.json(AnswerExecutionInterviewResponse.parse({
    status: shouldFinish ? "finished" : "active",
    question: nextQuestion,
    questionNumber: shouldFinish ? null : interview.questionIndex + 1,
    observations: savedObservations.map(serializeObservation),
  }));
});

router.post("/execution/interview/:interviewId/finish", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = FinishExecutionInterviewParams.safeParse(req.params);
  if (!params.success || !Number.isInteger(params.data.interviewId)) {
    res.status(400).json({ error: "Please provide a valid interview." });
    return;
  }

  const interview = await getInterview(params.data.interviewId, ownerId);
  if (!interview) {
    res.status(404).json({ error: "Interview not found." });
    return;
  }
  if (interview.status !== "active") {
    res.status(409).json({ error: "This interview is no longer active." });
    return;
  }

  await db
    .update(executionInterviewsTable)
    .set({
      status: "stopped",
      currentQuestion: null,
      finishedAt: new Date(),
    })
    .where(and(
      eq(executionInterviewsTable.id, interview.id),
      eq(executionInterviewsTable.ownerId, ownerId),
    ));

  res.json(FinishExecutionInterviewResponse.parse({
    status: "stopped",
    summary: STOPPED_SUMMARY,
  }));
});

export default router;