import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Users, Pencil, Trash2, Building2, Globe } from "lucide-react";
import apiClient from "../api/client";

const TIMEZONES = [
  { value: "UTC", label: "🌐 (UTC+00:00) Coordinated Universal Time — UTC" },
  { value: "Pacific/Auckland", label: "🇳🇿 (UTC+12:00) New Zealand Time — Auckland" },
  { value: "Australia/Sydney", label: "🇦🇺 (UTC+10:00) Australian Eastern Time — Sydney" },
  { value: "Australia/Perth", label: "🇦🇺 (UTC+08:00) Australian Western Time — Perth" },
  { value: "Asia/Tokyo", label: "🇯🇵 (UTC+09:00) Japan Standard Time — Tokyo" },
  { value: "Asia/Seoul", label: "🇰🇷 (UTC+09:00) Korea Standard Time — Seoul" },
  { value: "Asia/Shanghai", label: "🇨🇳 (UTC+08:00) China Standard Time — Shanghai" },
  { value: "Asia/Singapore", label: "🇸🇬 (UTC+08:00) Singapore Time — Singapore" },
  { value: "Asia/Dhaka", label: "🇧🇩 (UTC+06:00) Bangladesh Standard Time — Dhaka" },
  { value: "Asia/Karachi", label: "🇵🇰 (UTC+05:00) Pakistan Standard Time — Karachi" },
  { value: "Asia/Kolkata", label: "🇮🇳 (UTC+05:30) India Standard Time — Kolkata" },
  { value: "Asia/Kabul", label: "🇦🇫 (UTC+04:30) Afghanistan Time — Kabul" },
  { value: "Asia/Dubai", label: "🇦🇪 (UTC+04:00) Gulf Standard Time — Dubai" },
  { value: "Asia/Riyadh", label: "🇸🇦 (UTC+03:00) Arabian Standard Time — Riyadh" },
  { value: "Asia/Baghdad", label: "🇮🇶 (UTC+03:00) Arabiya Standard Time — Baghdad" },
  { value: "Asia/Tehran", label: "🇮🇷 (UTC+03:30) Iran Standard Time — Tehran" },
  { value: "Europe/Istanbul", label: "🇹🇷 (UTC+03:00) Turkey Time — Istanbul" },
  { value: "Europe/Moscow", label: "🇷🇺 (UTC+03:00) Moscow Time — Moscow" },
  { value: "Africa/Cairo", label: "🇪🇬 (UTC+02:00) Eastern European Time — Cairo" },
  { value: "Africa/Johannesburg", label: "🇿🇦 (UTC+02:00) South Africa Standard Time — Johannesburg" },
  { value: "Africa/Lagos", label: "🇳🇬 (UTC+01:00) West Africa Time — Lagos" },
  { value: "Europe/Berlin", label: "🇩🇪 (UTC+01:00) Central European Time — Berlin" },
  { value: "Europe/London", label: "🇬🇧 (UTC+00:00) Greenwich Mean Time — London" },
  { value: "America/Sao_Paulo", label: "🇧🇷 (UTC-03:00) Brasília Time — Sao Paulo" },
  { value: "America/New_York", label: "🇺🇸 (UTC-05:00) Eastern Time — New York" },
  { value: "America/Toronto", label: "🇨🇦 (UTC-05:00) Eastern Time — Toronto" },
  { value: "America/Chicago", label: "🇺🇸 (UTC-06:00) Central Time — Chicago" },
  { value: "America/Mexico_City", label: "🇲🇽 (UTC-06:00) Central Time — Mexico City" },
  { value: "America/Denver", label: "🇺🇸 (UTC-07:00) Mountain Time — Denver" },
  { value: "America/Los_Angeles", label: "🇺🇸 (UTC-08:00) Pacific Time — Los Angeles" },
  { value: "America/Vancouver", label: "🇨🇦 (UTC-08:00) Pacific Time — Vancouver" },
];

