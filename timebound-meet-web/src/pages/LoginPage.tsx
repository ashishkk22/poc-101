import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { DemoCredentials } from "@/components/common/DemoCredentials";
import { LoginForm, useCurrentUser } from "@/features/auth";

interface LocationState {
  from?: string;
  /** Set when a guard sent them here, rather than them choosing to sign in. */
  expired?: boolean;
}

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useCurrentUser();
  const [prefillEmail, setPrefillEmail] = useState("");

  // Preserved by the route guard, so a join link survives an expired session.
  const state = location.state as LocationState | null;
  const from = state?.from;

  if (!isLoading && isAuthenticated) {
    return <Navigate to={from ?? "/dashboard"} replace />;
  }

  return (
    <AuthLayout
      backTo={{ to: "/", label: "Back to home" }}
      title="Welcome back"
      description="Sign in and we'll show you what's coming up."
      footer={
        <>
          First time here?{" "}
          <Link
            to="/signup"
            state={from ? { from } : undefined}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {state?.expired ? (
          <Alert variant="warning">
            <Clock aria-hidden="true" />
            <AlertDescription>
              You were signed out after a while away. Sign back in and we'll
              take you straight there.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Remounts the form so the picked address lands in the field. */}
        <LoginForm
          key={prefillEmail}
          defaultEmail={prefillEmail}
          onSuccess={() => navigate(from ?? "/dashboard", { replace: true })}
        />
        <DemoCredentials onPick={setPrefillEmail} />
      </div>
    </AuthLayout>
  );
}
