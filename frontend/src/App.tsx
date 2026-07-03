import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { CompanyListView } from "@/views/CompanyListView";
import { CompanyUploadView } from "@/views/CompanyUploadView";
import { LoginView } from "@/views/LoginView";
import { RegisterView } from "@/views/RegisterView";
import { ReportView } from "@/views/ReportView";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
        <Route
          path="/companies"
          element={
            <ProtectedRoute>
              <CompanyListView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:companyId/documents"
          element={
            <ProtectedRoute>
              <CompanyUploadView />
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
        <Route path="*" element={<Navigate to="/companies" replace />} />
      </Routes>
    </AuthProvider>
  );
}
