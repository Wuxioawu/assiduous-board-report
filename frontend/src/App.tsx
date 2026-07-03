import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { BoardView } from "@/views/BoardView";
import { CompanyListView } from "@/views/CompanyListView";
import { CreditView } from "@/views/CreditView";
import { EquityView } from "@/views/EquityView";
import { LoginView } from "@/views/LoginView";
import { ManagementView } from "@/views/ManagementView";
import { RegisterView } from "@/views/RegisterView";

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
          path="/companies/:companyId/management"
          element={
            <ProtectedRoute>
              <ManagementView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:companyId/board"
          element={
            <ProtectedRoute>
              <BoardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:companyId/equity"
          element={
            <ProtectedRoute>
              <EquityView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:companyId/credit"
          element={
            <ProtectedRoute>
              <CreditView />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/companies" replace />} />
      </Routes>
    </AuthProvider>
  );
}
