import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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
