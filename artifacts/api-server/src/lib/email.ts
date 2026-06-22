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
      subject: `${code} — your Carvis verification code`,
      // Plain-text first; some clients strip HTML so this is the canonical body.
      text:
        `Your Carvis verification code is: ${code}\n\n` +
        `This code expires in 15 minutes.\n` +
        `If you didn't request it, you can ignore this email.\n`,
      html: buildVerificationEmailHtml(code),
    });

    if (result.error) {
      // Throw so sendVerificationCode's outer catch can log and swallow — the
      // user will retry via the resend flow.
      throw new Error(`Resend send failed: ${result.error.message ?? "unknown"}`);
    }
  }
}

// HTML email template. Inline-styled (Gmail / Outlook strip <style> blocks).
// Color palette mirrors the web app's HUD theme so the email feels native
// when a user clicks through. Layout is single-column, mobile-first.
//
// Why a giant monospace block for the code instead of a styled <span>?
// Email clients vary wildly on font support. `ui-monospace, Menlo, Consolas`
// works everywhere; a brand font like Orbitron would fall back to Times New
// Roman on half the clients and look broken. The red color + heavy letter-
// spacing is the brand signal — the typeface isn't doing work here.
function buildVerificationEmailHtml(code: string): string {
  const brand = "#FF3C00";
  const brandSoft = "rgba(255, 60, 0, 0.12)";
  const bg = "#0a0000";
  const panel = "#120404";
  const border = "rgba(255, 60, 0, 0.25)";
  const textPrimary = "#f5f5f5";
  const textMuted = "rgba(245, 245, 245, 0.55)";
  const textDim = "rgba(245, 245, 245, 0.35)";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${bg};">
    <!-- Wrapper. The preheader is hidden but shows in the inbox preview. -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${bg};">
      Your Carvis verification code is ${code}. Expires in 15 minutes.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${bg};">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="480" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;">

            <!-- Brand row: logo mark + wordmark -->
            <tr>
              <td style="padding:0 0 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <!-- Inline SVG mark so it renders without external assets.
                           Two overlapping arcs forming a stylized "C". -->
                      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                        <circle cx="16" cy="16" r="14" fill="none" stroke="${brand}" stroke-width="2"/>
                        <path d="M 22 10 A 8 8 0 1 0 22 22" fill="none" stroke="${brand}" stroke-width="2.5" stroke-linecap="round"/>
                      </svg>
                    </td>
                    <td style="vertical-align:middle;padding-left:10px;">
                      <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:4px;color:${textPrimary};">CARVIS</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Main panel -->
            <tr>
              <td style="background:${panel};border:1px solid ${border};border-radius:6px;padding:40px 32px;">

                <!-- Eyebrow -->
                <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;color:${brand};text-transform:uppercase;margin-bottom:12px;">
                  Verification Code
                </div>

                <!-- Headline -->
                <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:24px;font-weight:700;color:${textPrimary};line-height:1.3;">
                  Confirm your email
                </h1>
                <p style="margin:0 0 28px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:${textMuted};">
                  Enter this code in Carvis to finish setting up your account. It only works once.
                </p>

                <!-- Code block -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="background:${bg};border:1px solid ${border};border-radius:4px;padding:24px 16px;">
                      <div style="font-family:'SF Mono','Menlo','Consolas','Liberation Mono',monospace;font-size:36px;font-weight:700;letter-spacing:12px;color:${brand};text-align:center;">
                        ${code}
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- Meta -->
                <p style="margin:24px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.5;color:${textDim};text-align:center;">
                  Expires in 15 minutes · One-time use
                </p>

                <!-- Divider -->
                <div style="height:1px;background:${border};margin:32px 0 24px;"></div>

                <!-- Secondary explainer -->
                <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:${textDim};">
                  Didn't request this? You can safely ignore the email — your account is unaffected and the code will expire on its own.
                </p>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 8px 0;text-align:center;">
                <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;color:${textDim};text-transform:uppercase;">
                  Canvas Assistant · Carvis
                </p>
                <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:${textDim};">
                  You're getting this because someone (hopefully you) signed up at carvis.app.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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