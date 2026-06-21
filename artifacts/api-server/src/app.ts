import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

// Security headers
app.use(helmet());

// CORS — restrict to known origins in production
const allowedOrigins = process.env["ALLOWED_ORIGINS"]
  ? process.env["ALLOWED_ORIGINS"].split(",").map((s) => s.trim()).filter(Boolean)
  : process.env["NODE_ENV"] === "production"
    ? [] // Must set ALLOWED_ORIGINS in production
    : ["http://localhost:20034", "http://localhost:5173"];

if (process.env["NODE_ENV"] === "production" && allowedOrigins.length === 0) {
  logger.warn(
    "ALLOWED_ORIGINS is not set — all cross-origin requests will be rejected. " +
    "Set ALLOWED_ORIGINS=https://yourdomain.com to allow the frontend.",
  );
}

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) {
        // In production with no ALLOWED_ORIGINS set, allow same-origin only
        callback(new Error("CORS not configured — set ALLOWED_ORIGINS"));
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed`));
      }
    },
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Rate limiting — stricter on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — try again later" },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded — slow down" },
});

// Apply rate limits
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

app.use("/api", router);

// CORS error fallback. The cors() middleware above rejects with a plain Error
// when the origin isn't allowlisted — by default that becomes a generic 500
// with no body, which the browser surfaces as a fetch TypeError. Intercept
// those errors and return a structured response so the frontend can render
// a helpful copy instead of falling through to "Connection error".
//
// Note: this only helps for the case where the request actually reaches
// Express. CORS preflight (OPTIONS) failures still surface in the browser
// as a TypeError before any of this code runs — that's by design and outside
// our control.
app.use((err: Error, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  if (err.message.includes("not allowed") || err.message.includes("CORS")) {
    res.status(403).json({ error: "Origin not allowed", code: "cors_blocked" });
    return;
  }
  // Fall through to the default error handler for anything we don't recognize.
  res.status(500).json({ error: "Internal server error", code: "server_error" });
});

export default app;
