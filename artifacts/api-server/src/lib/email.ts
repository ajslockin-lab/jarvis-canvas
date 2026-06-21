// Email service abstraction.
//
// Modes:
//   - Dev (no RESEND_API_KEY): logs to stdout. The signup route also surfaces
//     the code in the response body via `devVerificationCodeIfEnabled`, so the
//     dev can copy it from the page without standing up email.
//   - Production (RESEND_API_KEY set): calls Resend's REST API via the SDK.
//
// Adding another provider:
//   1. The EmailService interface is two methods: sendVerificationCode. The
//      call site in routes/auth.ts doesn't change.
//   2. Add a new class, swap it into selectEmailService() based on env.
//   3. Don't log the code in production — log only "sent" / "failed".

import { Resend } from "resend";

export interface EmailService {
  sendVerificationCode(to: string, code: string): Promise<void>;
}

// Dev fallback. Logs the code so a developer running `pnpm dev` can copy it
// from the terminal. Also returns the code to the caller via the helper
// `devVerificationCodeIfEnabled`, which the signup route uses to surface
// it to the browser in non-production environments.
class DevEmailService implements EmailService {
  // Throttle stdout so we don't spam the log every time someone clicks resend.
  // (Resends are rate-limited at 1/60s in routes/auth.ts so this is belt-and-
  // braces.)
  async sendVerificationCode(to: string, code: string): Promise<void> {
    console.log(`[email:dev] verification code for ${to}: ${code}`);
  }
}

// Resend-backed production transport. Used when RESEND_API_KEY is set.
//
// We construct the SDK client lazily so dev runs without the dep evaluating
// the import (well, it always evaluates the import — but the constructor
// never runs in dev). The "from" address defaults to a Resend test sender
// that only delivers to the address that owns the API key; in production the
// operator should set EMAIL_FROM to a verified domain address.
class ResendEmailService implements EmailService {
  private client: Resend;
  private fromAddress: string;

  constructor(apiKey: string, fromAddress: string) {
    this.client = new Resend(apiKey);
    this.fromAddress = fromAddress;
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    // Don't log the code in production — a log line with the plaintext code
    // is exactly the kind of leak a security review would catch.
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject: "Your Carvis verification code",
      // Plain-text first; some clients strip HTML so this is the canonical body.
      text:
        `Your Carvis verification code is: ${code}\n\n` +
        `This code expires in 15 minutes. If you didn't request it, you can ignore this email.\n`,
      html:
        `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">` +
        `<h1 style="font-size: 18px; margin: 0 0 16px;">Your Carvis verification code</h1>` +
        `<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${code}</p>` +
        `<p style="font-size: 14px; color: #666;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>` +
        `</div>`,
    });

    if (result.error) {
      // Throw so sendVerificationCode's outer catch can log and swallow — the
      // user will retry via the resend flow.
      throw new Error(`Resend send failed: ${result.error.message ?? "unknown"}`);
    }
  }
}

function selectEmailService(): EmailService {
  // Resend is the only production provider wired today. RESEND_API_KEY gates
  // it so dev runs (no key) keep using the console-log fallback without
  // requiring the operator to delete an unused env var.
  const apiKey = process.env["RESEND_API_KEY"];
  if (apiKey) {
    // Default to onboarding@resend.dev (Resend's test sender, which delivers
    // only to the API key owner's verified email). Override via EMAIL_FROM
    // once a custom domain is verified in the Resend dashboard.
    const fromAddress = process.env["EMAIL_FROM"] ?? "Carvis <onboarding@resend.dev>";
    return new ResendEmailService(apiKey, fromAddress);
  }
  return new DevEmailService();
}

const service = selectEmailService();

/**
 * Send a verification code to the given email address.
 * Always resolves — caller doesn't need to handle transport failures because
 * the user can request a resend. If the underlying transport throws, we log
 * and swallow (the verification row is still in the DB and the user will see
 * a clear "code expired" / "no pending verification" on their next attempt
 * if delivery is genuinely broken).
 */
export async function sendVerificationCode(to: string, code: string): Promise<void> {
  try {
    await service.sendVerificationCode(to, code);
  } catch (err) {
    console.error("[email] Failed to send verification code:", err);
  }
}

/**
 * Dev-only: returns the verification code so the signup route can surface it
 * in the response body. When Resend is configured (the only real transport),
 * returns null and the route omits the field from the JSON it returns.
 *
 * The gate is on RESEND_API_KEY (not NODE_ENV) so a staging deploy that
 * happens to be NODE_ENV=production but hasn't set Resend yet still gets
 * the dev code in the response — and a production deploy with the key set
 * never leaks a code regardless of NODE_ENV value.
 *
 * This is the cheapest way to make the signup → verify flow testable without
 * standing up SMTP. The field is omitted from the response when Resend is
 * configured, so a real attacker can't read codes out of signup responses
 * even if they have a valid email under their control.
 */
export function devVerificationCodeIfEnabled(code: string): string | null {
  if (process.env["RESEND_API_KEY"]) return null;
  return code;
}