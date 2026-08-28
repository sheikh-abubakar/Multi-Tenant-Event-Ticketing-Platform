import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Calendar, MapPin, Building, ChevronLeft, ChevronRight, Sparkles, Compass, Heart, X, Star } from "lucide-react";
import apiClient from "../api/client";
import "./BrowseHub.css";
import { cachedGet, prefetch } from "../api/requestCache";
import { useAuth } from "../context/AuthContext";

const Home = () => {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();

  // Capture referral code from URL — shared links land here (/browse?ref=REF-XXXXXX)
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) sessionStorage.setItem("referralCode", refCode);
  }, [searchParams]);

  // Browse events state
  const [events, setEvents] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all"); // YouTube-style tag pills
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Hero Carousel State
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideInterval = useRef(null);

  const trackCategoryInteraction = (catId) => {
    if (token && catId) {
      apiClient.post(`/categories/${catId}/interact`).catch((err) => {
        console.error("Silent category interaction log failed:", err.message);
      });
    }
  };

  const load = async () => {
    setEventsLoading(true);
    try {
      const [eventsRes, bundlesRes, orgsRes, categoriesRes] = await Promise.all([
        cachedGet("/events", 15_000),
        apiClient.get("/bundles").catch(() => ({ data: { bundles: [] } })),
        cachedGet("/organizations/public", 30_000),
        apiClient.get("/categories").catch(() => ({ data: { categories: [] } })),
      ]);
      setEvents(eventsRes.data.events || []);
      setBundles(bundlesRes.data.bundles || []);
      setOrgs(orgsRes.data.organizations || []);
      setCategories(categoriesRes.data.categories || []);
    } catch (err) {
      console.error("Failed to load events page data:", err);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 5 closest upcoming events for the Carousel (globally sorted by date ascending)
  const carouselEvents = [...events]
    .filter(e => new Date(e.dateTime) >= new Date())
    .slice(0, 5);

  // Auto-play timer for Hero Carousel
  useEffect(() => {
    if (carouselEvents.length > 0) {
      startSlideShow();
    }
    return () => stopSlideShow();
  }, [carouselEvents.length]);

  const startSlideShow = () => {
    stopSlideShow();
    slideInterval.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselEvents.length);
    }, 5000);
  };

  const stopSlideShow = () => {
    if (slideInterval.current) {
      clearInterval(slideInterval.current);
    }
  };

  const handleNextSlide = () => {
    stopSlideShow();
    setCurrentSlide((prev) => (prev + 1) % carouselEvents.length);
    startSlideShow();
  };

  const handlePrevSlide = () => {
    stopSlideShow();
    setCurrentSlide((prev) => (prev - 1 + carouselEvents.length) % carouselEvents.length);
    startSlideShow();
  };

  // Get unique list of cities from loaded events to populate filter dropdown
  const uniqueCities = [...new Set(
    events
      .map((e) => e.venueId?.city?.trim())
      .filter(Boolean)
  )].sort();

  // Filter Events list dynamically
  const filteredEvents = events.filter((event) => {
    // 1. Search keyword (matches Name, Description, Venue name, City)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        event.name.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query) ||
        event.venueId?.name?.toLowerCase().includes(query) ||
        event.venueId?.city?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // 2. Organization Filter
    if (filterOrg !== "all") {
      const eventOrgId = event.organizationId?._id?.toString() || event.organizationId?.toString();
      if (eventOrgId !== filterOrg) return false;
    }

    // 3. City Filter
    if (filterCity !== "all") {
      const eventCity = event.venueId?.city?.toLowerCase()?.trim() || "";
      if (eventCity !== filterCity.toLowerCase().trim()) return false;
    }

    // 4. Category Filter (Matches either drop-down select or pill selection)
    const selectedCategorySlug = activeCategory !== "all" ? activeCategory : filterCategory;
    if (selectedCategorySlug !== "all") {
      const eventCategories = event.categories || [];
      const hasMatch = eventCategories.some(
        (cat) => cat.slug === selectedCategorySlug || cat._id?.toString() === selectedCategorySlug
      );
      if (!hasMatch) return false;
    }

    // 5. Date range picker (Starts from startDate 00:00, Ends at endDate 23:59)
    const eventTime = new Date(event.dateTime).getTime();
    if (startDate) {
      const startMs = new Date(startDate).setHours(0, 0, 0, 0);
      if (eventTime < startMs) return false;
    }
    if (endDate) {
      const endMs = new Date(endDate).setHours(23, 59, 59, 999);
      if (eventTime > endMs) return false;
    }

    return true;
  });

  // Filter Bundles dynamically
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

    if (filterCity !== "all") {
      const bundleCity = bundle.venueId?.city?.toLowerCase()?.trim() || "";
      if (bundleCity !== filterCity.toLowerCase().trim()) return false;
    }

    // Bundles are multi-event date-independent, so date and category filtering are skipped
    return true;
  });

  const getPriceRange = (ticketTypes = []) => {
    if (!ticketTypes.length) return null;
    const prices = ticketTypes.map((t) => Number(t.price || 0));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `$${min}` : `$${min} – $${max}`;
  };

  const getTotalRemaining = (ticketTypes = []) =>
    ticketTypes.reduce(
      (sum, t) => sum + Math.max(0, Number(t.quantityTotal || 0) - Number(t.quantityBooked || 0)),
      0
    );

  const formatDateString = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setFilterOrg("all");
    setFilterCity("all");
    setFilterCategory("all");
    setActiveCategory("all");
    setStartDate("");
    setEndDate("");
  };

  const isFilterActive = searchQuery || filterOrg !== "all" || filterCity !== "all" || filterCategory !== "all" || activeCategory !== "all" || startDate || endDate;

  return (
    <div className="browse-hub" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 60px" }}>

      {/* ── 1. Hero Event Carousel Slider ── */}
      {carouselEvents.length > 0 && (
        <div 
          className="carousel-container"
          style={{
            position: "relative",
            width: "100%",
            height: 380,
            borderRadius: 24,
            overflow: "hidden",
            marginBottom: 40,
            border: "1px solid rgba(247, 242, 231, 0.08)",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)"
          }}
          onMouseEnter={stopSlideShow}
          onMouseLeave={startSlideShow}
        >
          {carouselEvents.map((event, idx) => {
            const isActive = idx === currentSlide;
            const orgSlug = event.organizationSlug || event.organizationId?.slug;
            return (
              <div
                key={event._id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  opacity: isActive ? 1 : 0,
                  transition: "opacity 0.8s ease-in-out",
                  zIndex: isActive ? 1 : 0,
                  pointerEvents: isActive ? "auto" : "none"
                }}
              >
                {/* Background image with overlay */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundImage: `url(${event.bannerImageUrl || "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=80"})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div 
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(17, 19, 38, 0.95) 15%, rgba(17, 19, 38, 0.4) 60%, rgba(17, 19, 38, 0.1) 100%)"
                  }}
                />

                {/* Banner Content overlay */}
                <div 
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: "40px 32px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ background: "rgba(201, 154, 60, 0.2)", border: "1px solid rgba(201, 154, 60, 0.4)", color: "var(--gold)", padding: "4px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={12} />
                      {new Date(event.dateTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span style={{ background: "rgba(247, 242, 231, 0.08)", border: "1px solid rgba(247, 242, 231, 0.15)", color: "var(--paper)", padding: "4px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <MapPin size={12} style={{ color: "var(--gold)" }} />
                      {event.venueId?.name || "TBA"} {event.venueId?.city && `· ${event.venueId.city}`}
                    </span>
                    {event.categories?.map((cat) => (
                      <span key={cat._id} style={{ background: "rgba(247, 242, 231, 0.04)", border: "1px solid rgba(247, 242, 231, 0.08)", color: "rgba(247, 242, 231, 0.8)", padding: "4px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                        {cat.name}
                      </span>
                    ))}
                  </div>

                  <h2 style={{ fontSize: 36, margin: 0, color: "var(--paper)", fontWeight: 700, fontFamily: "var(--font-display)", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
                    {event.name}
                  </h2>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <p style={{ color: "rgba(247, 242, 231, 0.65)", margin: 0, maxWidth: "60%", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.5 }}>
                      {event.description || "No description provided."}
                    </p>
                    <Link
                      to={`/o/${orgSlug}/events/${event._id}`}
                      className="btn btn-primary"
                      style={{ padding: "12px 28px", borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span>Book Tickets Now</span>
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Navigation Controls */}
          <button 
            onClick={handlePrevSlide}
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(20, 22, 43, 0.6)", backdropFilter: "blur(6px)", border: "1px solid rgba(247, 242, 231, 0.1)", color: "var(--paper)", width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
            aria-label="Previous slide"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={handleNextSlide}
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(20, 22, 43, 0.6)", backdropFilter: "blur(6px)", border: "1px solid rgba(247, 242, 231, 0.1)", color: "var(--paper)", width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
            aria-label="Next slide"
          >
            <ChevronRight size={20} />
          </button>

          {/* Dots Indicator */}
          <div style={{ position: "absolute", bottom: 20, right: 32, display: "flex", gap: 8, zIndex: 10 }}>
            {carouselEvents.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  stopSlideShow();
                  setCurrentSlide(idx);
                  startSlideShow();
                }}
                style={{ width: 8, height: 8, borderRadius: "50%", padding: 0, border: "none", background: idx === currentSlide ? "var(--gold)" : "rgba(247, 242, 231, 0.3)", cursor: "pointer", transition: "background 0.3s" }}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <h2 className="browse-hub__events-title" style={{ color: "var(--paper)", fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <Compass size={24} style={{ color: "var(--gold)" }} />
        <span>Browse Events</span>
      </h2>

      {/* ── 2. Glassmorphic Filter Control Panel ── */}
      <div 
        className="browse-hub__filters"
        style={{
          background: "rgba(28, 31, 61, 0.45)",
          backdropFilter: "blur(12px)",
          padding: 24,
          borderRadius: 20,
          marginBottom: 20,
          border: "1px solid rgba(247, 242, 231, 0.08)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)"
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          
          {/* City filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Select City</span>
            <div style={{ position: "relative" }}>
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                style={{ width: "100%", padding: "12px 16px 12px 38px", border: "1px solid rgba(247, 242, 231, 0.15)", borderRadius: 10, fontSize: 13, background: "rgba(20, 22, 43, 0.8)", color: "var(--paper)" }}
              >
                <option value="all">All Cities</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              <MapPin size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gold)" }} />
            </div>
          </div>

          {/* Category Dropdown Filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Select Category</span>
            <div style={{ position: "relative" }}>
              <select
                value={filterCategory}
                onChange={(e) => {
                  const slug = e.target.value;
                  setFilterCategory(slug);
                  setActiveCategory(slug); // Sync horizontal pills
                  if (slug !== "all") {
                    const matched = categories.find(c => c.slug === slug);
                    if (matched) trackCategoryInteraction(matched._id);
                  }
                }}
                style={{ width: "100%", padding: "12px 16px 12px 38px", border: "1px solid rgba(247, 242, 231, 0.15)", borderRadius: 10, fontSize: 13, background: "rgba(20, 22, 43, 0.8)", color: "var(--paper)" }}
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
              <Sparkles size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gold)" }} />
            </div>
          </div>

          {/* Date range pickers */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Start Date</span>
            <div style={{ position: "relative" }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: "100%", padding: "11px 16px 11px 38px", border: "1px solid rgba(247, 242, 231, 0.15)", borderRadius: 10, fontSize: 13, background: "rgba(20, 22, 43, 0.8)", color: "var(--paper)" }}
              />
              <Calendar size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gold)" }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>End Date</span>
            <div style={{ position: "relative" }}>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: "100%", padding: "11px 16px 11px 38px", border: "1px solid rgba(247, 242, 231, 0.15)", borderRadius: 10, fontSize: 13, background: "rgba(20, 22, 43, 0.8)", color: "var(--paper)" }}
              />
              <Calendar size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gold)" }} />
            </div>
          </div>

          {/* Organization filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Organization</span>
            <div style={{ position: "relative" }}>
              <select
                value={filterOrg}
                onChange={(e) => setFilterOrg(e.target.value)}
                style={{ width: "100%", padding: "12px 16px 12px 38px", border: "1px solid rgba(247, 242, 231, 0.15)", borderRadius: 10, fontSize: 13, background: "rgba(20, 22, 43, 0.8)", color: "var(--paper)" }}
              >
                <option value="all">All Organizations</option>
                {orgs.map((org) => (
                  <option key={org._id} value={org._id}>{org.name}</option>
                ))}
              </select>
              <Building size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gold)" }} />
            </div>
          </div>

          {/* Search bar with glassmorphism style & right-aligned search icon */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Search Keyword</span>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Events, venues, cities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 42px 12px 16px",
                  border: "1px solid rgba(247, 242, 231, 0.15)",
                  borderRadius: 10,
                  fontSize: 13,
                  background: "rgba(20, 22, 43, 0.8)",
                  color: "var(--paper)",
                }}
              />
              <Search size={14} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--gold)" }} />
            </div>
          </div>

        </div>
      </div>

      {/* ── 3. Horizontal Scrollable Pill Bar (YouTube-style) ── */}
      {categories.length > 0 && (
        <div 
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
            position: "relative"
          }}
        >
          <div 
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 6,
              flex: 1,
              scrollbarWidth: "none", // Hide standard scrollbar Firefox
              msOverflowStyle: "none" // Hide standard scrollbar IE
            }}
            className="hide-scrollbar"
          >
            {/* Styles for scrollbar-hiding in WebKit are defined in index.css */}
            <button
              onClick={() => {
                setActiveCategory("all");
                setFilterCategory("all");
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                border: "1px solid rgba(247, 242, 231, 0.1)",
                background: activeCategory === "all" ? "var(--gold)" : "rgba(28, 31, 61, 0.35)",
                color: activeCategory === "all" ? "#14162b" : "var(--paper)",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              All
            </button>
            {categories.map((cat) => {
              const isSelected = activeCategory === cat.slug;
              return (
                <button
                  key={cat._id}
                  onClick={() => {
                    setActiveCategory(cat.slug);
                    setFilterCategory(cat.slug);
                    trackCategoryInteraction(cat._id);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    border: "1px solid rgba(247, 242, 231, 0.1)",
                    background: isSelected ? "var(--gold)" : "rgba(28, 31, 61, 0.35)",
                    color: isSelected ? "#14162b" : "var(--paper)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap"
                  }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Clean Clear Filter option */}
          {isFilterActive && (
            <button
              onClick={clearAllFilters}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap"
              }}
            >
              <X size={12} />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      )}

      {/* Events Results Grid */}
      {eventsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <div style={{ color: "var(--gold)", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 10 }}>
            <Sparkles className="animate-spin" size={20} />
            <span>Curating events feed...</span>
          </div>
        </div>
      ) : (filteredEvents.length === 0 && filteredBundles.length === 0) ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <Compass size={40} style={{ color: "var(--muted)", margin: "0 auto 16px", opacity: 0.5 }} />
          <h3 style={{ color: "var(--paper)", margin: "0 0 8px" }}>No Events or Packages Found</h3>
          <p style={{ color: "rgba(247, 242, 231, 0.65)", margin: 0, fontSize: 14 }}>Try adjusting your search criteria or clear the filters above.</p>
        </div>
      ) : (
        <div 
          className="browse-hub__event-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 24,
          }}
        >
          {/* Render Bundles first */}
          {filteredBundles.map((bundle) => {
            const orgSlug = bundle.organizationId?.slug || bundle.organizationSlug;
            return (
              <Link
                key={bundle._id}
                to={`/o/${orgSlug}/bundles/${bundle._id}`}
                className="browse-hub__event-card browse-hub__event-card--bundle"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "rgba(28, 31, 61, 0.45)",
                  backdropFilter: "blur(12px)",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(201, 154, 60, 0.25)",
                  textDecoration: "none",
                  color: "var(--text)",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  height: "100%",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-6px)";
                  e.currentTarget.style.borderColor = "rgba(201, 154, 60, 0.5)";
                  e.currentTarget.style.boxShadow = "0 20px 40px rgba(201, 154, 60, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "rgba(201, 154, 60, 0.25)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ position: "relative", width: "100%", height: 180, overflow: "hidden" }}>
                  {bundle.bannerImageUrl ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundImage: `url(${bundle.bannerImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #14162b 0%, #202447 100%)" }} />
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

                <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "var(--paper)" }}>
                    {bundle.name}
                  </h3>

                  <p style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.65)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <MapPin size={14} style={{ color: "var(--gold)" }} />
                    <span>{bundle.venueId?.name || "TBA"}{bundle.venueId?.city && `, ${bundle.venueId.city}`}</span>
                  </p>

                  <p style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.65)", margin: "0 0 16px", flex: 1 }}>
                    📦 Includes {bundle.eventIds?.length || 0} events package
                  </p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 12,
                      borderTop: "1px solid rgba(247, 242, 231, 0.08)",
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--gold)" }}>
                        ${bundle.pricePerSeat} / seat
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(247, 242, 231, 0.5)" }}>
                        Package rate
                      </p>
                    </div>
                    <span
                      style={{
                        background: "rgba(201, 154, 60, 0.1)",
                        border: "1px solid rgba(201, 154, 60, 0.3)",
                        color: "var(--gold)",
                        padding: "6px 16px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      View Package &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Render Individual Events */}
          {filteredEvents.map((event) => {
            const eventDate = new Date(event.dateTime);
            const isPast = eventDate < new Date();
            const remainingTickets = event.remainingTickets !== undefined ? event.remainingTickets : 0;
            const priceRange = getPriceRange(event.ticketTypes);
            const isSeatmap = event.purchaseMode === "seatmap";
            const isSoldOut = !isSeatmap && event.ticketTypes?.length > 0 && remainingTickets === 0;

            return (
              <Link
                key={event._id}
                to={`/o/${event.organizationSlug}/events/${event._id}`}
                onFocus={() => prefetch(`/o/${event.organizationSlug}/events/${event._id}`, 30_000)}
                className={`browse-hub__event-card ${isSoldOut ? "browse-hub__event-card--sold-out" : ""}`}
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
                  prefetch(`/o/${event.organizationSlug}/events/${event._id}`, 30_000);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "rgba(247, 242, 231, 0.08)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {/* Image Banner */}
                <div style={{ position: "relative", width: "100%", height: 180, overflow: "hidden" }}>
                  {event.bannerImageUrl ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundImage: `url(${event.bannerImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #14162b 0%, #202447 100%)" }} />
                  )}
                  
                  {/* Category overlay label */}
                  {event.categories?.[0] && (
                    <span
                      style={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        background: "rgba(20, 22, 43, 0.8)",
                        backdropFilter: "blur(6px)",
                        border: "1px solid rgba(247, 242, 231, 0.15)",
                        color: "var(--gold)",
                        padding: "4px 10px",
                        borderRadius: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      {event.categories[0].name}
                    </span>
                  )}
                </div>

                {/* Card details */}
                <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--paper)", flex: 1 }}>
                      {event.name}
                    </h3>
                    {isPast && (
                      <span style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700, marginLeft: 8 }}>
                        Past
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.65)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <MapPin size={14} style={{ color: "var(--gold)" }} />
                    <span>{event.venueId?.name || "TBA"}{event.venueId?.city && `, ${event.venueId.city}`}</span>
                  </p>

                  <p style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.65)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <Calendar size={14} style={{ color: "var(--gold)" }} />
                    <span>{formatDateString(event.dateTime)}</span>
                  </p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 12,
                      borderTop: "1px solid rgba(247, 242, 231, 0.08)",
                    }}
                  >
                    <div>
                      {priceRange && (
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--gold)" }}>
                          {priceRange}
                        </p>
                      )}
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: remainingTickets > 0 ? "#4ade80" : "#f87171" }}>
                        {remainingTickets > 0 ? `✔️ ${remainingTickets} ${isSeatmap ? "seats" : "tickets"} left` : "❌ Sold out"}
                      </p>
                    </div>
                    <span
                      style={{
                        background: "var(--gold)",
                        border: "1px solid rgba(201, 154, 60, 0.3)",
                        color: "#1c1709",
                        padding: "6px 16px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        transition: "background 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--gold-soft)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--gold)";
                      }}
                    >
                      {isSoldOut ? "Sold Out" : isSeatmap ? "Book Seat" : "Get Tickets"} &rarr;
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
