import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import MediaGalleryPickerModal from "../components/media/MediaGalleryPickerModal";

const formatLocalDateForInput = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function EditBundle() {
  const { orgSlug, bundleId } = useParams();
  const navigate = useNavigate();

  const [venues, setVenues] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState("");
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [allowedSections, setAllowedSections] = useState({});

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricePerSeat, setPricePerSeat] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [privateCodeExpiry, setPrivateCodeExpiry] = useState("");
  const [bookingOpeningDateTime, setBookingOpeningDateTime] = useState("");
  const [bannerFile, setBannerFile] = useState(null);
  const [existingBannerUrl, setExistingBannerUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [venuesRes, eventsRes, bundleRes] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/venues`),
          apiClient.get(`/o/${orgSlug}/events/manage`),
          apiClient.get(`/o/${orgSlug}/bundles/${bundleId}/manage`),
        ]);
        setVenues(venuesRes.data.venues || []);
        
        const b = bundleRes.data.bundle;
        setName(b.name || "");
        setDescription(b.description || "");
        setPricePerSeat(b.pricePerSeat || "");
        setAccessCode(b.accessCode || "");
        setPrivateCodeExpiry(formatLocalDateForInput(b.privateCodeExpiry));
        setBookingOpeningDateTime(formatLocalDateForInput(b.bookingOpeningDateTime));
        setExistingBannerUrl(b.bannerImageUrl || "");
        setYoutubeUrl(b.youtubeUrl || "");
        
        const initialVenueId = b.venueId?._id || b.venueId || "";
        setSelectedVenue(initialVenueId);
        
        const initialEventIds = b.eventIds?.map(e => e._id || e) || [];
        setSelectedEvents(initialEventIds);

        const seatmapEvents = (eventsRes.data.events || []).filter(
          (e) => e.purchaseMode === "seatmap" && e.selectedSeatMap &&
                 ((!e.parentEventId || String(e.parentEventId) === String(e._id)) || initialEventIds.includes(e._id))
        );
        setAllEvents(seatmapEvents);

        const initialSections = {};
        if (b.allowedSections) {
          b.allowedSections.forEach((sec) => {
            initialSections[sec.eventId] = {
              eventId: sec.eventId,
              blockId: sec.blockId,
              blockName: sec.blockName,
            };
          });
        }
        setAllowedSections(initialSections);
      } catch (err) {
        setError("Could not load details for editing.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [orgSlug, bundleId]);

  const filteredEvents = allEvents.filter(
    (e) => e.venueId?._id === selectedVenue || e.venueId === selectedVenue
  );

  const toggleEventSelection = (eventId) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Bundle name is required.");
    if (!selectedVenue) return setError("Please select a venue.");
    if (selectedEvents.length < 2) return setError("Please select at least 2 events to bundle.");
    if (pricePerSeat === "" || Number(pricePerSeat) < 0) return setError("Please specify a valid seat price.");

    setSaving(true);
    setError("");

    try {
      const body = new FormData();
      body.append("name", name.trim());
      body.append("description", description.trim());
      body.append("venueId", selectedVenue);
      body.append("eventIds", JSON.stringify(selectedEvents));
      body.append("pricePerSeat", Number(pricePerSeat));
      body.append("accessCode", accessCode.trim());
      body.append("privateCodeExpiry", privateCodeExpiry ? new Date(privateCodeExpiry).toISOString() : "");
      body.append("bookingOpeningDateTime", bookingOpeningDateTime ? new Date(bookingOpeningDateTime).toISOString() : "");

      const filteredAllowedSections = Object.values(allowedSections).filter(
        (sec) => selectedEvents.includes(sec.eventId)
      );
      body.append("allowedSections", JSON.stringify(filteredAllowedSections));

      if (bannerFile) {
        body.append("banner", bannerFile);
      } else if (existingBannerUrl) {
        body.append("bannerImageUrl", existingBannerUrl);
      }
      body.append("youtubeUrl", youtubeUrl.trim());

      await apiClient.put(`/o/${orgSlug}/bundles/${bundleId}`, body, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      navigate(`/o/${orgSlug}/manage/bundles`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update bundle.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: "var(--muted)", padding: 40 }}>Loading details for edit…</p>;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 4px" }}>
      <Link to={`/o/${orgSlug}/manage/bundles`} className="text-gold-soft" style={{ textDecoration: "none", fontSize: 14 }}>
        &larr; Back to bundles
      </Link>
      
      <h1 className="font-display text-4xl text-paper" style={{ margin: "16px 0 6px" }}>Edit Event Bundle</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>Update metadata, seat pricing, event inclusions, or banner of this bundle.</p>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-danger" style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleUpdate} className="rounded-2xl bg-paper p-6 text-ink-text shadow-xl" style={{ display: "grid", gap: 20 }}>
        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Bundle Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Opening Week Double Feature"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what is included in this bundle..."
            rows={3}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
            style={{ resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Select Venue *</label>
            <select
              required
              value={selectedVenue}
              onChange={(e) => {
                setSelectedVenue(e.target.value);
                setSelectedEvents([]);
              }}
              className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
            >
              <option value="">-- Select Venue --</option>
              {venues.map((v) => (
                <option key={v._id} value={v._id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Bundle Price ($) *</label>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)" }}>This is charged per seat quantity slot — e.g. $25 × 2 seats = $50 total, regardless of the number of events in the bundle.</p>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={pricePerSeat}
              onChange={(e) => setPricePerSeat(e.target.value)}
              placeholder="e.g. 25.00"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
            />
          </div>
        </div>

        {selectedVenue && (
          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Select Events to Bundle (Min 2) *</label>
            {filteredEvents.length === 0 ? (
              <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>No upcoming seatmap events found for this venue.</p>
            ) : (
              <div style={{ display: "grid", gap: 8, maxHeight: 200, overflowY: "auto", padding: 8, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: "rgba(0,0,0,0.02)" }}>
                {filteredEvents.map((event) => {
                  const isChecked = selectedEvents.includes(event._id);
                  return (
                    <div
                      key={event._id}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: isChecked ? "rgba(201, 154, 60, 0.04)" : "transparent",
                        border: isChecked ? "1px solid rgba(201, 154, 60, 0.2)" : "1px solid transparent",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEventSelection(event._id)}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{event.name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(event.dateTime).toLocaleString()}</div>
                        </div>
                      </label>

                      {isChecked && event.selectedSeatMap?.blocks && (
                        <div style={{ paddingLeft: 24, marginTop: 4 }}>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 2 }}>
                            Allowed Seating Section (Optional)
                          </label>
                          <select
                            value={allowedSections[event._id]?.blockId || ""}
                            onChange={(e) => {
                              const blockId = e.target.value;
                              if (!blockId) {
                                setAllowedSections((prev) => {
                                  const copy = { ...prev };
                                  delete copy[event._id];
                                  return copy;
                                });
                              } else {
                                const block = event.selectedSeatMap.blocks.find((b) => b.id === blockId);
                                setAllowedSections((prev) => ({
                                  ...prev,
                                  [event._id]: {
                                    eventId: event._id,
                                    blockId: block.id,
                                    blockName: block.name,
                                  },
                                }));
                              }
                            }}
                            className="rounded-md border border-black/15 px-2 py-1 text-xs bg-white animate-fade-in"
                            style={{ color: "#111326", width: "100%", maxWidth: 280 }}
                          >
                            <option value="">-- All Sections --</option>
                            {event.selectedSeatMap.blocks.map((block) => (
                              <option key={block.id} value={block.id}>
                                {block.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Private Access Code (Optional)</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="e.g. secret123"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
              style={{ color: "#111326" }}
            />
            {accessCode && (
              <button
                type="button"
                onClick={() => setAccessCode("")}
                style={{
                  padding: "8px 12px",
                  background: "rgba(220, 38, 38, 0.08)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  borderRadius: "6px",
                  color: "var(--danger, #dc2626)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Remove access code"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            )}
          </div>
          <span className="text-xs text-muted font-normal block mt-0.5">If set, buyers must enter this code to select seats/tickets for this bundle.</span>
        </div>

        {accessCode && (
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Private Code Expiry (Optional)</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="datetime-local"
                value={privateCodeExpiry}
                onChange={(e) => setPrivateCodeExpiry(e.target.value)}
                className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
                style={{ color: "#111326" }}
              />
              {privateCodeExpiry && (
                <button
                  type="button"
                  onClick={() => setPrivateCodeExpiry("")}
                  style={{
                    padding: "8px 12px",
                    background: "rgba(220, 38, 38, 0.08)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "6px",
                    color: "var(--danger, #dc2626)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Clear expiry date"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              )}
            </div>
            <span className="text-xs text-muted font-normal block mt-0.5">If set, the bundle will automatically become public after this date/time.</span>
          </div>
        )}

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Booking Opening Date & Time (Optional)</label>
          <input
            type="datetime-local"
            value={bookingOpeningDateTime}
            onChange={(e) => setBookingOpeningDateTime(e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
            style={{ color: "#111326" }}
          />
          <span className="text-xs text-muted font-normal block mt-0.5">If set, buyers will not be able to select seats/tickets for this bundle until this date and time.</span>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Banner Image</label>
          {existingBannerUrl && (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Current banner preview:</span>
              <img src={existingBannerUrl} alt="Existing Banner" style={{ display: "block", marginTop: 4, maxHeight: 90, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)" }} />
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setBannerFile(e.target.files[0])}
            className="w-full text-sm"
          />
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            style={{
              marginTop: 8,
              padding: "6px 14px",
              background: "rgba(245, 178, 52, 0.1)",
              border: "1px solid rgba(245, 178, 52, 0.4)",
              borderRadius: 8,
              color: "var(--gold)",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🖼️ Choose from Gallery
          </button>
          {bannerFile && (
            <div style={{ marginTop: 10 }}>
              <img
                src={URL.createObjectURL(bannerFile)}
                alt="New Banner preview"
                style={{ maxHeight: 90, borderRadius: 8, border: "1px solid rgba(245, 178, 52, 0.3)" }}
              />
            </div>
          )}
        </div>

        {/* YouTube Video URL */}
        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
            YouTube Video URL
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>(Optional)</span>
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#FF0000">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </span>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
              className="w-full rounded-md border border-black/15 px-3 py-2"
              style={{ paddingLeft: 34, color: "#111326" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 10 }}>
          <button
            type="button"
            onClick={() => navigate(`/o/${orgSlug}/manage/bundles`)}
            className="rounded-lg border px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-gold px-4 py-2 font-bold text-ink"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
      <MediaGalleryPickerModal
        orgSlug={orgSlug}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        selectedUrl={existingBannerUrl}
        onSelect={(url) => {
          setBannerFile(null);
          setExistingBannerUrl(url);
        }}
      />
    </div>
  );
}
