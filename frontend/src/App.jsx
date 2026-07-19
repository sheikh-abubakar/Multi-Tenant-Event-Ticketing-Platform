import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import CreateOrganization from "./pages/CreateOrganization";
import Dashboard from "./pages/Dashboard";
import Venues from "./pages/Venues";
import Events from "./pages/Events";
import PublicEvents from "./pages/PublicEvents";
import EventDetail from "./pages/EventDetail";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import BookingConfirmation from "./pages/BookingConfirmation";
import OrgSettings from "./pages/OrgSettings";
import TeamManagement from "./pages/TeamManagement";
import AcceptInvite from "./pages/AcceptInvite";
import Analytics from "./pages/Analytics";

function App() {
  return (
    <Layout>
      <Routes>
        {/* Public buyer dashboard — shows all events across all orgs */}
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
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
        {/* Public invite acceptance (no auth) */}
        <Route path="/o/:orgSlug/accept-invite" element={<AcceptInvite />} />
        {/* Cart & Checkout */}
        <Route path="/o/:orgSlug/cart/:eventId" element={<CartPage />} />
        <Route path="/o/:orgSlug/checkout/:eventId" element={<CheckoutPage />} />
        {/* Booking confirmation */}
        <Route path="/o/:orgSlug/bookings/:bookingId/confirmation" element={<BookingConfirmation />} />
      </Routes>
    </Layout>
  );
}

export default App;