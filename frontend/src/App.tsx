import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ToastProvider } from "@/toast/ToastContext";
import { AcceptInvitationView } from "@/views/AcceptInvitationView";
import { BenchmarkCreateView } from "@/views/BenchmarkCreateView";
import { BenchmarkEditView } from "@/views/BenchmarkEditView";
import { BenchmarkSettingsView } from "@/views/BenchmarkSettingsView";
import { BudgetCreateView } from "@/views/BudgetCreateView";
import { BudgetEditView } from "@/views/BudgetEditView";
import { BudgetSettingsView } from "@/views/BudgetSettingsView";
import { ChangePasswordView } from "@/views/ChangePasswordView";
import { CompanyDetailView } from "@/views/CompanyDetailView";
import { CompanyDocumentsHubView } from "@/views/CompanyDocumentsHubView";
import { CompanyFinancialDataView } from "@/views/CompanyFinancialDataView";
import { CompanyIngestionView } from "@/views/CompanyIngestionView";
import { CompanyListView } from "@/views/CompanyListView";
import { CreateCompanyView } from "@/views/CreateCompanyView";
import { DocumentDetailView } from "@/views/DocumentDetailView";
import { ForgotPasswordView } from "@/views/ForgotPasswordView";
import { LoginView } from "@/views/LoginView";
import { RegisterView } from "@/views/RegisterView";
import { ReportView } from "@/views/ReportView";
import { ResetPasswordView } from "@/views/ResetPasswordView";
import { TeamSettingsView } from "@/views/TeamSettingsView";
import { TwoFactorSetupView } from "@/views/TwoFactorSetupView";

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/register" element={<RegisterView />} />
          <Route path="/forgot-password" element={<ForgotPasswordView />} />
          <Route path="/reset-password" element={<ResetPasswordView />} />
          <Route path="/accept-invitation" element={<AcceptInvitationView />} />
          <Route
            path="/team"
            element={
              <ProtectedRoute>
                <TeamSettingsView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies"
            element={
              <ProtectedRoute>
                <CompanyListView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/new"
            element={
              <ProtectedRoute>
                <CreateCompanyView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId"
            element={
              <ProtectedRoute>
                <CompanyDetailView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/documents"
            element={
              <ProtectedRoute>
                <CompanyDocumentsHubView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/documents/ingestion"
            element={
              <ProtectedRoute>
                <CompanyIngestionView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/documents/financial-data"
            element={
              <ProtectedRoute>
                <CompanyFinancialDataView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/documents/:documentId"
            element={
              <ProtectedRoute>
                <DocumentDetailView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/report"
            element={
              <ProtectedRoute>
                <ReportView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/budget"
            element={
              <ProtectedRoute>
                <BudgetSettingsView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/budget/new"
            element={
              <ProtectedRoute>
                <BudgetCreateView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/budget/:period/edit"
            element={
              <ProtectedRoute>
                <BudgetEditView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/benchmarks"
            element={
              <ProtectedRoute>
                <BenchmarkSettingsView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/benchmarks/new"
            element={
              <ProtectedRoute>
                <BenchmarkCreateView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:companyId/benchmarks/:id/edit"
            element={
              <ProtectedRoute>
                <BenchmarkEditView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/two-factor"
            element={
              <ProtectedRoute>
                <TwoFactorSetupView />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/companies" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
