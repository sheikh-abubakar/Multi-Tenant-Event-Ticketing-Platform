import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Compass, MapPin, Calendar, ArrowRight, Star, Heart, TrendingUp, Zap } from "lucide-react";
import apiClient from "../api/client";
import "./BuyerHub.css";

const Recommendations = () => {
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchRecommendations = async () => {
    try {
      const response = await apiClient.get("/recommendations");
      setRecommendations(response.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="buyer-hub__container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div style={{ color: "var(--gold)", fontSize: 18, display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles className="animate-spin" size={24} style={{ color: "var(--gold)" }} />
          <span>Curating your personalized recommendations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="buyer-hub__container">
        <div className="card" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: 24, borderRadius: 12 }}>
          <p style={{ color: "#ef4444", margin: 0 }}>⚠️ {error}</p>
        </div>
      </div>
    );
  }

  const {
    type,
    favoriteVenues,
    userCity,
    affinityEvents = [],
    nearbyEvents = [],
    localEvents = [],
    globalEvents = []
  } = recommendations || {};

  const isPersonalized = type === "personalized";

  const hasAffinity = affinityEvents.length > 0;
  const hasNearby = nearbyEvents.length > 0;
  const hasLocal = localEvents.length > 0;
  const hasGlobal = globalEvents.length > 0;
  const totalEventsCount = affinityEvents.length + nearbyEvents.length + localEvents.length + globalEvents.length;

  const renderEventGrid = (eventsList, sectionType) => {
    if (!eventsList || eventsList.length === 0) return null;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24, marginBottom: 48 }}>
        {eventsList.map((event) => {
          const orgSlug = event.organizationId?.slug || event.organizationSlug;
          const price = event.startingPrice ?? 0;
          const remaining = event.remainingTickets ?? 0;

          // Dynamically compute card badge text based on proximity section and affinity scores
          let badgeText = "Popular";
          if (event.score > 20 && isPersonalized) {
            badgeText = "Affinity Pick";
          } else if (sectionType === "nearby") {
            badgeText = "Nearby";
          } else if (sectionType === "local") {
            badgeText = "Local Pick";
          }

          return (
            <Link
              key={event._id}
              to={`/o/${orgSlug}/events/${event._id}`}
              className="browse-hub__event-card"
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(28, 31, 61, 0.45)",
                backdropFilter: "blur(12px)",
                borderRadius: 24,
                overflow: "hidden",
                border: "1px solid rgba(247, 242, 231, 0.08)",
                textDecoration: "none",
                color: "var(--text)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                height: "100%",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
                e.currentTarget.style.borderColor = "rgba(201, 154, 60, 0.3)";
                e.currentTarget.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(247, 242, 231, 0.08)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {/* Banner wrapper */}
              <div style={{ position: "relative", width: "100%", height: 180, overflow: "hidden" }}>
                {event.bannerImageUrl ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundImage: `url(${event.bannerImageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      transition: "transform 0.5s ease"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1.0)"}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #14162b 0%, #202447 100%)" }} />
                )}

                {/* Badge affinity tag */}
                <span
                  style={{
                    position: "absolute",
                    top: 16,
                    left: 16,
                    background: "rgba(20, 22, 43, 0.8)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(247, 242, 231, 0.15)",
                    color: "var(--paper)",
                    padding: "6px 12px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                >
                  <Heart size={10} style={{ color: "var(--gold)" }} />
                  <span>{badgeText}</span>
                </span>
              </div>

              {/* Content body */}
              <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "var(--paper)", lineHeight: "1.4" }}>
                  {event.name}
                </h3>

                {/* Location metadata (color set to highly readable rgba value) */}
                <p style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.65)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={14} style={{ color: "var(--gold)" }} />
                  <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <span>{event.venueId?.name || "TBA"}{event.venueId?.city && `, ${event.venueId.city}`}</span>
                    {event.distanceKM !== null && (
                      <span style={{ fontSize: 11, background: "rgba(201, 154, 60, 0.15)", color: "var(--gold)", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>
                        {event.distanceKM} km away
                      </span>
                    )}
                  </span>
                </p>

                {/* Date metadata */}
                <p style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.65)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={14} style={{ color: "var(--gold)" }} />
                  <span>{formatDate(event.dateTime)}</span>
                </p>

                {/* Footer card row */}
                <div 
                  style={{ 
                    marginTop: "auto", 
                    paddingTop: 16, 
                    borderTop: "1px solid rgba(247, 242, 231, 0.08)",
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center" 
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--gold)" }}>
                      From ${price}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: remaining > 0 ? "#4ade80" : "#6b6f8a" }}>
                      {remaining > 0 ? `${remaining} seats available` : "Sold out"}
                    </p>
                  </div>

                  <span 
                    style={{ 
                      background: "rgba(201, 154, 60, 0.1)", 
                      border: "1px solid rgba(201, 154, 60, 0.2)",
                      color: "var(--gold)", 
                      padding: "8px 16px", 
                      borderRadius: 12, 
                      fontSize: 12, 
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--gold)";
                      e.currentTarget.style.color = "var(--paper)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(201, 154, 60, 0.1)";
                      e.currentTarget.style.color = "var(--gold)";
                    }}
                  >
                    <span>Get Tickets</span>
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div className="buyer-hub__container" style={{ paddingBottom: 60 }}>
      {/* Premium Floating Header Card */}
      <div 
        className="card" 
        style={{
          background: "linear-gradient(135deg, rgba(28, 31, 61, 0.65) 0%, rgba(20, 22, 43, 0.85) 100%)",
          border: "1px solid rgba(201, 154, 60, 0.2)",
          padding: "32px 24px",
          borderRadius: 24,
          marginBottom: 32,
          position: "relative",
          overflow: "hidden"
        }}
      >
        {/* Glow effect */}
        <div 
          style={{
            position: "absolute",
            top: "-20%",
            right: "-10%",
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, rgba(201, 154, 60, 0.15) 0%, rgba(0,0,0,0) 70%)",
            pointerEvents: "none"
          }}
        />

        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div 
            style={{ 
              background: "rgba(201, 154, 60, 0.1)", 
              padding: 16, 
              borderRadius: 20, 
              border: "1px solid rgba(201, 154, 60, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {isPersonalized ? (
              <Sparkles size={36} style={{ color: "var(--gold)" }} />
            ) : (
              <Compass size={36} style={{ color: "var(--gold)" }} />
            )}
          </div>

          <div style={{ flex: 1 }}>
            <span 
              style={{ 
                fontSize: 12, 
                fontWeight: 800, 
                color: "var(--gold)", 
                textTransform: "uppercase", 
                letterSpacing: "1.5px",
                display: "block",
                marginBottom: 6
              }}
            >
              {isPersonalized ? "Tailored Just For You" : "Discover New Experiences"}
            </span>
            <h1 style={{ fontSize: 28, margin: "0 0 10px", color: "var(--paper)", fontFamily: "var(--font-display)" }}>
              {isPersonalized ? "Personalized Recommendations" : "Trending on StagePass"}
            </h1>
            <p style={{ margin: 0, color: "rgba(247, 242, 231, 0.65)", fontSize: 15, lineHeight: "1.6" }}>
              {isPersonalized ? (
                <>
                  We analyzed your location, city preferences, and booking history to bring you events 
                  specifically curated for your lifestyle.
                </>
              ) : (
                <>
                  You haven't configured a hometown location or booked events yet. 
                  Check out these popular, high-demand events trending across the StagePass platform!
                </>
              )}
            </p>
          </div>
        </div>

        {/* Favorite Venues affinity tags */}
        {isPersonalized && favoriteVenues && favoriteVenues.length > 0 && (
          <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 20, borderTop: "1px solid rgba(247, 242, 231, 0.08)" }}>
            <span style={{ color: "rgba(247, 242, 231, 0.65)", fontSize: 13, alignSelf: "center", marginRight: 8 }}>Your Top Venues:</span>
            {favoriteVenues.slice(0, 3).map((item, idx) => (
              <span 
                key={idx} 
                style={{ 
                  background: "rgba(247, 242, 231, 0.04)", 
                  border: "1px solid rgba(247, 242, 231, 0.08)",
                  padding: "6px 12px", 
                  borderRadius: 10, 
                  color: "var(--paper)",
                  fontSize: 13,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                <Star size={12} style={{ color: "var(--gold)" }} />
                <span>{item.count} Bookings</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {totalEventsCount === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <Compass size={48} style={{ color: "var(--muted)", margin: "0 auto 16px", opacity: 0.6 }} />
          <h3 style={{ color: "var(--paper)", margin: "0 0 8px" }}>No Recommended Events Found</h3>
          <p style={{ color: "rgba(247, 242, 231, 0.65)", margin: 0 }}>There are currently no upcoming events matching your location or preferences. Check back later!</p>
        </div>
      ) : (
        <>
          {/* Section 0: You May Love to Book (Venue Affinity) */}
          {hasAffinity && (
            <>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
                padding: "14px 20px",
                background: "linear-gradient(135deg, rgba(201,154,60,0.12) 0%, rgba(201,154,60,0.04) 100%)",
                borderRadius: 16,
                border: "1px solid rgba(201,154,60,0.2)",
              }}>
                <Heart size={20} style={{ color: "#e8a020" }} />
                <div>
                  <h2 style={{ color: "var(--paper)", fontSize: 20, fontFamily: "var(--font-display)", margin: 0 }}>
                    You May Love to Book
                  </h2>
                  <p style={{ color: "rgba(247,242,231,0.55)", fontSize: 13, margin: "4px 0 0" }}>
                    New events at venues you've visited before
                  </p>
                </div>
              </div>
              {renderEventGrid(affinityEvents, "affinity")}
            </>
          )}

          {/* Section 1: Events Near You */}
          {hasNearby && (
            <>
              <h2 style={{ color: "var(--paper)", fontSize: 20, fontFamily: "var(--font-display)", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={20} style={{ color: "var(--gold)" }} />
                <span>Events Near You</span>
              </h2>
              {renderEventGrid(nearbyEvents, "nearby")}
            </>
          )}

          {/* Section 2: Local City Events */}
          {hasLocal && (
            <>
              <h2 style={{ color: "var(--paper)", fontSize: 20, fontFamily: "var(--font-display)", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={20} style={{ color: "var(--gold)" }} />
                <span>Trending in {userCity}</span>
              </h2>
              {renderEventGrid(localEvents, "local")}
            </>
          )}

          {/* Section 3: Global / Other Cities Events */}
          {hasGlobal && (
            <>
              <h2 style={{ color: "var(--paper)", fontSize: 20, fontFamily: "var(--font-display)", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <Compass size={20} style={{ color: "var(--gold)" }} />
                <span>Popular Across StagePass</span>
              </h2>
              {renderEventGrid(globalEvents, "global")}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Recommendations;
