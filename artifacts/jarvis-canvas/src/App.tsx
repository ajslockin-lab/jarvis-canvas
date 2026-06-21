import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LandingPage from "@/pages/LandingPage";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import OnboardingCanvasPage from "@/pages/OnboardingCanvasPage";
import DashboardPage from "@/pages/DashboardPage";
import SettingsPage from "@/pages/SettingsPage";
import ExtensionPage from "@/pages/ExtensionPage";
import ExtensionIframePage from "@/pages/ExtensionIframePage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/signin" component={SignInPage} />
      <Route path="/signup" component={SignUpPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/onboarding/canvas" component={OnboardingCanvasPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/extension" component={ExtensionPage} />
      <Route path="/extension/iframe" component={ExtensionIframePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
