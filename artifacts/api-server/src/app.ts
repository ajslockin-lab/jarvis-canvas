import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
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

// Compress JSON and text responses. ~70% bandwidth reduction for typical
// /api/chat, /api/canvas, /api/user payloads. The default filter already
// skips requests with a non-compressible Accept-Encoding — no app-level
// tuning needed. We add compression BEFORE the rate limiter so each
// limiter's 200/4xx JSON response body is also small.
app.use(compression());

// Security headers. Defaults are good for dev — the override below adds
// HSTS (only meaningful behind HTTPS) and tightens CSP for production
// where the API serves JSON, not HTML.
if (process.env["NODE_ENV"] === "production") {
  app.use(
    helmet({
      // 1y HSTS. Includes subdomains so all *.carvis.app assets benefit.
      // `preload` makes the host eligible for browser HSTS preload lists.
      // Once you ship this, removing HSTS is painful (browsers remember);
      // make sure HTTPS is genuinely permanent before opting in.
      strictTransportSecurity: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
      // API returns JSON, no scripts run in the response context. The
      // default helmet CSP is built for HTML docs and permits inline JS,
      // which we don't need — `default-src 'none'` is the safest baseline.
      // CORS still governs cross-origin XHR; this CSP is the no-script-
      // will-ever-go-here belt-and-braces guarantee.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // No Referer leakage to third parties. The web app at carvis.app
      // doesn't need to leak Canvas URLs to anyone.
      referrerPolicy: { policy: "no-referrer" },
      crossOriginEmbedderPolicy: false, // unset — irrelevant for JSON API
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
} else {
  // Dev: keep helmet defaults so dev tools don't get surprised by locked-
  // down headers. HSTS in dev would also break http://localhost reload.
  app.use(helmet());
}

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

// Cache policy. The API serves sensitive per-user data by default, so we
// don't let any intermediate (CDN, reverse proxy) hold on to responses.
// Auth-bearing routes use `no-store` (also disables heuristic caching).
// Public health and error-reporting endpoints are explicitly labeled so
// monitoring scrapers don't accidentally cache a not-ready state.
//
// Static assets (manifest.webmanifest, robots.txt) are handled by
// express.static() with its own maxAge — see below.
const setCachePolicy: import("express").RequestHandler = (_req, res, next) => {
  // Default for /api/*: never store, may conditionally revalidate.
  // force-cache=set on the response, never trust by intermediaries.
  res.setHeader("Cache-Control", "no-store");
  next();
};
app.use("/api", setCachePolicy);

// /healthz and /readyz are scrape targets; tell intermediaries to
// revalidate every time so a 503 from a wedged replica doesn't get
// pinned.
app.use("/api/healthz", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  next();
});
app.use("/api/readyz", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  next();
});

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
  // ponytail: let upstream error details land in the response when they look
  // shaped like a normal ApiError (status + code), otherwise keep the safe
  // default. Lifts the dev mask that was swallowing the real cause behind
  // {error:"Internal server error"} on /api/auth/signin.
  const e = err as { status?: number; code?: string; message?: string };
  const status = Number.isInteger(e.status) ? (e.status as number) : 500;
  const code = typeof e.code === "string" ? e.code : "server_error";
  const msg = typeof e.message === "string" ? e.message : "";
  const safeDetail =
    msg.length > 0 && msg.length < 200 && !/(?:password|token|secret|ECONNREFUSED|database)/i.test(msg)
      ? msg
      : "Internal server error";
  res.status(status).json({ error: safeDetail, code });
});

export default app;
