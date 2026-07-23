import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../api/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
} from "recharts";

const formatPKR = (value) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
};

const Analytics = () => {
  const { orgSlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    apiClient
      .get(`/o/${orgSlug}/analytics`)
      .then(({ data }) => {
        if (!cancelled) setData(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (loading) {
    return (
      <div className="mx-auto" style={{ maxWidth: 1100, padding: "40px 0" }}>
        <p style={{ color: "var(--muted)" }}>Loading analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto" style={{ maxWidth: 600, padding: "40px 0" }}>
        <div className="card">
          <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Access denied</h3>
          <p>{error}</p>
          <Link to={`/o/${orgSlug}/dashboard`} style={{ color: "var(--gold)" }}>
            &larr; Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, bookingsPerEvent, recentBookings, revenueByDay } = data;

  return (
    <div className="analytics-page mx-auto" style={{ maxWidth: 1100 }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/dashboard`} style={{ color: "var(--gold-soft)" }}>
          &larr; Back to dashboard
        </Link>
      </p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h1
          style={{
            color: "var(--paper)",
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 40,
            fontWeight: 400,
          }}
        >
          Analytics
        </h1>
        <span className="badge">Last 30 days</span>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: 32, marginTop: 0 }}>
        Performance overview for this organization.
      </p>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard label="Total Bookings" value={metrics.totalBookings} />
        <StatCard label="Ticket Sales Revenue" value={formatPKR(metrics.totalRevenue)} />
        <StatCard label="Refund Revenue (10%)" value={formatPKR(metrics.totalOrgRevenue)} />
        <StatCard label="Net Revenue" value={formatPKR(metrics.netRevenue)} />
        <StatCard label="Tickets Sold" value={metrics.totalTicketsSold} />
        <StatCard label="Events" value={metrics.totalEvents} />
        <StatCard label="Venues" value={metrics.totalVenues} />
        <StatCard label="Refunds Issued" value={metrics.totalRefunds} />
        <StatCard label="Refunded Amount" value={formatPKR(metrics.totalRefundedAmount)} />
      </div>

      {/* ── Revenue over time ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
          Revenue — last 30 days
        </h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <AreaChart data={revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#8a8070" }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return d.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
                }}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#8a8070" }}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
              />
              <Tooltip
                formatter={(value) => [formatPKR(value), "Revenue"]}
                labelFormatter={(label) => formatDate(label)}
                contentStyle={{
                  background: "#fffdf8",
                  border: "1px solid #d8d0bd",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              <Legend />
              <Area type="monotone" dataKey="revenue" name="Sales revenue" stroke="#c99a3c" fill="#c99a3c" fillOpacity={0.25} strokeWidth={3} />
              <Area type="monotone" dataKey="refundedAmount" name="Refunded amount" stroke="#dc2626" fill="#dc2626" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* ── Bookings per event ───────────────────────────────── */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
            Bookings per event
          </h3>
          {bookingsPerEvent.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No bookings yet.</p>
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={bookingsPerEvent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#8a8070" }} />
                  <YAxis
                    type="category"
                    dataKey="eventName"
                    tick={{ fontSize: 11, fill: "#8a8070" }}
                    width={100}
                    tickFormatter={(v) => (v.length > 14 ? v.slice(0, 12) + "…" : v)}
                  />
                  <Tooltip
                    formatter={(value, name) => [value, "Bookings"]}
                    contentStyle={{
                      background: "#fffdf8",
                      border: "1px solid #d8d0bd",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="count" fill="#192436" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Ticket type breakdown ────────────────────────────── */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
            Tickets sold per event
          </h3>
          {bookingsPerEvent.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No tickets sold yet.</p>
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={bookingsPerEvent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#8a8070" }} />
                  <YAxis
                    type="category"
                    dataKey="eventName"
                    tick={{ fontSize: 11, fill: "#8a8070" }}
                    width={100}
                    tickFormatter={(v) => (v.length > 14 ? v.slice(0, 12) + "…" : v)}
                  />
                  <Tooltip
                    formatter={(value) => [value, "Tickets"]}
                    contentStyle={{
                      background: "#fffdf8",
                      border: "1px solid #d8d0bd",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="revenue" fill="#c99a3c" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent bookings table ─────────────────────────────── */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
          Recent bookings
        </h3>
        {recentBookings.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>No bookings yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e8e0d0" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Buyer
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Event
                  </th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Amount
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Status
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #f0e8d8" }}>
                    <td style={{ padding: "10px 6px" }}>
                      <div style={{ fontWeight: 600 }}>{b.buyerName}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{b.buyerEmail}</div>
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      {b.eventName}
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {b.eventDate ? formatDate(b.eventDate) : ""}
                      </div>
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 600 }}>
                      {formatPKR(b.totalAmount)}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <span
                        className="badge"
                        style={{
                          background:
                            b.status === "confirmed"
                              ? "#e6f4ea"
                              : b.status === "pending"
                                ? "#fff8e1"
                                : "#fce8e6",
                          color:
                            b.status === "confirmed"
                              ? "#1e7e34"
                              : b.status === "pending"
                                ? "#b45309"
                                : "#c01e1e",
                        }}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 6px", color: "var(--muted)", fontSize: 13 }}>
                      {formatDate(b.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Stat card component ──────────────────────────────────────── */
const StatCard = ({ label, value }) => (
  <div className="card" style={{ padding: "18px 20px" }}>
    <p
      style={{
        margin: "0 0 4px",
        fontSize: 12,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontWeight: 600,
      }}
    >
      {label}
    </p>
    <p
      style={{
        margin: 0,
        fontSize: 26,
        fontWeight: 700,
        color: "var(--text)",
        fontFamily: "var(--font-display)",
        letterSpacing: "0.02em",
      }}
    >
      {value}
    </p>
  </div>
);

export default Analytics;
