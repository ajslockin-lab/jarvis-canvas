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
import MobileAppPage from "@/pages/MobileAppPage";
import MacbookPage from "@/pages/MacbookPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ChatPage from "@/pages/ChatPage";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import RequireAuth from "@/components/auth/RequireAuth";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/signin" component={SignInPage} />
      <Route path="/signup" component={SignUpPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/onboarding/canvas">
        <RequireAuth>
          <OnboardingCanvasPage />
       </RequireAuth>
     </Route>
      <Route path="/dashboard">
        <RequireAuth>
          <DashboardPage />
       </RequireAuth>
     </Route>
      <Route path="/settings">
        <RequireAuth>
          <SettingsPage />
       </RequireAuth>
     </Route>
      <Route path="/chat">
        <RequireAuth>
          <ChatPage />
       </RequireAuth>
     </Route>
      <Route path="/extension">
        <RequireAuth>
          <ExtensionPage />
       </RequireAuth>
     </Route>
      <Route path="/extension/iframe">
        <RequireAuth>
          <ExtensionIframePage />
       </RequireAuth>
  </Route>
      <Route path="/mobile" component={MobileAppPage} />
      <Route path="/macos" component={MacbookPage} />
      <Route component={NotFound} />
</Switch>
  );
}

function App() {
  return (
    // ErrorBoundary wraps Router (not QueryClient) so a thrown render
    // anywhere in the page tree gets caught and the global providers
    // stay mounted. Important: keep the boundary between providers
    // and the page tree at this level.
   <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
   </WouterRouter>
  </QueryClientProvider>
 </ErrorBoundary>
  );
}

export default App;
