import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../api/client";

export default function Coupons() {
  const { orgSlug } = useParams();
  const [coupons, setCoupons] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bundles, setBundles] = useState([]);

  const defaultForm = {
    code: "",
    discountType: "percentage",
    discountValue: "",
    eventId: "",
    bundleId: "",
    expiresAt: "",
    maxUses: "",
  };

  const [form, setForm] = useState(defaultForm);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // null means creating, otherwise coupon ID

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [couponsRes, eventsRes, bundlesRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/coupons`),
        apiClient.get(`/o/${orgSlug}/events/manage`).catch(() => ({ data: { events: [] } })),
        apiClient.get(`/o/${orgSlug}/bundles`).catch(() => ({ data: { bundles: [] } })),
      ]);
      setCoupons(couponsRes.data.data || []);
      setEvents(eventsRes.data.events || []);
      setBundles(bundlesRes.data.bundles || []);
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

  const openCreateModal = () => {
    setForm(defaultForm);
    setEditingId(null);
    setError("");
    setSuccess("");
    setShowModal(true);
  };

  const openEditModal = (coupon) => {
    setForm({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      eventId: coupon.eventId || "",
      bundleId: coupon.bundleId || "",
      expiresAt: coupon.expiresAt ? coupon.expiresAt.substring(0, 10) : "",
      maxUses: coupon.maxUses !== null ? coupon.maxUses : "",
    });
    setEditingId(coupon._id);
    setError("");
    setSuccess("");
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
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
        bundleId: form.bundleId || null,
        expiresAt: form.expiresAt || null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      };

      if (editingId) {
        await apiClient.put(`/o/${orgSlug}/coupons/${editingId}`, payload);
        setSuccess("Coupon code updated successfully!");
      } else {
        await apiClient.post(`/o/${orgSlug}/coupons`, payload);
        setSuccess("Coupon code created successfully!");
      }
      
      setShowModal(false);
      setForm(defaultForm);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save coupon");
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

  if (loading) {
    return <p style={{ color: "var(--muted)", padding: 20 }}>Loading coupons…</p>;
  }

  return (
    <div className="coupons-page mx-auto max-w-5xl" style={{ padding: "0 20px" }}>
      <p className="mb-4">
        <Link to={`/o/${orgSlug}/dashboard`} className="text-gold-soft hover:underline">
          &larr; Back to dashboard
        </Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 className="font-display text-4xl text-paper mb-1">Coupon Codes</h1>
          <p className="text-muted" style={{ margin: 0 }}>Create and manage discount codes for your events.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="rounded-md bg-gold px-4 py-2.5 text-sm font-bold text-ink hover:bg-gold-soft transition-colors"
        >
          ➕ Create Coupon
        </button>
      </div>

      {error && !showModal && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* Coupons list */}
      <div className="rounded-xl bg-paper p-6 shadow-lg text-ink-text">
        {coupons.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏷️</div>
            <p className="text-muted" style={{ margin: 0, fontSize: 16 }}>No coupon codes exist yet for this organization.</p>
            <button
              onClick={openCreateModal}
              className="mt-4 rounded-md bg-gold px-4 py-2 text-sm font-bold text-ink hover:bg-gold-soft transition-colors"
            >
              Add First Coupon
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.1)", color: "var(--muted)" }}>
                  <th style={{ padding: "12px 8px", fontWeight: 600 }}>Code</th>
                  <th style={{ padding: "12px 8px", fontWeight: 600 }}>Discount</th>
                  <th style={{ padding: "12px 8px", fontWeight: 600 }}>Scope</th>
                  <th style={{ padding: "12px 8px", fontWeight: 600 }}>Uses</th>
                  <th style={{ padding: "12px 8px", fontWeight: 600 }}>Expires</th>
                  <th style={{ padding: "12px 8px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => {
                  const targetEvent = events.find((e) => e._id === coupon.eventId);
                  const targetBundle = bundles.find((b) => b._id === coupon.bundleId);
                  return (
                    <tr key={coupon._id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }} className="hover:bg-black/[0.02]">
                      <td style={{ padding: "14px 8px" }}>
                        <code style={{ background: "rgba(201, 154, 60, 0.12)", color: "var(--gold)", padding: "4px 8px", borderRadius: 6, fontWeight: 700, letterSpacing: "0.05em" }}>
                          {coupon.code}
                        </code>
                      </td>
                      <td style={{ padding: "14px 8px", fontWeight: 600 }}>
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}% Off`
                          : `$ ${coupon.discountValue} Off`}
                      </td>
                      <td style={{ padding: "14px 8px" }}>
                        {coupon.eventId || coupon.bundleId ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {coupon.eventId && targetEvent && (
                              <span style={{ fontSize: 13, color: "var(--text)" }}>
                                🎯 Event: {targetEvent.name}
                              </span>
                            )}
                            {coupon.bundleId && targetBundle && (
                              <span style={{ fontSize: 13, color: "var(--gold-soft)" }}>
                                📦 Bundle: {targetBundle.name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                            🌍 Org Wide
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 8px" }}>
                        <span style={{ fontWeight: 600 }}>{coupon.usedCount}</span>
                        <span style={{ color: "var(--muted)" }}> / {coupon.maxUses === null ? "∞" : coupon.maxUses}</span>
                      </td>
                      <td style={{ padding: "14px 8px", color: coupon.expiresAt && new Date(coupon.expiresAt) < new Date() ? "var(--danger)" : "inherit" }}>
                        {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}
                        {coupon.expiresAt && new Date(coupon.expiresAt) < new Date() && " (Expired)"}
                      </td>
                      <td style={{ padding: "14px 8px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
                          <button
                            onClick={() => openEditModal(coupon)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--gold)",
                              cursor: "pointer",
                              padding: 4,
                              display: "flex",
                              alignItems: "center",
                              transition: "opacity 0.2s"
                            }}
                            title="Edit Coupon"
                            className="hover:opacity-80"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                              <path d="m15 5 4 4"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(coupon._id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--danger)",
                              cursor: "pointer",
                              padding: 4,
                              display: "flex",
                              alignItems: "center",
                              transition: "opacity 0.2s"
                            }}
                            title="Delete Coupon"
                            className="hover:opacity-80"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              <line x1="10" x2="10" y1="11" y2="17"/>
                              <line x1="14" x2="14" y1="11" y2="17"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: "#fffdf8",
            border: "1px solid rgba(201, 154, 60, 0.3)",
            borderRadius: 16,
            padding: 28,
            width: "100%",
            maxWidth: 540,
            boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
            color: "var(--text)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1e2030" }}>
                {editingId ? "✏️ Edit Coupon Code" : "🏷️ New Coupon Code"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: 24, cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Coupon Code
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={form.code}
                    onChange={handleChange}
                    required
                    placeholder="e.g. SAVE20"
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text uppercase"
                    style={{ fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Discount Type
                  </label>
                  <select
                    name="discountType"
                    value={form.discountType}
                    onChange={handleChange}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
                    style={{ fontSize: 14, height: 38 }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
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
                    style={{ fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Event Scope (Optional)
                  </label>
                  <select
                    name="eventId"
                    value={form.eventId}
                    onChange={handleChange}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
                    style={{ fontSize: 14, height: 38 }}
                  >
                    <option value="">None (Org Wide / Bundle Only)</option>
                    {events.map((e) => (
                      <option key={e._id} value={e._id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Bundle Scope (Optional)
                  </label>
                  <select
                    name="bundleId"
                    value={form.bundleId}
                    onChange={handleChange}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
                    style={{ fontSize: 14, height: 38 }}
                  >
                    <option value="">None (Org Wide / Event Only)</option>
                    {bundles.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Max Uses Limit (Optional)
                  </label>
                  <input
                    type="number"
                    name="maxUses"
                    value={form.maxUses}
                    onChange={handleChange}
                    min={1}
                    placeholder="Unlimited"
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
                    style={{ fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Expiration Date (Optional)
                  </label>
                  <input
                    type="date"
                    name="expiresAt"
                    value={form.expiresAt}
                    onChange={handleChange}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-ink-text"
                    style={{ fontSize: 14, height: 38 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold"
                  style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(0,0,0,0.15)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-gold px-5 py-2 text-sm font-bold text-ink hover:bg-gold-soft disabled:opacity-60"
                >
                  {submitting ? "Saving…" : (editingId ? "Save Changes" : "Create Coupon")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
