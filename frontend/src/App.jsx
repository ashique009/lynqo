import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";

// Layouts & Route Guards
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";

// Pages
import Landing from "./pages/Landing";
import ProfileRecovery from "./pages/ProfileRecovery";
import HomeDashboard from "./pages/HomeDashboard";
import FindProfile from "./pages/FindProfile";
import ConnectRequests from "./pages/ConnectRequests";
import ConnectedProfiles from "./pages/ConnectedProfiles";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import ContactUs from "./pages/ContactUs";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Router>
            <Routes>
              {/* Public Routes (Guests only; redirects logged-in sessions to /dashboard) */}
              <Route
                path="/"
                element={
                  <PublicRoute>
                    <Landing />
                  </PublicRoute>
                }
              />
              <Route
                path="/recover"
                element={
                  <PublicRoute>
                    <ProfileRecovery />
                  </PublicRoute>
                }
              />

              {/* Public Static & Legal Pages */}
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/contact-us" element={<ContactUs />} />

              {/* Protected App Routes (Requires authenticated profile session) */}
              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<HomeDashboard />} />
                <Route path="/find" element={<FindProfile />} />
                <Route path="/connect/:profileId" element={<FindProfile />} />
                <Route path="/requests" element={<ConnectRequests />} />
                <Route path="/connections" element={<ConnectedProfiles />} />
                <Route path="/conversations" element={<Navigate to="/dashboard" replace />} />
                <Route path="/chat/:conversationId" element={<Chat />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Fallback 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
