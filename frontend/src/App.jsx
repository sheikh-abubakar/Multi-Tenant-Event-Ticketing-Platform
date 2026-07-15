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

function App() {
  return (
    <Layout>
      <Routes>
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
          path="/o/:orgSlug/venues"
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
        <Route path="/o/:orgSlug/events" element={<PublicEvents />} />
        <Route path="/o/:orgSlug/events/:eventId" element={<EventDetail />} />
      </Routes>
    </Layout>
  );
}

export default App;