const emptyForm = { name: "", address: "", city: "", capacity: "", timezone: "Asia/Karachi" };

const Venues = () => {
  const { orgSlug } = useParams();
  const [venues, setVenues] = useState([]);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadVenues = async () => {
    setLoading(true);
    try {
      const [venuesRes, whoamiRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/venues`),
        apiClient.get(`/o/${orgSlug}/whoami`),
      ]);
      setVenues(venuesRes.data.venues);
      setRole(whoamiRes.data.membership.role);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load venues.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVenues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  const canDelete = role === "owner" || role === "admin";

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      name: form.name,
      address: form.address,
      city: form.city,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      timezone: form.timezone,
    };
    try {
      if (editingId) {
        await apiClient.put(`/o/${orgSlug}/venues/${editingId}`, payload);
      } else {
        await apiClient.post(`/o/${orgSlug}/venues`, payload);
      }
      resetForm();
      await loadVenues();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save venue.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (venue) => {
    setEditingId(venue._id);
    setForm({
      name: venue.name || "",
      address: venue.address || "",
      city: venue.city || "",
      capacity: venue.capacity ?? "",
    });
  };

  const handleDelete = async (venueId) => {
    if (!window.confirm("Delete this venue? This cannot be undone.")) return;
    try {
      await apiClient.delete(`/o/${orgSlug}/venues/${venueId}`);
      await loadVenues();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete venue.");
    }
  };

  return (
    <div>
      <Link
        to={`/o/${orgSlug}/dashboard`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gold-soft hover:underline"
      >
        <ArrowLeft size={15} /> Back to dashboard
      </Link>

      <h1 className="font-display text-4xl text-paper mb-8">Venues</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* ── Form ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-paper p-6 shadow-lg">
          <h3 className="mt-0 mb-4 font-display text-2xl tracking-wide text-ink-text">
            {editingId ? "Edit venue" : "Add a venue"}
          </h3>
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Name
              </label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div>
              <label htmlFor="address" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Address
              </label>
              <input
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div>
              <label htmlFor="city" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                City
              </label>
              <input
                id="city"
                name="city"
                value={form.city}
                onChange={handleChange}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div>
              <label htmlFor="capacity" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Capacity
              </label>
              <input
                id="capacity"
                name="capacity"
                type="number"
                min="0"
                value={form.capacity}
                onChange={handleChange}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div>
              <label htmlFor="timezone" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                <Globe size={12} className="inline mr-1" /> Timezone
              </label>
              <select
                id="timezone"
                name="timezone"
                value={form.timezone}
                onChange={handleChange}
                required
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Select the timezone where this venue is located. Events will use this timezone.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft disabled:opacity-60"
              >
                {saving ? "Saving…" : editingId ? "Update venue" : "Add venue"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-black/10 px-5 py-2.5 text-sm font-semibold text-ink-text hover:bg-black/5"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* ── List ─────────────────────────────────────────────── */}
        <div>
          {loading && <p className="text-muted">Loading venues…</p>}

          {!loading && venues.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
              <Building2 className="mx-auto mb-3 text-muted" size={28} />
              <p className="text-muted">No venues yet — add your first one to get started.</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {venues.map((venue) => (
              <div
                key={venue._id}
                className="flex items-center justify-between gap-4 rounded-2xl bg-paper p-5 shadow-lg"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="shrink-0 rounded-xl bg-ink/5 p-3 text-ink-text">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="m-0 truncate font-display text-xl tracking-wide text-ink-text">
                      {venue.name}
                    </h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
                      {(venue.address || venue.city) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} />
                          {[venue.address, venue.city].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {venue.capacity ? (
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} />
                          {venue.capacity}
                        </span>
                      ) : null}
                      {venue.timezone && (
                        <span className="inline-flex items-center gap-1">
                          <Globe size={13} />
                          {venue.timezone.split("/").pop().replace(/_/g, " ")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => startEdit(venue)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-2 text-sm font-medium text-ink-text hover:bg-black/5"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(venue._id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Venues;