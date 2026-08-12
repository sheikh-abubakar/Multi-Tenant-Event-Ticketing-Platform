import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import OrgCard from "../components/OrgCard";
import "./BrowseHub.css";
import { cachedGet, prefetch } from "../api/requestCache";

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Capture referral code from URL — shared links land here (/browse?ref=REF-XXXXXX)
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) sessionStorage.setItem("referralCode", refCode);
  }, [searchParams]);

  // ─── "Your organizations" state (only relevant when logged in) ──────
  const [myOrgs, setMyOrgs] = useState([]);
  const [myOrgsLoading, setMyOrgsLoading] = useState(true);
  const [slugInput, setSlugInput] = useState("");

  // ─── "Browse events" state (relevant for everyone, no login needed) ─
  const [events, setEvents] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterDate, setFilterDate] = useState("all");

  useEffect(() => {
    if (!user) {
      setMyOrgsLoading(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get("/organizations/mine")
      .then(({ data }) => {
        if (!cancelled) setMyOrgs(data.organizations);
      })
      .finally(() => {
        if (!cancelled) setMyOrgsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setEventsLoading(true);
      try {
        const [eventsRes, bundlesRes, orgsRes] = await Promise.all([
          cachedGet("/events", 30_000),
          apiClient.get("/bundles").catch(() => ({ data: { bundles: [] } })),
          cachedGet("/organizations/public", 60_000),
        ]);
        if (!cancelled) {
          setEvents(eventsRes.data.events || []);
          setBundles(bundlesRes.data.bundles || []);
          setOrgs(orgsRes.data.organizations || []);
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const goToOrgBySlug = (e) => {
    e.preventDefault();
    if (slugInput.trim()) navigate(`/o/${slugInput.trim()}/dashboard`);
  };

  const filteredEvents = events.filter((event) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        event.name.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query) ||
        event.venueId?.name?.toLowerCase().includes(query) ||
        event.venueId?.city?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    if (filterOrg !== "all") {
      const eventOrgId = event.organizationId?._id?.toString() || event.organizationId?.toString();
      if (eventOrgId !== filterOrg) return false;
    }

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

  const filteredBundles = bundles.filter((bundle) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        bundle.name.toLowerCase().includes(query) ||
        bundle.description?.toLowerCase().includes(query) ||
        bundle.venueId?.name?.toLowerCase().includes(query) ||
        bundle.venueId?.city?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    if (filterOrg !== "all") {
      const bundleOrgId = bundle.organizationId?._id?.toString() || bundle.organizationId?.toString();
      if (bundleOrgId !== filterOrg) return false;
    }

    // Bundles are multi-event packages, so we don't apply the date filter (they match "all")
    if (filterDate !== "all") return false;

    return true;
  });

  return (
    <div className="browse-hub" style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="browse-hub__masthead" style={{ textAlign: "center", marginBottom: 48 }}>
        <p className="browse-hub__eyebrow">STAGEPASS MEMBER HUB</p>
        <h1
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "var(--paper)",
            margin: "0 0 16px",
            fontFamily: "var(--font-display)",
          }}
        >
          {user ? "Find your next unforgettable night" : "Discover Amazing Events"}
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", maxWidth: 600, margin: "0 auto" }}>
          {user
            ? "Curated events and signature experiences, ready when you are."
            : "Browse and book tickets to the best events happening around you. No account required — just pick an event and go!"}
        </p>
        {!user && (
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
            <Link to="/signup" className="btn btn-primary">
              Sign up
            </Link>
            <Link
              to="/login"
              className="btn btn-ghost"
              style={{ color: "var(--paper)", borderColor: "rgba(247,242,231,0.35)" }}
            >
              Log in
            </Link>
          </div>
        )}
      </div>

      {/* ── "Your organizations" — only when logged in ─────────────── */}
      {user && myOrgs.length < 0 && (
        <div className="browse-hub__org-section" style={{ marginBottom: 48 }}>
          <div className="browse-hub__section-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ color: "var(--paper)", fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
              Your organizations
            </h2>
            <Link to="/create-organization" className="btn btn-primary">
              + New organization
            </Link>
          </div>

          {myOrgsLoading && <p style={{ color: "var(--muted)" }}>Loading…</p>}

          {!myOrgsLoading && myOrgs.length === 0 && (
            <div className="card" style={{ marginBottom: 8 }}>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                You're not part of any organization yet. Create one to start selling tickets, or
                just browse events below as a buyer.
              </p>
            </div>
          )}

          {!myOrgsLoading && myOrgs.length > 0 && (
            <div className="browse-hub__org-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 18,
              }}
            >
              {myOrgs.map(({ organization, role }) => (
                <OrgCard key={organization.id} organization={organization} role={role} />
              ))}
            </div>
          )}

          <details className="browse-hub__slug-panel" style={{ marginTop: 12 }}>
            <summary style={{ color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
              Have a slug for an organization not showing above?
            </summary>
            <form onSubmit={goToOrgBySlug} style={{ marginTop: 10, display: "flex", gap: 8, maxWidth: 400 }}>
              <input
                placeholder="e.g. coke-studio-events"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--ink-soft)",
                  color: "var(--paper)",
                }}
              />
              <button
                className="btn btn-ghost"
                type="submit"
                style={{ color: "var(--paper)", borderColor: "rgba(247,242,231,0.35)" }}
              >
                Go
              </button>
            </form>
          </details>

          <hr className="tear-line" style={{ marginTop: 40 }} />
        </div>
      )}

      {/* ── Browse events — everyone sees this, no login required ──── */}
      <h2 className="browse-hub__events-title" style={{ color: "var(--paper)", fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 16 }}>
        Browse events
      </h2>

      <div className="browse-hub__filters"
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
            placeholder="Search events, venues, cities..."
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

      {eventsLoading ? (
        <p style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Loading events...</p>
      ) : (filteredEvents.length === 0 && filteredBundles.length === 0) ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No events or bundles found</p>
          <p style={{ fontSize: 14 }}>Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="browse-hub__event-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {/* Render Bundles first */}
          {filteredBundles.map((bundle) => {
            const orgSlug = bundle.organizationId?.slug;
            return (
              <Link
                key={bundle._id}
                to={`/o/${orgSlug}/bundles/${bundle._id}`}
                className="browse-hub__event-card browse-hub__event-card--bundle"
                style={{
                  display: "block",
                  background: "rgba(28, 31, 61, 0.45)",
                  backdropFilter: "blur(12px)",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(201, 154, 60, 0.25)",
                  textDecoration: "none",
                  color: "var(--text)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 30px rgba(201, 154, 60, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ position: "relative" }}>
                  {bundle.bannerImageUrl ? (
                    <div
                      style={{
                        width: "100%",
                        height: 180,
                        backgroundImage: `url(${bundle.bannerImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                      }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: 180, background: "linear-gradient(135deg, #14162b 0%, #202447 100%)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
                  )}
                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      background: "linear-gradient(135deg, #c99a3c 0%, #e5b95f 100%)",
                      color: "#14162b",
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    🎉 Event Bundle
                  </span>
                </div>

                <div style={{ padding: 20 }}>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: 18,
                      fontWeight: 600,
                      color: "var(--paper)",
                    }}
                  >
                    {bundle.name}
                  </h3>

                  <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
                    📍 {bundle.venueId?.name || "TBA"}
                    {bundle.venueId?.city && `, ${bundle.venueId.city}`}
                  </p>

                  <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
                    📦 Includes {bundle.eventIds?.length || 0} events
                  </p>

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
                       <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--gold)" }}>
                         ${bundle.pricePerSeat} / bundle
                       </p>
                       <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                         Flat rate &times; qty selected
                       </p>
                     </div>
                    <span
                      style={{
                        background: "#c99a3c",
                        color: "#14162b",
                        padding: "6px 16px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      View Bundle &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
          {filteredEvents.map((event) => {
            const eventDate = new Date(event.dateTime);
            const isPast = eventDate < new Date();
            const remainingTickets = event.remainingTickets !== undefined ? event.remainingTickets : 0;

            return (
              <Link
                key={event._id}
                to={`/o/${event.organizationSlug}/events/${event._id}`}
                onFocus={() => prefetch(`/o/${event.organizationSlug}/events/${event._id}`, 30_000)}
                className="browse-hub__event-card"
                style={{
                  display: "block",
                  background: "rgba(28, 31, 61, 0.45)",
                  backdropFilter: "blur(12px)",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(247, 242, 231, 0.08)",
                  textDecoration: "none",
                  color: "var(--text)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";
                  prefetch(`/o/${event.organizationSlug}/events/${event._id}`, 30_000);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {event.bannerImageUrl && (
                  <div
                    style={{
                      width: "100%",
                      height: 180,
                      backgroundImage: `url(${event.bannerImageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      borderTopLeftRadius: 20,
                      borderTopRightRadius: 20,
                    }}
                  />
                )}

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
                      <span className="badge" style={{ background: "#fce8e6", color: "#c01e1e", marginLeft: 8 }}>
                        Past
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
                    {event.venueId?.name || "TBA"}
                    {event.venueId?.city && `, ${event.venueId.city}`}
                  </p>

                  <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
                    {eventDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>

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
                          From $ {event.ticketTypes[0].price}
                        </p>
                      )}
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: remainingTickets > 0 ? "#4ade80" : "var(--muted)" }}>
                        {remainingTickets > 0 ? `✔️ ${remainingTickets} ${event.purchaseMode === "seatmap" ? "seats" : "tickets"} left` : "Sold out"}
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
                      View Details &rarr;
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
