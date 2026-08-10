import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { hasPermission } from "../utils/permissionsClient";

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

const emptyForm = { name: "", description: "", dateTime: "", venueId: "", accessCode: "", privateCodeExpiry: "" };

export default function Events() {
  const { orgSlug } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [bannerFile, setBannerFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [sessionDates, setSessionDates] = useState([]);
  const [newSessionDate, setNewSessionDate] = useState("");
  const [selectedSessionMap, setSelectedSessionMap] = useState({});

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg("");
    }, 4000);
  };

  const load = async () => {
    try {
      const [eventsResponse, venuesResponse, meResponse] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/events/manage`),
        apiClient.get(`/o/${orgSlug}/venues`),
        apiClient.get(`/o/${orgSlug}/whoami`),
      ]);
      setEvents(eventsResponse.data.events);
      setVenues(venuesResponse.data.venues);
      setPermissions(meResponse.data.membership.permissions || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load events.");
    }
  };

  useEffect(() => {
    load();
  }, [orgSlug]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const sessionsToCheck = [form.dateTime, ...sessionDates];
    const hasFutureSession = sessionsToCheck.some(sDate => new Date(sDate) >= new Date());
    if (!hasFutureSession) {
      showToast("Event date and time cannot be in the past.");
      setSaving(false);
      return;
    }

    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === "privateCodeExpiry") {
          body.append(key, value ? new Date(value).toISOString() : "");
        } else {
          body.append(key, key === "dateTime" ? new Date(value).toISOString() : value);
        }
      });
      body.append("sessionDates", JSON.stringify(sessionDates.map(d => new Date(d).toISOString())));
      if (bannerFile) body.append("banner", bannerFile);

      const response = editingId
        ? await apiClient.put(`/o/${orgSlug}/events/${editingId}`, body)
        : await apiClient.post(`/o/${orgSlug}/events`, body);

      setForm(emptyForm);
      setSessionDates([]);
      setNewSessionDate("");
      setBannerFile(null);
      setEditingId(null);
      await load();
      if (!editingId) {
        navigate(`/o/${orgSlug}/manage/events/${response.data.event._id}/seatmap`);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not save event.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (item) => {
    setEditingId(item._id);
    setForm({
      name: item.name || "",
      description: item.description || "",
      dateTime: formatLocalDateForInput(item.dateTime),
      venueId: item.venueId?._id || item.venueId || "",
      accessCode: item.accessCode || "",
      privateCodeExpiry: formatLocalDateForInput(item.privateCodeExpiry),
      bannerImageUrl: item.bannerImageUrl || "",
    });
    if (item.sessions && item.sessions.length > 1) {
      const additional = item.sessions.slice(1).map(s => formatLocalDateForInput(s.dateTime));
      setSessionDates(additional);
    } else {
      setSessionDates([]);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this event?")) return;
    try {
      await apiClient.delete(`/o/${orgSlug}/events/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete event.");
    }
  };

  const canDelete = hasPermission("events:delete", permissions);

  return (
    <div>
      <Link to={`/o/${orgSlug}/dashboard`} className="text-gold-soft">
        &larr; Back to dashboard
      </Link>
      <h1 className="mt-5 font-display text-4xl text-paper">Events</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl bg-paper p-6 text-ink-text shadow-xl">
          <h2 className="font-display text-2xl">
            {editingId ? "Edit event" : "Create event"}
          </h2>
          <p className="text-sm text-muted">
            Pricing and inventory are configured in the visual seat-map builder after saving.
          </p>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <form className="space-y-4" onSubmit={submit}>
            <label className="block text-sm font-semibold">
              Event name
              <input
                required
                name="name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-semibold">
              Date & time
              <input
                required
                name="dateTime"
                type="datetime-local"
                value={form.dateTime}
                onChange={(e) => setForm({ ...form, dateTime: e.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <div className="rounded-lg bg-black/5 p-3 space-y-2 border border-black/5">
              <span className="text-xs font-bold text-muted uppercase block">Additional Session Dates (Optional)</span>
              {sessionDates.map((date, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-md shadow-sm border border-black/5 text-sm">
                  <span>{new Date(date).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => setSessionDates(sessionDates.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={newSessionDate}
                  onChange={(e) => setNewSessionDate(e.target.value)}
                  className="flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newSessionDate) return;
                    if (new Date(newSessionDate) < new Date()) {
                      showToast("Session date cannot be in the past.");
                      return;
                    }
                    setSessionDates([...sessionDates, newSessionDate]);
                    setNewSessionDate("");
                  }}
                  className="px-3 py-1.5 bg-ink text-white font-bold rounded-lg text-xs"
                >
                  Add Date
                </button>
              </div>
            </div>
            <label className="block text-sm font-semibold">
              Venue
              <select
                required
                name="venueId"
                value={form.venueId}
                onChange={(e) => setForm({ ...form, venueId: e.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              >
                <option value="">Select a venue</option>
                {venues.map((venue) => (
                  <option key={venue._id} value={venue._id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-semibold">
              Private Access Code (Optional)
              <div className="flex gap-2 items-center mt-1">
                <input
                  name="accessCode"
                  type="text"
                  value={form.accessCode}
                  onChange={(e) => setForm({ ...form, accessCode: e.target.value })}
                  placeholder="e.g. secret123"
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-ink"
                  style={{ color: "#111326" }}
                />
                {form.accessCode && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, accessCode: "" })}
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
              <span className="text-xs text-muted font-normal block mt-0.5">If set, buyers must enter this code to book seats/tickets.</span>
            </label>
            {form.accessCode && (
              <label className="block text-sm font-semibold">
                Private Code Expiry (Optional)
                <div className="flex gap-2 items-center mt-1">
                  <input
                    name="privateCodeExpiry"
                    type="datetime-local"
                    value={form.privateCodeExpiry}
                    onChange={(e) => setForm({ ...form, privateCodeExpiry: e.target.value })}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-ink"
                    style={{ color: "#111326" }}
                  />
                  {form.privateCodeExpiry && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, privateCodeExpiry: "" })}
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
                <span className="text-xs text-muted font-normal block mt-0.5">
                  If set, the event will automatically become public after this date/time.
                </span>
              </label>
            )}
            <label className="block text-sm font-semibold">
              Banner
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setBannerFile(e.target.files[0])}
                className="mt-1 block w-full text-sm"
              />
              {bannerFile ? (
                <div className="mt-2 relative rounded-lg overflow-hidden border border-black/10 shadow-sm" style={{ maxHeight: 120, width: "100%" }}>
                  <img
                    src={URL.createObjectURL(bannerFile)}
                    alt="New preview"
                    className="w-full h-full object-cover"
                    style={{ height: 100 }}
                  />
                  <div className="absolute top-1 right-1 bg-gold text-ink text-[10px] font-bold px-1.5 py-0.5 rounded">New upload</div>
                </div>
              ) : form.bannerImageUrl ? (
                <div className="mt-2 relative rounded-lg overflow-hidden border border-black/10 shadow-sm" style={{ maxHeight: 120, width: "100%" }}>
                  <img
                    src={form.bannerImageUrl}
                    alt="Current banner"
                    className="w-full h-full object-cover"
                    style={{ height: 100 }}
                  />
                  <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Current banner</div>
                </div>
              ) : null}
            </label>
            <div className="flex gap-2">
              <button
                disabled={saving}
                className="rounded-lg bg-gold px-4 py-2 font-bold text-ink"
              >
                {saving ? "Saving…" : editingId ? "Update event" : "Create & design map"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                    setSessionDates([]);
                    setNewSessionDate("");
                  }}
                  className="rounded-lg border px-4 py-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="space-y-3">
          {events.map((item) => {
            const currentSessionId = selectedSessionMap[item._id] || (item.sessions && item.sessions[0]?._id) || "";
            return (
              <article
                key={item._id}
                className="flex gap-4 rounded-2xl bg-paper p-5 text-ink-text shadow-lg"
              >
                {item.bannerImageUrl && (
                  <img
                    src={item.bannerImageUrl}
                    alt=""
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl">
                        {item.name} {item.accessCode && <span title="Private Event" style={{ fontSize: 13, marginLeft: 4 }}>🔒 Private</span>}
                      </h2>
                      <p className="text-sm text-muted">
                        {item.sessions && item.sessions.length > 1 ? (
                          <span>
                            {item.sessions.length} Sessions (Starting {new Date(item.sessions[0].dateTime).toLocaleString()})
                          </span>
                        ) : (
                          <span>{new Date(item.dateTime).toLocaleString()}</span>
                        )}
                        {" · "}
                        {item.venueId?.name}
                      </p>
                      {item.sessions && item.sessions.length > 1 && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs font-bold uppercase text-muted" style={{ letterSpacing: "0.05em" }}>Active Session:</span>
                          <select
                            value={currentSessionId}
                            onChange={(e) => setSelectedSessionMap(prev => ({ ...prev, [item._id]: e.target.value }))}
                            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-ink-text shadow-sm hover:border-black/30 outline-none"
                            style={{ minWidth: 200, maxWidth: 280 }}
                          >
                            {item.sessions.map((session, idx) => (
                              <option key={session._id} value={session._id}>
                                Session {idx + 1}: {new Date(session.dateTime).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() =>
                          navigate(`/o/${orgSlug}/manage/events/${item._id}/seatmap?sessionId=${currentSessionId}`)
                        }
                        className="rounded-md bg-gold px-3 py-2 text-sm font-bold text-ink shadow-sm"
                      >
                        Seat map
                      </button>
                      <button onClick={() => edit(item)} className="rounded-md border px-3 py-2 text-sm">
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => remove(item._id)}
                          className="rounded-md border border-red-200 px-3 py-2 text-sm text-danger"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="mt-3 inline-block rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold">
                    {item.selectedSeatMap ? "Seat map configured" : "Map needed"}
                  </span>
                </div>
              </article>
            );
          })}
          {events.length === 0 && <p className="text-muted">No events yet.</p>}
        </section>
      </div>

      {toastMsg && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            backgroundColor: "#111827",
            color: "#f7f2e7",
            padding: "16px 24px",
            borderRadius: "12px",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            borderLeft: "4px solid #dc2626",
            zIndex: 9999,
            fontFamily: "sans-serif",
            fontSize: "14px",
            fontWeight: "600",
            animation: "slideIn 0.3s ease-out-in",
          }}
        >
          ⚠️ {toastMsg}
        </div>
      )}
    </div>
  );
}
