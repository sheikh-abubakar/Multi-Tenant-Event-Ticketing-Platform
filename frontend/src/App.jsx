import { useEffect, useState, Suspense, lazy } from "react";
import { Routes, Route, useSearchParams } from "react-router-dom";
import LoadingScreen from "./components/LoadingScreen";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

// ── Eagerly loaded (tiny, always needed) ───────────────────────────────────
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import PlatformAdminRoute from "./components/PlatformAdminRoute";
import PlatformAdminLayout from "./components/PlatformAdminLayout";
import PlatformAdminLogin from "./pages/PlatformAdminLogin";

// ── Lazy loaded (heavy pages — only fetched when first visited) ────────────
const Home = lazy(() => import("./pages/Home"));
const CreateOrganization = lazy(() => import("./pages/CreateOrganization"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Venues = lazy(() => import("./pages/Venues"));
const Events = lazy(() => import("./pages/Events"));
const PublicEvents = lazy(() => import("./pages/PublicEvents"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const CartPage = lazy(() => import("./pages/CartPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const BookingConfirmation = lazy(() => import("./pages/BookingConfirmation"));
const OrgSettings = lazy(() => import("./pages/OrgSettings"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const Analytics = lazy(() => import("./pages/Analytics"));
const BuyerDashboard = lazy(() => import("./pages/BuyerDashboard"));
const VenueSeatMapBuilder = lazy(() => import("./pages/VenueSeatMapBuilder"));
const EventSeatMapBuilder = lazy(() => import("./pages/EventSeatMapBuilder"));
const SeatSelection = lazy(() => import("./pages/SeatSelection"));
const GlobalCart = lazy(() => import("./pages/GlobalCart"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const PlatformAdminOverview = lazy(() => import("./pages/PlatformAdminOverview"));
const PlatformOrganizations = lazy(() => import("./pages/PlatformOrganizations"));
const PlatformOrganizationDetail = lazy(() => import("./pages/PlatformOrganizationDetail"));
const PlatformActivity = lazy(() => import("./pages/PlatformActivity"));
const PlatformAIAssistant = lazy(() => import("./pages/PlatformAIAssistant"));

function App() {
  const [searchParams] = useSearchParams();
  const [appReady, setAppReady] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Show splash for 1.5s, then fade out over 400ms
    const fadeTimer = setTimeout(() => setFadeOut(true), 1500);
    const readyTimer = setTimeout(() => setAppReady(true), 1900);
    return () => { clearTimeout(fadeTimer); clearTimeout(readyTimer); };
  }, []);

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      sessionStorage.setItem("referralCode", refCode);
      console.log("Globally captured referralCode in sessionStorage:", refCode);
    }
  }, [searchParams]);

  if (!appReady) {
    return (
      <div
        style={{
          opacity: fadeOut ? 0 : 1,
          transition: "opacity 0.4s ease-in-out",
          pointerEvents: "none",
        }}
      >
        <LoadingScreen />
      </div>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<p style={{ color: "#aeb0c4", padding: "40px", textAlign: "center" }}>Loading…</p>}>
      <Routes>
        {/* Public buyer dashboard — shows all events across all orgs */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/browse" element={<Home />} />
        <Route path="/cart" element={<ProtectedRoute><GlobalCart /></ProtectedRoute>} />
        
        {/* Auth routes */}
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<ProtectedRoute><SetPassword /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />

        <Route path="/platform-admin/login" element={<PlatformAdminLogin />} />
        <Route path="/platform-admin" element={<PlatformAdminRoute><PlatformAdminLayout /></PlatformAdminRoute>}>
          <Route index element={<PlatformAdminOverview />} />
          <Route path="organizations" element={<PlatformOrganizations />} />
          <Route path="organizations/:organizationId" element={<PlatformOrganizationDetail />} />
          <Route path="activity" element={<PlatformActivity />} />
          <Route path="assistant" element={<PlatformAIAssistant />} />
        </Route>

        <Route
          path="/create-organization"
          element={
            <ProtectedRoute>
              <CreateOrganization />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/venues"
          element={
            <ProtectedRoute>
              <Venues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/events"
          element={
            <ProtectedRoute>
              <Events />
            </ProtectedRoute>
          }
        />
        <Route path="/o/:orgSlug/manage/venues/:venueId/seatmaps/:seatmapId?" element={<ProtectedRoute><VenueSeatMapBuilder /></ProtectedRoute>} />
        <Route path="/o/:orgSlug/manage/events/:eventId/seatmap" element={<ProtectedRoute><EventSeatMapBuilder /></ProtectedRoute>} />
        <Route
          path="/o/:orgSlug/manage/settings"
          element={
            <ProtectedRoute>
              <OrgSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/team"
          element={
            <ProtectedRoute>
              <TeamManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        {/* Public buyer-facing routes */}
        <Route path="/o/:orgSlug/events" element={<PublicEvents />} />
        <Route path="/o/:orgSlug/events/:eventId" element={<EventDetail />} />
        <Route path="/o/:orgSlug/events/:eventId/seats" element={<SeatSelection />} />
        
        {/* Public invite acceptance (no auth) */}
        <Route path="/o/:orgSlug/accept-invite" element={<AcceptInvite />} />
        
        {/* Cart & Checkout */}
        <Route path="/o/:orgSlug/cart/:eventId" element={<CartPage />} />
        <Route path="/o/:orgSlug/checkout/:eventId" element={<CheckoutPage />} />
        
        {/* Booking confirmation */}
        <Route path="/o/:orgSlug/bookings/:bookingId/confirmation" element={<BookingConfirmation />} />
        
        {/* Buyer Dashboard — wallet + my bookings + refund */}
        <Route
          path="/my/dashboard"
          element={
            <ProtectedRoute>
              <BuyerDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
    </Layout>
  );
}

export default App;
