import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function ChangePasswordView() {
  const navigate = useNavigate();
  const [justUpdated, setJustUpdated] = useState(false);

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold text-navy">Change Password</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Update the password for your account.
      </p>

      <Card>
        <ChangePasswordForm onSuccess={() => setJustUpdated(true)} />
        {justUpdated && (
          <Button variant="secondary" onClick={() => navigate("/companies")} className="mt-4 w-full">
            Back to Account
          </Button>
        )}
      </Card>
    </AppShell>
  );
}
