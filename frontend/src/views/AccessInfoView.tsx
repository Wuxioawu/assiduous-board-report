import { Link } from "react-router-dom";

export function AccessInfoView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-8 shadow-card">
        <h1 className="mb-1 text-xl font-bold text-navy">Getting Access</h1>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          This platform is invitation-only. You can't sign up to join an existing organization's
          workspace directly — an owner or admin on that team has to send you an invite from their
          Team Settings page.
        </p>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          If you're expecting access, reach out to whoever manages your organization's account and
          ask them to invite your email address. If you're looking to set up a brand-new organization
          instead, you can register one yourself.
        </p>
        <div className="flex flex-col items-center gap-3 text-sm">
          <Link to="/register" className="font-medium text-coral transition-colors hover:underline">
            Register a new organization
          </Link>
          <Link to="/login" className="text-muted transition-colors hover:underline">
            Back to Log In
          </Link>
        </div>
      </div>
    </div>
  );
}
