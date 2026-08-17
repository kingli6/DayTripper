import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const frontendDistPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../day-tripper/dist/public",
  );
  const frontendIndexPath = path.join(frontendDistPath, "index.html");

  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route not found" });
};

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  req.log.error({ err }, "Unhandled API error");

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({ error: "Something went wrong. Please try again." });
};

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
