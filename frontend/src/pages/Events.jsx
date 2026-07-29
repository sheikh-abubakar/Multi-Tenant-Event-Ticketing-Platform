import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { hasPermission } from "../utils/permissionsClient";

const emptyForm = { name: "", description: "", dateTime: "", venueId: "" };

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

    if (new Date(form.dateTime) < new Date()) {
      showToast("Event date and time cannot be in the past.");
      setSaving(false);
      return;
    }

    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) =>
        body.append(key, key === "dateTime" ? new Date(value).toISOString() : value)
      );
      if (bannerFile) body.append("banner", bannerFile);

      const response = editingId
        ? await apiClient.put(`/o/${orgSlug}/events/${editingId}`, body)
        : await apiClient.post(`/o/${orgSlug}/events`, body);

      setForm(emptyForm);
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
      dateTime: item.dateTime?.slice(0, 16) || "",
      venueId: item.venueId?._id || item.venueId || "",
    });
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
            {[
              ["name", "Event name", "text"],
              ["dateTime", "Date & time", "datetime-local"],
            ].map(([name, label, type]) => (
              <label key={name} className="block text-sm font-semibold">
                {label}
                <input
                  required
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
                />
              </label>
            ))}
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
              Banner
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setBannerFile(e.target.files[0])}
                className="mt-1 block w-full text-sm"
              />
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
          {events.map((item) => (
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
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl">{item.name}</h2>
                    <p className="text-sm text-muted">
                      {new Date(item.dateTime).toLocaleString()} · {item.venueId?.name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        navigate(`/o/${orgSlug}/manage/events/${item._id}/seatmap`)
                      }
                      className="rounded-md bg-gold px-3 py-2 text-sm font-bold text-ink"
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
                <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold">
                  {item.selectedSeatMap ? "Seat map configured" : "Map needed"}
                </span>
              </div>
            </article>
          ))}
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
