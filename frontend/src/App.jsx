import { useEffect, useState, Suspense, lazy } from "react";
import { Navigate, Routes, Route, useSearchParams } from "react-router-dom";
import LoadingScreen from "./components/LoadingScreen";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

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
const BookingLookup = lazy(() => import("./pages/BookingLookup"));
const OrgSettings = lazy(() => import("./pages/OrgSettings"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const Analytics = lazy(() => import("./pages/Analytics"));
const BuyerDashboard = lazy(() => import("./pages/BuyerDashboard"));
const BuyerOverview = lazy(() => import("./pages/BuyerOverview"));
const MyWallet = lazy(() => import("./pages/MyWallet"));
const MyReferrals = lazy(() => import("./pages/MyReferrals"));
const MyNotifications = lazy(() => import("./pages/MyNotifications"));
const VenueSeatMapBuilder = lazy(() => import("./pages/VenueSeatMapBuilder"));
const EventSeatMapBuilder = lazy(() => import("./pages/EventSeatMapBuilder"));
const SeatSelection = lazy(() => import("./pages/SeatSelection"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const PlatformAdminOverview = lazy(() => import("./pages/PlatformAdminOverview"));
const PlatformOrganizations = lazy(() => import("./pages/PlatformOrganizations"));
const PlatformOrganizationDetail = lazy(() => import("./pages/PlatformOrganizationDetail"));
const PlatformActivity = lazy(() => import("./pages/PlatformActivity"));
const PlatformAIAssistant = lazy(() => import("./pages/PlatformAIAssistant"));

// Event Bundling components
const Bundles = lazy(() => import("./pages/Bundles"));
const CreateBundle = lazy(() => import("./pages/CreateBundle"));
const BundleDetail = lazy(() => import("./pages/BundleDetail"));
const BundleSeatSelection = lazy(() => import("./pages/BundleSeatSelection"));
const BundleCheckoutPage = lazy(() => import("./pages/BundleCheckoutPage"));
const EditBundle = lazy(() => import("./pages/EditBundle"));

// Seat Change components
const SeatChangeRequestPage = lazy(() => import("./pages/SeatChangeRequestPage"));
const SeatChangeRequests = lazy(() => import("./pages/Admin/SeatChangeRequests"));

// Media Gallery
const MediaGalleryPage = lazy(() => import("./pages/Admin/MediaGalleryPage"));

// Coupons Management
const Coupons = lazy(() => import("./pages/Coupons"));

function App() {
  const { user, token } = useAuth();
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
        <Route
          path="/"
          element={
            token && user
              ? <Navigate to={user.platformRole === "super_admin" ? "/platform-admin" : user.requiresPasswordSetup ? "/set-password" : "/browse"} replace />
              : <LandingPage />
          }
        />
        <Route path="/browse" element={<Home />} />
        <Route path="/cart" element={<CartPage />} />
        
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
          <Route path="notifications" element={<MyNotifications platform />} />
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
          path="/o/:orgSlug/manage/coupons"
          element={
            <ProtectedRoute>
              <Coupons />
            </ProtectedRoute>
          }
        />
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
        <Route
          path="/o/:orgSlug/manage/bundles"
          element={
            <ProtectedRoute>
              <Bundles />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/bundles/new"
          element={
            <ProtectedRoute>
              <CreateBundle />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/bundles/:bundleId/edit"
          element={
            <ProtectedRoute>
              <EditBundle />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/seat-changes"
          element={
            <ProtectedRoute>
              <SeatChangeRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/booking-lookup"
          element={
            <ProtectedRoute>
              <BookingLookup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/manage/media"
          element={
            <ProtectedRoute>
              <MediaGalleryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/o/:orgSlug/bookings/:bookingId/change-seat/:seatId"
          element={
            <ProtectedRoute>
              <SeatChangeRequestPage />
            </ProtectedRoute>
          }
        />
        {/* Public buyer-facing routes */}
        <Route path="/o/:orgSlug/events" element={<PublicEvents />} />
        <Route path="/o/:orgSlug/events/:eventId" element={<EventDetail />} />
        <Route path="/o/:orgSlug/events/:eventId/seats" element={<SeatSelection />} />
        <Route path="/o/:orgSlug/bundles/:bundleId" element={<BundleDetail />} />
        <Route path="/o/:orgSlug/bundles/:bundleId/seats" element={<BundleSeatSelection />} />
        <Route path="/o/:orgSlug/checkout/bundle" element={<BundleCheckoutPage />} />
        
        {/* Public invite acceptance (no auth) */}
        <Route path="/o/:orgSlug/accept-invite" element={<AcceptInvite />} />
        
        {/* Cart & Checkout */}
        <Route path="/o/:orgSlug/cart" element={<Navigate to="/cart" replace />} />
        
        {/* Booking confirmation */}
        <Route path="/o/:orgSlug/bookings/:bookingId/confirmation" element={<BookingConfirmation />} />
        
        {/* Buyer Dashboard — wallet + my bookings + refund */}
        <Route
          path="/my/dashboard"
          element={
            <ProtectedRoute>
              <BuyerOverview />
            </ProtectedRoute>
          }
        />
        <Route path="/my/wallet" element={<ProtectedRoute><MyWallet /></ProtectedRoute>} />
        <Route path="/my/referrals" element={<ProtectedRoute><MyReferrals /></ProtectedRoute>} />
        <Route path="/my/notifications" element={<ProtectedRoute><MyNotifications /></ProtectedRoute>} />
        <Route path="/my/bookings" element={<ProtectedRoute><BuyerDashboard bookingsOnly /></ProtectedRoute>} />
      </Routes>
      </Suspense>
    </Layout>
  );
}

export default App;
