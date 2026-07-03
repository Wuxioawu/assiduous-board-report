import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { createCompany, listCompanies } from "@/api/companies";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { Company } from "@/types/company";

export function CompanyListView() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCompanies()
      .then(setCompanies)
      .catch(() => setError("Failed to load company list"))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const company = await createCompany({ name: newCompanyName });
      setCompanies((prev) => [...prev, company]);
      setNewCompanyName("");
      setIsFormOpen(false);
    } catch {
      setError("Failed to create company");
    }
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Companies</h1>
        <Button onClick={() => setIsFormOpen((v) => !v)}>Add Company</Button>
      </div>

      {isFormOpen && (
        <Card className="mb-6">
          <form onSubmit={handleCreate} className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Company Name"
                name="companyName"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="e.g. Senus PLC"
                required
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </Card>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : companies.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No companies added yet. Click "Add Company" in the top right to get started.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Card key={company.id} title={company.name}>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                {company.industry ?? "Industry not set"} · {company.currency}
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link
                  to={`/companies/${company.id}/documents`}
                  className="text-blue-600 hover:underline"
                >
                  Documents
                </Link>
                <Link
                  to={`/companies/${company.id}/management`}
                  className="text-blue-600 hover:underline"
                >
                  Management
                </Link>
                <Link to={`/companies/${company.id}/board`} className="text-blue-600 hover:underline">
                  Board
                </Link>
                <Link to={`/companies/${company.id}/equity`} className="text-blue-600 hover:underline">
                  Equity
                </Link>
                <Link to={`/companies/${company.id}/credit`} className="text-blue-600 hover:underline">
                  Credit
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
