import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/auth-layout';
import { SignupForm, useCurrentUser } from '@/features/auth';

interface LocationState {
  from?: string;
}

/**
 * Sign-up is a first-class entry point: an invited participant with no account
 * has to be able to create one and land back on their join link.
 */
export function SignupPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useCurrentUser();

  const from = (location.state as LocationState | null)?.from;

  if (!isLoading && isAuthenticated) {
    return <Navigate to={from ?? '/dashboard'} replace />;
  }

  return (
    <AuthLayout
      backTo={{ to: '/', label: 'Back to home' }}
      title="Let's get you set up"
      description="Takes about a minute. Then you can host meetings or join ones you're invited to."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            state={from ? { from } : undefined}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm onSuccess={() => navigate(from ?? '/dashboard', { replace: true })} />
    </AuthLayout>
  );
}
