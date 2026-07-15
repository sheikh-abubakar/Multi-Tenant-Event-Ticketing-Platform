import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../api/client";

const emptyForm = { name: "", description: "", dateTime: "", venueId: "" };
const emptyTicketType = { name: "", price: "", quantityTotal: "" };

const Events = () => {
  const { orgSlug } = useParams();
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [ticketTypes, setTicketTypes] = useState([{ ...emptyTicketType }]);
  const [bannerFile, setBannerFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsRes, venuesRes, whoamiRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/events`),
        apiClient.get(`/o/${orgSlug}/venues`),
        apiClient.get(`/o/${orgSlug}/whoami`),
      ]);
      setEvents(eventsRes.data.events);
      setVenues(venuesRes.data.venues);
      setRole(whoamiRes.data.membership.role);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  const canDelete = role === "owner" || role === "admin";

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleTicketTypeChange = (index, field, value) => {
    const updated = [...ticketTypes];
    updated[index] = { ...updated[index], [field]: value };
    setTicketTypes(updated);
  };

  const addTicketTypeRow = () => setTicketTypes([...ticketTypes, { ...emptyTicketType }]);
  const removeTicketTypeRow = (index) =>
    setTicketTypes(ticketTypes.filter((_, i) => i !== index));

  const resetForm = () => {
    setForm(emptyForm);
    setTicketTypes([{ ...emptyTicketType }]);
    setBannerFile(null);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const cleanedTicketTypes = ticketTypes
      .filter((t) => t.name && t.price !== "" && t.quantityTotal !== "")
      .map((t) => ({
        name: t.name,
        price: Number(t.price),
        quantityTotal: Number(t.quantityTotal),
      }));

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("description", form.description);
    formData.append("dateTime", new Date(form.dateTime).toISOString());
    formData.append("venueId", form.venueId);
    formData.append("ticketTypes", JSON.stringify(cleanedTicketTypes));
    if (bannerFile) formData.append("banner", bannerFile);

    try {
      if (editingId) {
        await apiClient.put(`/o/${orgSlug}/events/${editingId}`, formData);
      } else {
        await apiClient.post(`/o/${orgSlug}/events`, formData);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save event.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (event) => {
    setEditingId(event._id);
    setForm({
      name: event.name || "",
      description: event.description || "",
      dateTime: event.dateTime ? event.dateTime.slice(0, 16) : "",
      venueId: event.venueId?._id || event.venueId || "",
    });
    setTicketTypes(
      event.ticketTypes?.length
        ? event.ticketTypes.map((t) => ({
            name: t.name,
            price: t.price,
            quantityTotal: t.quantityTotal,
          }))
        : [{ ...emptyTicketType }]
    );
    setBannerFile(null);
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm("Delete this event? This cannot be undone.")) return;
    try {
      await apiClient.delete(`/o/${orgSlug}/events/${eventId}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete event.");
    }
  };

  return (
    <div>
      <p>
        <Link to={`/o/${orgSlug}/dashboard`}>&larr; Back to dashboard</Link>
      </p>
      <h1 style={{ color: "var(--paper)", marginBottom: 24 }}>Events</h1>

      {venues.length === 0 && !loading && (
        <div className="error-banner">
          You need at least one venue before creating an event. <Link to={`/o/${orgSlug}/venues`}>Add a venue &rarr;</Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit event" : "Create an event"}</h3>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">Event name</label>
              <input id="name" name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="field">
              <label htmlFor="venueId">Venue</label>
              <select id="venueId" name="venueId" value={form.venueId} onChange={handleChange} required>
                <option value="">Select a venue</option>
                {venues.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dateTime">Date &amp; time</label>
              <input
                id="dateTime"
                name="dateTime"
                type="datetime-local"
                value={form.dateTime}
                onChange={handleChange}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                rows={3}
                value={form.description}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>Ticket types</label>
              {ticketTypes.map((t, i) => (
                <div key={i} style={styles.ticketTypeRow}>
                  <input
                    placeholder="General"
                    value={t.name}
                    onChange={(e) => handleTicketTypeChange(i, "name", e.target.value)}
                  />
                  <input
                    placeholder="Price"
                    type="number"
                    min="0"
                    value={t.price}
                    onChange={(e) => handleTicketTypeChange(i, "price", e.target.value)}
                  />
                  <input
                    placeholder="Qty"
                    type="number"
                    min="0"
                    value={t.quantityTotal}
                    onChange={(e) => handleTicketTypeChange(i, "quantityTotal", e.target.value)}
                  />
                  {ticketTypes.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeTicketTypeRow(i)}
                      style={styles.removeBtn}
                      aria-label="Remove ticket type"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={addTicketTypeRow} style={{ marginTop: 4 }}>
                + Add ticket type
              </button>
            </div>

            <div className="field">
              <label htmlFor="banner">Banner image</label>
              <input
                id="banner"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setBannerFile(e.target.files[0])}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={saving || venues.length === 0}>
                {saving ? "Saving…" : editingId ? "Update event" : "Create event"}
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
          {loading && <p style={{ color: "var(--muted)" }}>Loading events…</p>}
          {!loading && events.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No events yet — create your first one.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.map((event) => (
              <div key={event._id} className="card" style={{ display: "flex", gap: 16 }}>
                {event.bannerImageUrl && (
                  <img
                    src={event.bannerImageUrl}
                    alt=""
                    style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0 }}>{event.name}</h3>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => startEdit(event)}>
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          className="btn btn-ghost"
                          style={{ color: "var(--danger)", borderColor: "#edb9af" }}
                          onClick={() => handleDelete(event._id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <p style={{ margin: "4px 0", color: "var(--muted)", fontSize: 14 }}>
                    {new Date(event.dateTime).toLocaleString()} · {event.venueId?.name}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {event.ticketTypes.map((t) => (
                      <span key={t._id} className="badge">
                        {t.name}: Rs.{t.price} ({t.quantityTotal - t.quantityBooked} left)
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Events;

const styles = {
  ticketTypeRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr auto",
    gap: 6,
    marginBottom: 6,
  },
  removeBtn: {
    padding: "0 10px",
    lineHeight: 1,
  },
};
