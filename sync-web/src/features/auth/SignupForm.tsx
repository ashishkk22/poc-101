import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { MIN_PASSWORD_LENGTH } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import { PasswordField, PasswordStrength } from "./PasswordField";
import { useSignUp } from "./queries";

/**
 * Mirrors the backend's rules for immediate feedback — the 12-character
 * minimum is Better Auth's, and the server re-checks everything here.
 */
const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Your name is required")
      .max(100, "That name is too long"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Use at least ${MIN_PASSWORD_LENGTH} characters`,
      )
      .max(128, "That password is too long"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine(value => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupValues = z.infer<typeof signupSchema>;

type SignupFormProps = {
  onSuccess: () => void;
};

export function SignupForm({ onSuccess }: SignupFormProps) {
  const signUp = useSignUp();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");
  const pending = signUp.isPending || isSubmitting;
  const serverError = signUp.error ? toErrorMessage(signUp.error) : null;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async values => {
        await signUp
          .mutateAsync({
            name: values.name.trim(),
            email: values.email.trim(),
            password: values.password,
          })
          .then(onSuccess)
          .catch(() => undefined);
      })}
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          autoComplete="name"
          placeholder="Alex Rivera"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={
            errors.email ? "signup-email-error" : "signup-email-hint"
          }
          {...register("email")}
        />
        {errors.email ? (
          <p id="signup-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : (
          <p id="signup-email-hint" className="text-xs text-muted-foreground">
            People will invite you using this address, so use the one they know.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <PasswordField
          id="signup-password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password ? "signup-password-error" : undefined
          }
          {...register("password")}
        />
        {errors.password ? (
          <p id="signup-password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : null}
        <PasswordStrength value={password ?? ""} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <PasswordField
          id="confirm-password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={
            errors.confirmPassword ? "confirm-password-error" : undefined
          }
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p id="confirm-password-error" className="text-sm text-destructive">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
