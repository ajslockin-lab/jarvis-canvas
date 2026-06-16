"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Sparkles } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_client: "Canvas doesn't recognize this app. Your school admin needs to register JARVIS in Canvas first.",
  access_denied: "You denied access to JARVIS. Try again if you want to connect.",
  token_exchange_failed: "Couldn't get your Canvas token. Try again.",
  oauth_state_mismatch: "Security check failed. Try again.",
  canvas_auth_failed: "Canvas connection failed. Check your Canvas URL and try again.",
};

/**
 * After Canvas OAuth, the callback redirects here with the user's email.
 * This page auto-creates a NextAuth session and redirects to dashboard.
 */
export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [signinError, setSigninError] = useState<string | null>(null);

  const oauthError = useMemo(() => {
    const err = searchParams.get("error");
    if (!err) return null;
    return ERROR_MESSAGES[err] || decodeURIComponent(err);
  }, [searchParams]);

  const email = searchParams.get("email");

  useEffect(() => {
    if (oauthError || !email) return;

    signIn("canvas", { email, redirect: false })
      .then((result) => {
        if (result?.error) {
          setSigninError("Sign-in failed — please try again.");
        } else {
          router.push("/dashboard");
        }
      })
      .catch(() => {
        setSigninError("Sign-in failed — please try again.");
      });
  }, [oauthError, email, router]);

  const displayError = oauthError || signinError || (!email ? "Missing email — please try connecting Canvas again." : null);

  return (
    <div className="hud-bg min-h-screen text-[#e8f4f8] font-sans flex items-center justify-center px-6">
      <div className="hud-scanline" />
      <div className="relative z-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            JARVIS
          </span>
        </div>

        {displayError ? (
          <div className="hud-panel p-6 max-w-sm mx-auto">
            <p className="font-rajdhani text-sm text-[#FF9500] mb-4">{displayError}</p>
            <a
              href="/signin"
              className="hud-btn-primary hud-btn inline-flex px-5 py-2.5"
            >
              TRY AGAIN
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-[#00E5FF] animate-spin" />
            <p className="font-orbitron text-sm tracking-[0.15em] text-[#00E5FF]">
              AUTHENTICATING...
            </p>
            <p className="font-rajdhani text-[12px] text-[#5a7a8a]">
              Setting up your session
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
