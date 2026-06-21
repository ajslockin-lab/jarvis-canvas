import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";

const router = Router();

// Frontend error reporting endpoint.
// The web app POSTs uncaught exceptions here so they're captured in
// server logs (pino) instead of silently disappearing in the browser.

const clientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(10000).optional(),
  url: z.string().max(500).optional(),
  line: z.number().optional(),
  col: z.number().optional(),
  userAgent: z.string().max(500).optional(),
});

router.post("/errors", (req, res) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid error report" });
    return;
  }

  const { message, stack, url, line, col, userAgent } = parsed.data;

  logger.error(
    {
      source: "client",
      message,
      stack: stack?.slice(0, 2000),
      url,
      line,
      col,
      userAgent: userAgent?.slice(0, 200),
    },
    "Client-side error reported",
  );

  res.status(204).end();
});

export default router;
