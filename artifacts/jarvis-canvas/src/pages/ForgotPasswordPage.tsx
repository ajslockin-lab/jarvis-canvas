// ForgotPasswordPage — stub.
//
// Password reset isn't built yet (out of scope for the email/password
// signup plan). For now we just point the user at support.
//
// When implementing this later:
//   - Add `POST /auth/request-reset { email }` (no auth, rate-limited)
//   - Add `POST /auth/perform-reset { userId, code, newPassword }`
//   - Use the same email_verifications table (or a sibling) for the codes
//   - On success, invalidate all existing sessions for that user so a
//     stolen session can't outlive the password change

import { Link } from "wouter";
import { MailQuestion, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans flex items-center justify-center px-6 py-12">
      <div className="hud-scanline" />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/carvis-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
        </div>

        <div className="hud-panel p-8">
          <span className="corner-br" />

          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full border border-[#FF4444]/40 bg-[#FF4444]/10 flex items-center justify-center">
              <MailQuestion className="w-5 h-5 text-[#FF4444]" />
            </div>
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">FORGOT PASSWORD</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              Self-serve password reset is on the way. For now, email us and we'll get you back in.
            </p>
          </div>

          <a
            href="mailto:support@carvis.app?subject=Password%20reset"
            className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2"
          >
            <span>EMAIL SUPPORT</span>
          </a>

          <div className="mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)] text-center">
            <Link href="/signin" className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
