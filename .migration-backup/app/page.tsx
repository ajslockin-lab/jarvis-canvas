import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import LandingPage from "./landing/page";

export default async function Home() {
  const session = await getServerSession(authOptions);

  // If already signed in, go to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  // Not signed in — show landing page with CTA to /signin
  return <LandingPage />;
}
