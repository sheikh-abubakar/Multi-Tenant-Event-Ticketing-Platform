import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import apiClient from "../api/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const formatUSD = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const Analytics = () => {
  const { orgSlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Scan modal & action states
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const scannerRef = useRef(null);

  const fetchAnalytics = () => {
    apiClient
      .get(`/o/${orgSlug}/analytics`)
      .then(({ data }) => {
        setData(data);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Could not load analytics.");
      });
  };

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

  // Initialise/Clean up scanner when modal opens/closes
  useEffect(() => {
    if (isScanOpen) {
      setScanResult(null);
      setScanError("");

      // Delay briefly to allow modal DOM rendering
      const timer = setTimeout(() => {
        const scanner = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
          },
          /* verbose= */ false
        );

        scanner.render(
          async (decodedText) => {
            // Success handler: parse the text (which could be the confirmationCode or the booking ID)
            scanner.clear();
            handleScannedCode(decodedText);
          },
          (errorMessage) => {
            // Verbose logging handler (ignored to avoid flood)
          }
        );

        scannerRef.current = scanner;
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          try {
            scannerRef.current.clear();
          } catch (e) {
            console.error("Error clearing scanner:", e);
          }
        }
      };
    }
  }, [isScanOpen]);

  const handleScannedCode = async (code) => {
    setVerifying(true);
    setScanError("");
    setScanResult(null);

    try {
      // Determine if code is Mongo ID or URL containing it or JSON object
      let bookingId = code.trim();
      try {
        const parsed = JSON.parse(bookingId);
        if (parsed && parsed.bookingId) {
          bookingId = parsed.bookingId;
        }
      } catch (e) {
        // Not a JSON string, continue with other patterns
        if (bookingId.includes("/bookings/")) {
          const parts = bookingId.split("/bookings/");
          bookingId = parts[parts.length - 1].split(/[?#]/)[0];
        }
      }

      // Call verification API
      const response = await apiClient.post(`/o/${orgSlug}/bookings/${bookingId}/verify`);
      setScanResult({
        success: true,
        message: response.data.message || "Ticket verified successfully!",
        booking: response.data.booking,
      });

      // Refresh recent bookings to show updated status
      fetchAnalytics();
    } catch (err) {
      setScanResult({
        success: false,
        message: err.response?.data?.message || "Verification failed. Invalid or expired ticket.",
      });
    } finally {
      setVerifying(false);
    }
  };

  // Inline simulation handler (no camera required)
  const handleManualVerify = async (bookingId) => {
    try {
      await apiClient.post(`/o/${orgSlug}/bookings/${bookingId}/verify`);
      fetchAnalytics();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to verify booking");
    }
  };

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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
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

        {/* Scan Barcode Button */}
        <button
          onClick={() => setIsScanOpen(true)}
          className="btn btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: "var(--gold)",
            color: "var(--bg)",
            fontWeight: 700,
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(232, 191, 108, 0.2)",
          }}
        >
          📷 Scan Ticket Barcode
        </button>
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
        <StatCard label="Ticket Sales Revenue" value={formatUSD(metrics.totalRevenue)} />
        <StatCard label="Refund Revenue (10%)" value={formatUSD(metrics.totalOrgRevenue)} />
        <StatCard label="Net Revenue" value={formatUSD(metrics.netRevenue)} />
        <StatCard label="Tickets Sold" value={metrics.totalTicketsSold} />
        <StatCard label="Events" value={metrics.totalEvents} />
        <StatCard label="Venues" value={metrics.totalVenues} />
        <StatCard label="Refunds Issued" value={metrics.totalRefunds} />
        <StatCard label="Refunded Amount" value={formatUSD(metrics.totalRefundedAmount)} />
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
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                }}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#8a8070" }}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
              />
              <Tooltip
                formatter={(value) => [formatUSD(value), "Revenue"]}
                labelFormatter={(label) => formatDate(label)}
                contentStyle={{
                  background: "#fffdf8",
                  border: "1px solid #e8e0d0",
                  borderRadius: 6,
                  color: "#333",
                }}
              />
              <Area type="monotone" dataKey="revenue" stroke="var(--gold)" fill="rgba(232, 191, 108, 0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Recent bookings ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
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
                    Ticket Status
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
                      {formatUSD(b.totalAmount)}
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
                    <td style={{ padding: "10px 6px" }}>
                      {b.verified ? (
                        <span
                          className="badge"
                          style={{ background: "#e6f4ea", color: "#1e7e34" }}
                          title={`Verified at ${new Date(b.verifiedAt).toLocaleString()}`}
                        >
                          ✓ Verified
                        </span>
                      ) : b.status === "confirmed" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="badge" style={{ background: "#fff8e1", color: "#b45309" }}>
                            Unverified
                          </span>
                          <button
                            onClick={() => handleManualVerify(b.id)}
                            style={{
                              border: "none",
                              background: "rgba(22, 163, 74, 0.1)",
                              color: "#16a34a",
                              cursor: "pointer",
                              padding: "4px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            Verify
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
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

      {/* ── Scan Ticket Modal ── */}
      {isScanOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: "var(--card-bg, #fffdf8)",
              borderRadius: 12,
              overflow: "hidden",
              padding: 24,
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              color: "#333",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "var(--text)" }}>Ticket Scanner</h3>
              <button
                onClick={() => setIsScanOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#999",
                }}
              >
                &times;
              </button>
            </div>

            {/* QR Scanner Container */}
            {!scanResult && !verifying && (
              <div
                id="qr-reader"
                style={{
                  width: "100%",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid #e8e0d0",
                }}
              />
            )}

            {/* Verifying Spinner */}
            {verifying && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <p>Verifying ticket authenticity...</p>
              </div>
            )}

            {/* Scanning Results */}
            {scanResult && (
              <div
                style={{
                  padding: 20,
                  borderRadius: 8,
                  textAlign: "center",
                  backgroundColor: scanResult.success ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)",
                  color: scanResult.success ? "#16a34a" : "#dc2626",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>
                  {scanResult.success ? "✅" : "❌"}
                </div>
                <h4 style={{ margin: "0 0 8px", fontWeight: 700 }}>
                  {scanResult.success ? "Verified!" : "Invalid Ticket"}
                </h4>
                <p style={{ margin: 0, fontSize: 14 }}>{scanResult.message}</p>

                {scanResult.success && scanResult.booking && (
                  <div
                    style={{
                      marginTop: 16,
                      textAlign: "left",
                      borderTop: "1px solid rgba(22, 163, 74, 0.2)",
                      paddingTop: 12,
                      fontSize: 13,
                      color: "#444",
                    }}
                  >
                    <div><strong>Buyer:</strong> {scanResult.booking.buyerName}</div>
                    <div><strong>Email:</strong> {scanResult.booking.buyerEmail}</div>
                    <div><strong>Code:</strong> {scanResult.booking.confirmationCode}</div>
                  </div>
                )}

                <button
                  onClick={() => setScanResult(null)}
                  className="btn btn-secondary"
                  style={{
                    marginTop: 20,
                    backgroundColor: "#e8e0d0",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Scan Next Ticket
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setIsScanOpen(false)}
                className="btn btn-secondary"
                style={{
                  backgroundColor: "#e8e0d0",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}
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
