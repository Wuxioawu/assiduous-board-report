import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";

export function RegisterView() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({ organization_name: organizationName, full_name: fullName, email, password });
      navigate("/companies");
    } catch {
      setError("Registration failed, please check your information or try a different email");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-8 shadow-card">
        <h1 className="mb-1 text-xl font-bold text-navy">Register</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">Create your organization account</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Organization Name"
            name="organizationName"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
          />
          <Input
            label="Full Name"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            name="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "Registering…" : "Register"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-coral transition-colors hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
