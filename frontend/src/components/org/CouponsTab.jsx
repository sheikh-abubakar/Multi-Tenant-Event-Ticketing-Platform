import { useEffect, useState } from "react";
import apiClient from "../../api/client";

export default function CouponsTab({ orgSlug }) {
  const [coupons, setCoupons] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    eventId: "",
    expiresAt: "",
    maxUses: "",
  });

  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [couponsRes, eventsRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/coupons`),
        apiClient.get(`/o/${orgSlug}/events/manage`).catch(() => ({ data: { events: [] } })),
      ]);
      setCoupons(couponsRes.data.data || []);
      setEvents(eventsRes.data.events || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgSlug]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        eventId: form.eventId || null,
        expiresAt: form.expiresAt || null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      };

      await apiClient.post(`/o/${orgSlug}/coupons`, payload);
      setSuccess("Coupon code created successfully!");
      setForm({
        code: "",
        discountType: "percentage",
        discountValue: "",
        eventId: "",
        expiresAt: "",
        maxUses: "",
      });
      setShowCreateForm(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create coupon");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (couponId) => {
    if (!window.confirm("Are you sure you want to delete this coupon code?")) return;
    setError("");
    setSuccess("");
    try {
      await apiClient.delete(`/o/${orgSlug}/coupons/${couponId}`);
      setSuccess("Coupon deleted.");
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete coupon");
    }
  };

  if (loading) return <p className="text-muted">Loading coupons…</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ color: "var(--paper)", margin: 0, fontSize: 20 }}>Manage Coupon Codes</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-soft"
        >
          {showCreateForm ? "Cancel" : "➕ Create Coupon"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreate} className="rounded-xl bg-paper p-6 shadow-lg mb-6 space-y-4 text-ink-text">
          <h3 style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 16 }}>New Coupon Code</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Coupon Code</label>
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                required
                placeholder="e.g. EARLYBIRD20"
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Discount Type</label>
              <select
                name="discountType"
                value={form.discountType}
                onChange={handleChange}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Discount Value {form.discountType === "percentage" ? "(%)" : "($)"}
              </label>
              <input
                type="number"
                name="discountValue"
                value={form.discountValue}
                onChange={handleChange}
                required
                min={1}
                max={form.discountType === "percentage" ? 100 : undefined}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Event Scope</label>
              <select
                name="eventId"
                value={form.eventId}
                onChange={handleChange}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
              >
                <option value="">All Events (Org Wide)</option>
                {events.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Max Uses Limit (Optional)</label>
              <input
                type="number"
                name="maxUses"
                value={form.maxUses}
                onChange={handleChange}
                min={1}
                placeholder="e.g. 100"
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Expiration Date (Optional)</label>
              <input
                type="date"
                name="expiresAt"
                value={form.expiresAt}
                onChange={handleChange}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create Coupon"}
          </button>
        </form>
      )}

      {/* Coupons list */}
      <div className="rounded-xl bg-paper p-6 shadow-lg text-ink-text">
        {coupons.length === 0 ? (
          <p className="text-center text-muted" style={{ margin: 0 }}>No coupon codes exist yet for this organization.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ padding: "10px 8px" }}>Code</th>
                  <th style={{ padding: "10px 8px" }}>Discount</th>
                  <th style={{ padding: "10px 8px" }}>Scope</th>
                  <th style={{ padding: "10px 8px" }}>Uses</th>
                  <th style={{ padding: "10px 8px" }}>Expires</th>
                  <th style={{ padding: "10px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => {
                  const targetEvent = events.find((e) => e._id === coupon.eventId);
                  return (
                    <tr key={coupon._id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "12px 8px", fontWeight: "700" }}>
                        <code style={{ background: "#f3f4f6", padding: "3px 6px", borderRadius: 4 }}>
                          {coupon.code}
                        </code>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}% Off`
                          : `$ ${coupon.discountValue} Off`}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {targetEvent ? `Event: ${targetEvent.name}` : "All Events"}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {coupon.usedCount} / {coupon.maxUses === null ? "∞" : coupon.maxUses}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : "Never"}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <button
                          onClick={() => handleDelete(coupon._id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--danger)",
                            cursor: "pointer",
                            fontWeight: "600",
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
