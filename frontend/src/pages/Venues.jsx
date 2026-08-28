import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Users, Pencil, Trash2, Building2, Globe, Plus, X } from "lucide-react";
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
  const [showModal, setShowModal] = useState(false);

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
    setError("");
  };

  const handleCloseModal = () => {
    resetForm();
    setShowModal(false);
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
      setShowModal(false);
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
      timezone: venue.timezone || "Asia/Karachi",
    });
    setShowModal(true);
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
    <div className="venues-page">
      <style>{`
        .venues-page__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 24px;
        }
        .venue-card {
          display: flex;
          flex-direction: column;
          background: var(--paper);
          border: 1px solid rgba(20, 22, 43, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .venue-card:hover {
          transform: translateY(-4px);
          border-color: rgba(201, 154, 60, 0.4);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(10, 11, 20, 0.6);
          backdrop-filter: blur(16px);
          animation: fadeIn 0.2s ease-out;
        }
        .modal-container {
          background: var(--paper);
          border: 1px solid rgba(20, 22, 43, 0.08);
          border-radius: 24px;
          width: min(500px, calc(100% - 32px));
          max-height: 90vh;
          overflow-y: auto;
          padding: 32px;
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.3);
          animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .venues-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          gap: 16px;
        }
        @media (max-width: 600px) {
          .venues-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .venues-header button {
            width: 100%;
          }
        }
      `}</style>

      <Link
        to={`/o/${orgSlug}/dashboard`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gold-soft hover:underline"
      >
        <ArrowLeft size={15} /> Back to dashboard
      </Link>

      <div className="venues-header">
        <div>
          <h1 className="font-display text-4xl text-paper m-0">Venues</h1>
          <p className="text-muted m-0 mt-1 text-sm">
            Manage your physical event venues, capacities, and seat mapping configurations.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink hover:bg-gold-soft transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-md cursor-pointer"
        >
          <Plus size={16} />
          <span>Create Venue</span>
        </button>
      </div>

      {error && !showModal && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {loading && <p className="text-muted">Loading venues…</p>}

      {!loading && venues.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center" style={{ background: "rgba(28, 31, 61, 0.2)" }}>
          <Building2 className="mx-auto mb-4 text-muted" size={40} style={{ opacity: 0.6 }} />
          <h3 className="m-0 mb-2 font-display text-2xl text-paper">No Venues Found</h3>
          <p className="text-muted max-w-sm mx-auto mb-6 text-sm">Create your first venue template to start setting up visual seatmaps and event schedules.</p>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-soft cursor-pointer"
          >
            <Plus size={14} /> Add Venue
          </button>
        </div>
      )}

      {!loading && venues.length > 0 && (
        <div className="venues-page__grid">
          {venues.map((venue) => (
            <div key={venue._id} className="venue-card">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="shrink-0 rounded-xl bg-gold/10 p-3 text-gold border border-gold/15">
                  <Building2 size={22} />
                </div>
                <h3 className="m-0 truncate font-display text-2xl tracking-wide text-ink-text" title={venue.name}>
                  {venue.name}
                </h3>
              </div>

              <div className="flex flex-col gap-2.5 mb-6 text-sm text-muted flex-1">
                {(venue.address || venue.city) && (
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-gold shrink-0 mt-0.5" />
                    <span>{[venue.address, venue.city].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gold shrink-0" />
                  <span>{venue.capacity ? `${venue.capacity} Capacity` : "No capacity limit"}</span>
                </div>
                {venue.timezone && (
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-gold shrink-0" />
                    <span>{venue.timezone.split("/").pop().replace(/_/g, " ")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-black/5 gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(venue)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-ink-text hover:bg-black/5 cursor-pointer transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(venue._id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-danger hover:bg-red-50 cursor-pointer transition-colors"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
                <Link
                  to={`/o/${orgSlug}/manage/venues/${venue._id}/seatmaps/new`}
                  className="inline-flex items-center gap-1 rounded-lg bg-gold px-3.5 py-2 text-xs font-bold text-ink hover:bg-gold-soft transition-colors"
                  style={{ color: "#1c1709" }}
                >
                  Seat maps
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Form Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="m-0 font-display text-2xl tracking-wide text-ink-text">
                {editingId ? "Edit Venue" : "Create New Venue"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="rounded-lg p-1.5 text-muted hover:text-ink-text hover:bg-black/5 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  Venue Name *
                </label>
                <input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Grand City Arena"
                  className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-ink-text placeholder-black/30 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>

              <div>
                <label htmlFor="address" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  Street Address
                </label>
                <input
                  id="address"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="e.g. 123 Event Boulevard"
                  className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-ink-text placeholder-black/30 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="e.g. Lahore"
                    className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-ink-text placeholder-black/30 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label htmlFor="capacity" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                    Capacity
                  </label>
                  <input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min="0"
                    value={form.capacity}
                    onChange={handleChange}
                    placeholder="e.g. 500"
                    className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-ink-text placeholder-black/30 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="timezone" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  <Globe size={12} className="inline mr-1" /> Timezone *
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  value={form.timezone}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-black/15 bg-white px-4 py-2.5 text-ink-text focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted">
                  Used to schedule and validate event session times at this location.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg border border-black/10 px-5 py-2.5 text-sm font-semibold text-ink-text hover:bg-black/5 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gold px-6 py-2.5 text-sm font-bold text-ink hover:bg-gold-soft disabled:opacity-60 cursor-pointer transition-colors"
                  style={{ color: "#1c1709" }}
                >
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Create Venue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Venues;
