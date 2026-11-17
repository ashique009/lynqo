import React, { Suspense, lazy } from "react";
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
import Loader from "./components/Loader";

// Lazy-loaded Pages for Route-Level Code Splitting
const Landing = lazy(() => import("./pages/Landing"));
const ProfileRecovery = lazy(() => import("./pages/ProfileRecovery"));
const HomeDashboard = lazy(() => import("./pages/HomeDashboard"));
const FindProfile = lazy(() => import("./pages/FindProfile"));
const ConnectRequests = lazy(() => import("./pages/ConnectRequests"));
const ConnectedProfiles = lazy(() => import("./pages/ConnectedProfiles"));
const Chat = lazy(() => import("./pages/Chat"));
const Settings = lazy(() => import("./pages/Settings"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <Loader />
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Router>
            <Suspense fallback={<PageFallback />}>
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
            </Suspense>
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
