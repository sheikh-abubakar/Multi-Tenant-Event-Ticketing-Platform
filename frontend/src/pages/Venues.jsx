import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../api/client";
import { hasPermission } from "../utils/permissionsClient";

const emptyForm = { name: "", address: "", city: "", capacity: "" };

const Venues = () => {
  const { orgSlug } = useParams();
  const [venues, setVenues] = useState([]);
  const [permissions, setPermissions] = useState([]);
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
      setPermissions(whoamiRes.data.membership.permissions || []);
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

  const canDelete = hasPermission("venues:delete", permissions);

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
      <p>
        <Link to={`/o/${orgSlug}/dashboard`}>&larr; Back to dashboard</Link>
      </p>
      <h1 style={{ color: "var(--paper)", marginBottom: 24 }}>Venues</h1>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit venue" : "Add a venue"}</h3>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <input id="address" name="address" value={form.address} onChange={handleChange} />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" value={form.city} onChange={handleChange} />
            </div>
            <div className="field">
              <label htmlFor="capacity">Capacity</label>
              <input
                id="capacity"
                name="capacity"
                type="number"
                min="0"
                value={form.capacity}
                onChange={handleChange}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update venue" : "Add venue"}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div>
          {loading && <p style={{ color: "var(--muted)" }}>Loading venues…</p>}
          {!loading && venues.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No venues yet — add your first one.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {venues.map((venue) => (
              <div key={venue._id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{venue.name}</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>
                    {[venue.address, venue.city].filter(Boolean).join(", ") || "No address set"}
                    {venue.capacity ? ` · Capacity ${venue.capacity}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => startEdit(venue)}>
                    Edit
                  </button>
                  {canDelete && (
                    <button
                      className="btn btn-ghost"
                      style={{ color: "var(--danger)", borderColor: "#edb9af" }}
                      onClick={() => handleDelete(venue._id)}
                    >
                      Delete
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
