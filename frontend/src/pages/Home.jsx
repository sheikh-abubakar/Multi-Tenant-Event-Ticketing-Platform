import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";

const Home = () => {
  const [events, setEvents] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterDate, setFilterDate] = useState("all");

  useEffect(() => {
    let cancelled = false;

  const load = async () => {
    setLoading(true);
    try {
      // Fetch all public events (across all orgs) — no auth required
      const eventsRes = await apiClient.get("/events");
      const eventsData = eventsRes.data;

      // Fetch all orgs for filter dropdown
      const orgsRes = await apiClient.get("/organizations/public");
      const orgsData = orgsRes.data;

      if (!cancelled) {
        setEvents(eventsData.events || []);
        setOrgs(orgsData.organizations || []);
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter events
  const filteredEvents = events.filter((event) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        event.name.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query) ||
        event.venueId?.name?.toLowerCase().includes(query) ||
        event.venueId?.city?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Organization filter
    if (filterOrg !== "all" && event.organizationId !== filterOrg) {
      return false;
    }

    // Date filter
    if (filterDate !== "all") {
      const eventDate = new Date(event.dateTime);
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (filterDate === "this_week" && eventDate > weekFromNow) return false;
      if (filterDate === "this_month" && eventDate > monthFromNow) return false;
      if (filterDate === "past" && eventDate > now) return false;
    }

    return true;
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>
      {/* Hero Section */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h1
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "var(--paper)",
            margin: "0 0 16px",
            fontFamily: "var(--font-display)",
          }}
        >
          Discover Amazing Events
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", maxWidth: 600, margin: "0 auto" }}>
          Browse and book tickets to the best events happening around you.
          No account required — just pick an event and go!
        </p>
      </div>

      {/* Search & Filters */}
      <div
        style={{
          background: "var(--card)",
          padding: 20,
          borderRadius: 12,
          marginBottom: 32,
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <input
            type="text"
            placeholder="🔍 Search events, venues, cities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "12px 16px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 14,
              background: "var(--paper)",
              color: "var(--text)",
            }}
          />
          <select
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
            style={{
              padding: "12px 16px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 14,
              background: "var(--paper)",
              color: "var(--text)",
            }}
          >
            <option value="all">All Organizations</option>
            {orgs.map((org) => (
              <option key={org._id} value={org._id}>
                {org.name}
              </option>
            ))}
          </select>
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{
              padding: "12px 16px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 14,
              background: "var(--paper)",
              color: "var(--text)",
            }}
          >
            <option value="all">All Dates</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="past">Past Events</option>
          </select>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>
          Loading events...
        </p>
      ) : filteredEvents.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No events found</p>
          <p style={{ fontSize: 14 }}>Try adjusting your search or filters</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {filteredEvents.map((event) => {
            const eventDate = new Date(event.dateTime);
            const isPast = eventDate < new Date();
            const remainingTickets = event.ticketTypes?.reduce(
              (sum, tt) => sum + (tt.quantityTotal - tt.quantityBooked),
              0,
            );

            return (
              <Link
                key={event._id}
                to={`/o/${event.organizationSlug}/events/${event._id}`}
                style={{
                  display: "block",
                  background: "var(--card)",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  textDecoration: "none",
                  color: "var(--text)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {/* Event Banner */}
                {event.bannerImageUrl && (
                  <div
                    style={{
                      width: "100%",
                      height: 180,
                      backgroundImage: `url(${event.bannerImageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}

                {/* Event Info */}
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 600,
                        color: "var(--paper)",
                        flex: 1,
                      }}
                    >
                      {event.name}
                    </h3>
                    {isPast && (
                      <span
                        className="badge"
                        style={{
                          background: "#fce8e6",
                          color: "#c01e1e",
                          marginLeft: 8,
                        }}
                      >
                        Past
                      </span>
                    )}
                  </div>

                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--muted)",
                      margin: "0 0 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    📍 {event.venueId?.name || "TBA"}
                    {event.venueId?.city && `, ${event.venueId.city}`}
                  </p>

                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--muted)",
                      margin: "0 0 16px",
                    }}
                  >
                    📅 {eventDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>

                  {/* Ticket Info */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 12,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      {event.ticketTypes?.[0] && (
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--gold)" }}>
                          From Rs. {event.ticketTypes[0].price}
                        </p>
                      )}
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                        {remainingTickets > 0
                          ? `${remainingTickets} tickets left`
                          : "Sold out"}
                      </p>
                    </div>
                    <span
                      style={{
                        background: "var(--gold)",
                        color: "var(--paper)",
                        padding: "6px 16px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      View Details →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Home;