import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import jsQR from "jsqr";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import apiClient from "../api/client";
import { cachedGet } from "../api/requestCache";
import { Ticket, DollarSign, Calendar, MapPin, RefreshCw, Layers, Eye, X, Mail, UserRound, CreditCard, Armchair } from "lucide-react";
import { io } from "socket.io-client";
import {
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

const formatDateTime = (dateStr) => dateStr
  ? new Date(dateStr).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
  : "Not available";

const Analytics = () => {
  const { orgSlug } = useParams();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Scan modal & action states
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [scanTab, setScanTab] = useState("camera"); // "camera" | "image"

  // Event specific analytics states
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventAnalyticsData, setEventAnalyticsData] = useState(null);
  const [loadingEventAnalytics, setLoadingEventAnalytics] = useState(false);
  const [eventAnalyticsError, setEventAnalyticsError] = useState("");
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [bookingDetailError, setBookingDetailError] = useState("");

  const html5QrcodeRef = useRef(null);

  const fetchAnalytics = useCallback(() => {
    apiClient
      .get(`/o/${orgSlug}/analytics`)
      .then(({ data }) => {
        setData(data);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Could not load analytics.");
      });
  }, [orgSlug]);

  const fetchBookingDetail = useCallback((bookingId) => {
    if (!bookingId) return;
    setBookingDetailLoading(true);
    setBookingDetailError("");
    apiClient.get(`/o/${orgSlug}/analytics/bookings/${bookingId}/details`)
      .then(({ data: response }) => setBookingDetail(response.detail))
      .catch((err) => setBookingDetailError(err.response?.data?.message || "Could not load booking details."))
      .finally(() => setBookingDetailLoading(false));
  }, [orgSlug]);

  const openBookingDetail = (bookingId) => {
    setSelectedBookingId(bookingId);
    setBookingDetail(null);
    fetchBookingDetail(bookingId);
  };

  const closeBookingDetail = useCallback(() => {
    setSelectedBookingId(null);
    setBookingDetail(null);
    setBookingDetailError("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    // Fetch org wide analytics and org events list (cached for 30s)
    Promise.all([
      cachedGet(`/o/${orgSlug}/analytics`),
      cachedGet(`/o/${orgSlug}/events`),
    ])
      .then(([analyticsRes, eventsRes]) => {
        if (!cancelled) {
          setData(analyticsRes.data);
          setEvents(eventsRes.data.events || []);
        }
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return undefined;
    const socketUrl = (import.meta.env.VITE_SOCKET_URL || apiClient.defaults.baseURL.replace(/\/api$/, "")).replace(/\/$/, "");
    const socket = io(socketUrl, { auth: { token }, withCredentials: true, transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("analytics:join", { orgSlug }));
    socket.on("analytics:booking-updated", () => {
      fetchAnalytics();
      if (selectedBookingId) fetchBookingDetail(selectedBookingId);
    });
    return () => socket.disconnect();
  }, [orgSlug, fetchAnalytics, fetchBookingDetail, selectedBookingId]);

  useEffect(() => {
    if (!selectedBookingId) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && closeBookingDetail();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedBookingId, closeBookingDetail]);

  // Fetch event specific analytics
  const fetchEventAnalytics = (eventId) => {
    setLoadingEventAnalytics(true);
    setEventAnalyticsError("");
    setEventAnalyticsData(null);

    apiClient
      .get(`/o/${orgSlug}/analytics/events/${eventId}`)
      .then(({ data }) => {
        setEventAnalyticsData(data);
      })
      .catch((err) => {
        setEventAnalyticsError(err.response?.data?.message || "Could not load event analytics.");
      })
      .finally(() => {
        setLoadingEventAnalytics(false);
      });
  };

  useEffect(() => {
    if (selectedEventId) {
      fetchEventAnalytics(selectedEventId);
    } else {
      setEventAnalyticsData(null);
    }
  }, [selectedEventId]);

  // PDF report downloader
  const downloadEventReport = async () => {
    const element = document.getElementById("event-report-content");
    if (!element || !eventAnalyticsData) return;

    setIsPdfGenerating(true);

    try {
      const canvas = await html2canvas(element, {
        scale: 2, // high resolution
        useCORS: true,
        backgroundColor: "#fffdf8",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${eventAnalyticsData.event.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_analytics_report.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF report.");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // ── Camera helpers ────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError("");
    setScanResult(null);
    setCameraActive(false);

    try {
      const qrCode = new Html5Qrcode("qr-reader-element");
      html5QrcodeRef.current = qrCode;

      await qrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          qrCode.stop().catch(() => {});
          setCameraActive(false);
          handleScannedCode(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
        setCameraError("Camera permission denied. Please allow camera access in your browser settings and try again.");
      } else if (msg.toLowerCase().includes("https") || msg.toLowerCase().includes("insecure")) {
        setCameraError("Camera access requires a secure connection (HTTPS). Try the image upload option instead.");
      } else {
        setCameraError("Could not start camera: " + msg + ". Try the image upload option instead.");
      }
      console.error("Camera start error:", err);
    }
  }, [orgSlug]);

  const stopCamera = useCallback(async () => {
    if (html5QrcodeRef.current) {
      try {
        const state = html5QrcodeRef.current.getState();
        if (state === 2 || state === 3) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (e) {
        // Ignore cleanup errors
      }
      html5QrcodeRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Clean up camera when modal closes
  useEffect(() => {
    if (!isScanOpen) {
      stopCamera();
      setScanResult(null);
      setCameraError("");
      setScanTab("camera");
    }
  }, [isScanOpen, stopCamera]);

  // Auto-start camera when camera tab becomes active
  useEffect(() => {
    if (isScanOpen && scanTab === "camera" && !scanResult) {
      const t = setTimeout(() => startCamera(), 400);
      return () => {
        clearTimeout(t);
        stopCamera();
      };
    }
    if (scanTab === "image") {
      stopCamera();
    }
  }, [isScanOpen, scanTab, scanResult]);

  const handleScannedCode = async (code) => {
    setVerifying(true);
    setCameraError("");
    setScanResult(null);

    try {
      let bookingId = code.trim();
      try {
        const parsed = JSON.parse(bookingId);
        if (parsed && parsed.bookingId) {
          bookingId = parsed.bookingId;
        }
      } catch (e) {
        if (bookingId.includes("/bookings/")) {
          const parts = bookingId.split("/bookings/");
          bookingId = parts[parts.length - 1].split(/[?#]/)[0];
        }
      }

      const response = await apiClient.post(`/o/${orgSlug}/bookings/${bookingId}/verify`);
      setScanResult({
        success: true,
        message: response.data.message || "Ticket verified successfully!",
        booking: response.data.booking,
      });

      fetchAnalytics();
      if (selectedEventId) {
        fetchEventAnalytics(selectedEventId);
      }
    } catch (err) {
      setScanResult({
        success: false,
        message: err.response?.data?.message || "Verification failed. Invalid or expired ticket.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleManualVerify = async (bookingId) => {
    try {
      await apiClient.post(`/o/${orgSlug}/bookings/${bookingId}/verify`);
      fetchAnalytics();
      if (selectedEventId) {
        fetchEventAnalytics(selectedEventId);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to verify booking");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto" style={{ maxWidth: 1100, padding: "40px 0" }}>
        {/* Title skeleton */}
        <div style={{ height: 40, width: 200, borderRadius: 8, background: "rgba(255,255,255,0.06)", marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 16, width: 280, borderRadius: 6, background: "rgba(255,255,255,0.04)", marginBottom: 32, animation: "pulse 1.5s ease-in-out infinite" }} />

        {/* Stat cards skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ height: 90, borderRadius: 12, background: "rgba(255,255,255,0.06)", animation: `pulse 1.5s ease-in-out ${i * 0.08}s infinite` }} />
          ))}
        </div>

        {/* Chart skeleton */}
        <div style={{ height: 300, borderRadius: 12, background: "rgba(255,255,255,0.06)", marginBottom: 24, animation: "pulse 1.5s ease-in-out infinite" }} />

        {/* Table skeleton */}
        <div style={{ height: 200, borderRadius: 12, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s ease-in-out infinite" }} />

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
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
        <StatCard label="Seat Swaps Approved" value={metrics.approvedSwaps || 0} />
      </div>

      {/* ── Event List section ── */}
      <div className="card" style={{ marginBottom: 24, padding: "20px 24px" }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, color: "var(--text)" }}>
          🗓️ Event Analytics Reports
        </h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          Select an event to view detailed statistics, check-in statuses, and download a professional PDF analytics report.
        </p>

        {events.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No events found.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {events.map((evt) => {
              const bookingStats = bookingsPerEvent.find((b) => b.eventId === evt._id) || { count: 0, revenue: 0 };
              return (
                <div
                  key={evt._id}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "transform 0.2s, border-color 0.2s",
                  }}
                  className="event-card-hover"
                >
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                      {evt.name}
                    </h4>
                    <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 12px" }}>
                      📅 {new Date(evt.dateTime).toLocaleDateString()} at {evt.venueId?.name || "Venue"}
                    </p>
                    <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>Sales</span>
                        <div style={{ fontWeight: 700, color: "var(--text)" }}>{bookingStats.count} ticket(s)</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>Revenue</span>
                        <div style={{ fontWeight: 700, color: "var(--gold-soft)" }}>{formatUSD(bookingStats.revenue)}</div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEventId(evt._id)}
                    className="btn btn-secondary"
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(232, 191, 108, 0.1)",
                      border: "1px solid rgba(232, 191, 108, 0.2)",
                      color: "var(--gold-soft)",
                      fontWeight: 600,
                      padding: "8px 0",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    View Detailed Analytics
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Action
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
                      {b.isBundle ? (
                        <span
                          className="badge"
                          style={{
                            background: "rgba(201, 154, 60, 0.15)",
                            color: "var(--gold-soft)",
                            border: "1px solid rgba(201, 154, 60, 0.3)",
                          }}
                        >
                          Bundle
                        </span>
                      ) : b.verified ? (
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
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => openBookingDetail(b.detailBookingId || b.id)}
                        style={{ border: "1px solid rgba(201,154,60,.55)", background: "rgba(201,154,60,.12)", color: "var(--gold-soft)", borderRadius: 6, padding: "6px 9px", cursor: "pointer", fontWeight: 700, fontSize: 12, display: "inline-flex", gap: 5, alignItems: "center" }}
                      >
                        <Eye size={14} /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Event Details Modal / Report view ── */}
      {selectedBookingId && (
        <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeBookingDetail()} style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(6,8,20,.72)", display: "flex", justifyContent: "center", alignItems: "center", padding: 18 }}>
          <section role="dialog" aria-modal="true" aria-label="Booking details" style={{ width: "min(940px, 100%)", maxHeight: "90vh", overflowY: "auto", borderRadius: 14, background: "#fffdf8", color: "#1e2030", boxShadow: "0 25px 70px rgba(0,0,0,.45)", borderTop: "4px solid #c99a3c" }}>
            <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #e8e0d0", position: "sticky", top: 0, background: "#fffdf8", zIndex: 1 }}><div><p style={{ margin: 0, fontSize: 11, letterSpacing: ".12em", color: "#96701e", fontWeight: 800 }}>LIVE BOOKING RECORD</p><h2 style={{ margin: "4px 0 0", fontSize: 22 }}>Buyer booking details</h2></div><button type="button" aria-label="Close booking details" onClick={closeBookingDetail} style={{ border: "1px solid #d9cfbc", background: "transparent", borderRadius: 6, padding: 8, cursor: "pointer", color: "#1e2030" }}><X size={20} /></button></header>
            <div style={{ padding: 24 }}>
              {bookingDetailLoading && <p style={{ color: "#6b6054" }}>Loading current booking information…</p>}
              {bookingDetailError && <div style={{ background: "#fce8e6", color: "#b42318", padding: 12, borderRadius: 7 }}>{bookingDetailError}</div>}
              {bookingDetail && <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}><article style={{ background: "#f7f2e7", padding: 14, borderRadius: 9 }}><UserRound size={17} color="#a47620" /><small style={{ display: "block", color: "#6b6054", marginTop: 6 }}>BUYER</small><strong>{bookingDetail.buyer?.name || "Buyer"}</strong><div style={{ color: "#5d5668", fontSize: 13, overflowWrap: "anywhere" }}><Mail size={12} /> {bookingDetail.buyer?.email}</div></article><article style={{ background: "#f7f2e7", padding: 14, borderRadius: 9 }}><CreditCard size={17} color="#a47620" /><small style={{ display: "block", color: "#6b6054", marginTop: 6 }}>ORDER TYPE</small><strong>{bookingDetail.isBundle ? "Event bundle" : "Event booking"}</strong><div style={{ color: "#5d5668", fontSize: 13 }}>{bookingDetail.bookings.length} event record{bookingDetail.bookings.length === 1 ? "" : "s"}</div></article></div>
                {bookingDetail.bookings.map((booking) => {
                  const event = booking.eventId || {}; const venue = event.venueId || {}; const requests = bookingDetail.seatChanges.filter((request) => String(request.bookingId) === String(booking._id));
                  return <article key={booking._id} style={{ border: "1px solid #e8e0d0", borderRadius: 10, padding: 18, marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><h3 style={{ margin: 0 }}>{event.name || booking.eventName}</h3><p style={{ margin: "5px 0", color: "#6b6054" }}><Calendar size={14} /> {formatDateTime(booking.eventDateTime || event.dateTime)}</p><p style={{ margin: 0, color: "#6b6054" }}><MapPin size={14} /> {venue.name || "Venue unavailable"}{[venue.address, venue.city].filter(Boolean).length ? ` — ${[venue.address, venue.city].filter(Boolean).join(", ")}` : ""}</p></div><div style={{ textAlign: "right" }}><span className="badge" style={{ background: booking.status === "confirmed" ? "#e6f4ea" : "#fff8e1", color: booking.status === "confirmed" ? "#1e7e34" : "#b45309" }}>{booking.status}</span><strong style={{ display: "block", marginTop: 8 }}>{formatUSD(booking.totalAmount)}</strong><small style={{ color: "#6b6054" }}>{booking.paymentStatus}{booking.refundInfo ? ` · refunded via ${booking.refundInfo.method}` : ""}</small></div></div><div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #eee6d8" }}><strong style={{ fontSize: 13 }}>Confirmation: {booking.confirmationCode}</strong><div style={{ display: "grid", gap: 6, marginTop: 9 }}>{booking.items?.map((item, index) => <div key={`${item.ticketTypeName}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#4b4652" }}><span>{item.ticketTypeName} × {item.quantity}</span><strong>{formatUSD(item.lineTotal)}</strong></div>)}</div></div><div style={{ marginTop: 14 }}><strong style={{ fontSize: 13 }}><Armchair size={15} /> Current seats</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>{booking.selectedSeats?.length ? booking.selectedSeats.map((seat) => <span key={`${seat.blockId}-${seat.seatId}`} style={{ background: "#e6f4ea", color: "#176b31", borderRadius: 20, padding: "5px 9px", fontSize: 12, fontWeight: 700 }}>{seat.sectionName || "Section"} · {seat.seatName}</span>) : <span style={{ color: "#6b6054", fontSize: 13 }}>No reserved seats</span>}</div></div>{requests.length > 0 && <div style={{ marginTop: 16, background: "#f7f2e7", borderRadius: 8, padding: 13 }}><strong style={{ fontSize: 13 }}>Seat-change history</strong>{requests.map((request) => <div key={request._id} style={{ marginTop: 10, fontSize: 13, color: "#4b4652" }}><span style={{ fontWeight: 800, textTransform: "uppercase", color: request.status === "approved" ? "#176b31" : request.status === "rejected" ? "#b42318" : "#a47620" }}>{request.status}</span>{" · "}{request.oldSeat?.sectionName || "Section"} {request.oldSeat?.seatName} → {request.newSeat?.sectionName || "Section"} {request.newSeat?.seatName}<small style={{ display: "block", color: "#6b6054" }}>Payment: {request.paymentStatus}{Number(request.priceDifference) ? ` · adjustment ${formatUSD(request.priceDifference)}` : ""} · {formatDateTime(request.updatedAt)}</small></div>)}</div>}</article>;
                })}
              </>}
            </div>
          </section>
        </div>
      )}

      {selectedEventId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 900,
              maxHeight: "90vh",
              overflowY: "auto",
              backgroundColor: "#fffdf8",
              borderRadius: 16,
              color: "#333",
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e8e0d0", paddingBottom: 16, marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
                📊 Event Analytics Detail
              </h2>
              <div style={{ display: "flex", gap: 10 }}>
                {eventAnalyticsData && (
                  <button
                    onClick={downloadEventReport}
                    disabled={isPdfGenerating}
                    style={{
                      backgroundColor: "var(--gold, #c99a3c)",
                      color: "#fff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {isPdfGenerating ? "Generating PDF..." : "📥 Download Report (PDF)"}
                  </button>
                )}
                <button
                  onClick={() => setSelectedEventId(null)}
                  style={{
                    backgroundColor: "#e8e0d0",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {loadingEventAnalytics && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <p>Loading event analytics details...</p>
              </div>
            )}

            {eventAnalyticsError && (
              <div style={{ padding: 20, color: "#dc2626", textAlign: "center" }}>
                {eventAnalyticsError}
              </div>
            )}

            {/* Printable Report Content */}
            {eventAnalyticsData && (
              <div id="event-report-content" style={{ padding: 20, backgroundColor: "#fffdf8", borderRadius: 8 }}>
                {/* Event Summary Details */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--gold)", paddingBottom: 16, marginBottom: 24 }}>
                  <div>
                    <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "#1a1a1a" }}>
                      {eventAnalyticsData.event.name}
                    </h1>
                    <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
                      📍 <strong>Venue:</strong> {eventAnalyticsData.event.venueName}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "#666" }}>
                      📅 <strong>Date:</strong> {new Date(eventAnalyticsData.event.dateTime).toLocaleString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", fontWeight: 700 }}>Generated On</span>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{new Date().toLocaleDateString()}</div>
                  </div>
                </div>

                {/* Event Core Stats Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                    gap: 16,
                    marginBottom: 32,
                  }}
                >
                  <div style={{ padding: "16px 12px", border: "1px solid #e8e0d0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Revenue</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gold)" }}>{formatUSD(eventAnalyticsData.metrics.totalRevenue)}</div>
                  </div>
                  <div style={{ padding: "16px 12px", border: "1px solid #e8e0d0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Bookings</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#333" }}>{eventAnalyticsData.metrics.totalBookings}</div>
                  </div>
                  <div style={{ padding: "16px 12px", border: "1px solid #e8e0d0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Tickets Sold</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#333" }}>{eventAnalyticsData.metrics.totalTicketsSold}</div>
                  </div>
                  <div style={{ padding: "16px 12px", border: "1px solid #e8e0d0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Verified</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{eventAnalyticsData.metrics.verifiedTickets}</div>
                  </div>
                  <div style={{ padding: "16px 12px", border: "1px solid #e8e0d0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Unverified</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#b45309" }}>{eventAnalyticsData.metrics.unverifiedTickets}</div>
                  </div>
                  <div style={{ padding: "16px 12px", border: "1px solid #e8e0d0", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Seat Swaps</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gold)" }}>{eventAnalyticsData.metrics.approvedSwaps || 0}</div>
                  </div>
                </div>

                {/* Event specific chart */}
                <div style={{ border: "1px solid #e8e0d0", borderRadius: 10, padding: 18, marginBottom: 32 }}>
                  <h4 style={{ margin: "0 0 16px", color: "#1a1a1a", fontSize: 15 }}>Sales Performance (Last 30 Days)</h4>
                  <div style={{ width: "100%", height: 200 }}>
                    <ResponsiveContainer>
                      <AreaChart data={eventAnalyticsData.revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#8a8070" }}
                          tickFormatter={(v) => {
                            const d = new Date(v);
                            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          }}
                          interval={4}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#8a8070" }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="var(--gold)" fill="rgba(232, 191, 108, 0.1)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent bookings of this event */}
                <div>
                  <h4 style={{ margin: "0 0 12px", color: "#1a1a1a", fontSize: 15 }}>Recent Event Attendees</h4>
                  {eventAnalyticsData.recentBookings.length === 0 ? (
                    <p style={{ color: "#666", fontSize: 13 }}>No bookings recorded for this event yet.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e8e0d0" }}>
                          <th style={{ textAlign: "left", padding: "6px 4px", color: "#666" }}>Attendee</th>
                          <th style={{ textAlign: "left", padding: "6px 4px", color: "#666" }}>Seats</th>
                          <th style={{ textAlign: "right", padding: "6px 4px", color: "#666" }}>Amount</th>
                          <th style={{ textAlign: "center", padding: "6px 4px", color: "#666" }}>Status</th>
                          <th style={{ textAlign: "center", padding: "6px 4px", color: "#666" }}>Check-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventAnalyticsData.recentBookings.map((b) => (
                          <tr key={b.id} style={{ borderBottom: "1px solid #f0e8d8" }}>
                            <td style={{ padding: "8px 4px" }}>
                              <div style={{ fontWeight: 600, color: "#333" }}>{b.buyerName}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{b.buyerEmail}</div>
                            </td>
                            <td style={{ padding: "8px 4px", color: "#333" }}>
                              <div>
                                {b.selectedSeats && b.selectedSeats.length > 0 ? (
                                  b.selectedSeats.map((s) => `${s.seatName} (${s.sectionName || "General"})`).join(", ")
                                ) : (
                                  "—"
                                )}
                              </div>
                              {b.isSwapped && (
                                <span style={{ fontSize: 9, background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: 4, display: "inline-block", marginTop: 4, fontWeight: 700 }}>
                                  🔄 Seat Swapped
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, color: "#333" }}>
                              {formatUSD(b.totalAmount)}
                            </td>
                            <td style={{ padding: "8px 4px", textAlign: "center" }}>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: b.status === "confirmed" ? "#e6f4ea" : "#fce8e6", color: b.status === "confirmed" ? "#1e7e34" : "#c01e1e" }}>
                                {b.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 4px", textAlign: "center" }}>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: b.verified ? "#e6f4ea" : "#fff8e1", color: b.verified ? "#1e7e34" : "#b45309" }}>
                                {b.verified ? "Verified" : "Pending"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scan Ticket Modal ── */}
      {isScanOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
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
              maxWidth: 480,
              backgroundColor: "#fffdf8",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              color: "#333",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#1a1a1a", fontSize: 18, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                🎟️ Ticket Scanner
              </h3>
              <button
                onClick={() => setIsScanOpen(false)}
                style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "#999", lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            {/* Tabs */}
            {!scanResult && !verifying && (
              <div style={{ display: "flex", borderBottom: "2px solid #e8e0d0", marginBottom: 20 }}>
                {["camera", "image"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setScanTab(tab)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      border: "none",
                      background: "transparent",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                      color: scanTab === tab ? "var(--gold, #c99a3c)" : "#888",
                      borderBottom: scanTab === tab ? "2px solid var(--gold, #c99a3c)" : "2px solid transparent",
                      marginBottom: -2,
                      transition: "all 0.2s",
                    }}
                  >
                    {tab === "camera" ? "📷 Use Camera" : "🖼️ Upload Image"}
                  </button>
                ))}
              </div>
            )}

            {/* Camera Tab */}
            {scanTab === "camera" && !scanResult && !verifying && (
              <div>
                <div
                  id="qr-reader-element"
                  style={{
                    width: "100%",
                    minHeight: 260,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#111",
                    border: "2px solid #e8e0d0",
                  }}
                />

                {cameraError && (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#fce8e6", borderRadius: 8, fontSize: 13, color: "#c01e1e" }}>
                    ⚠️ {cameraError}
                  </div>
                )}

                {!cameraActive && !cameraError && (
                  <p style={{ textAlign: "center", color: "#888", fontSize: 13, margin: "12px 0 0" }}>
                    Starting camera…
                  </p>
                )}

                {cameraActive && (
                  <p style={{ textAlign: "center", color: "#888", fontSize: 13, margin: "12px 0 0" }}>
                    📷 Point your camera at the QR code on the ticket
                  </p>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  {!cameraActive && (
                    <button
                      onClick={startCamera}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        background: "var(--gold, #c99a3c)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      Start Camera
                    </button>
                  )}
                  {cameraActive && (
                    <button
                      onClick={stopCamera}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        background: "#fce8e6",
                        color: "#c01e1e",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      Stop Camera
                    </button>
                  )}
                  <button
                    onClick={() => setIsScanOpen(false)}
                    style={{ padding: "10px 18px", background: "#e8e0d0", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Image Upload Tab */}
            {scanTab === "image" && !scanResult && !verifying && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    border: "2px dashed #c8b87a",
                    borderRadius: 10,
                    padding: "30px 20px",
                    background: "rgba(232,191,108,0.05)",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                  <p style={{ color: "#666", fontSize: 14, margin: 0 }}>
                    Select an image containing the QR code
                  </p>
                </div>
                <label
                  htmlFor="qr-image-upload"
                  style={{
                    display: "inline-block",
                    padding: "12px 24px",
                    background: "var(--gold, #c99a3c)",
                    color: "#fff",
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Choose Image
                </label>
                <input
                  id="qr-image-upload"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setVerifying(true);
                    setScanResult(null);

                    let scanSuccess = false;
                    let scannedResultText = "";

                    const loadImage = (f) => new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = event.target.result;
                      };
                      reader.onerror = reject;
                      reader.readAsDataURL(f);
                    });

                    try {
                      const img = await loadImage(file);
                      
                      // 1. Try decoding with jsQR on various crops/enhancements
                      const decodeWithJsQR = (cropPercent, binarize) => {
                        const canvas = document.createElement("canvas");
                        const cropX = img.width * cropPercent;
                        const cropY = img.height * cropPercent;
                        const cropW = img.width - (cropX * 2);
                        const cropH = img.height - (cropY * 2);
                        canvas.width = cropW;
                        canvas.height = cropH;
                        
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

                        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        if (binarize) {
                          const data = imgData.data;
                          for (let i = 0; i < data.length; i += 4) {
                            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                            const val = gray > 128 ? 255 : 0;
                            data[i] = val;
                            data[i + 1] = val;
                            data[i + 2] = val;
                          }
                          ctx.putImageData(imgData, 0, 0);
                        }

                        const code = jsQR(imgData.data, imgData.width, imgData.height, {
                          inversionAttempts: "both",
                        });
                        return code ? code.data : null;
                      };

                      // Run attempts in sequence of likelihood
                      const attempts = [
                        () => decodeWithJsQR(0, false),      // Raw full image
                        () => decodeWithJsQR(0.05, false),   // 5% crop (light border removal)
                        () => decodeWithJsQR(0.1, false),    // 10% crop (gold card border removal)
                        () => decodeWithJsQR(0.15, false),   // 15% crop (deeper border removal)
                        () => decodeWithJsQR(0.2, false),    // 20% crop
                        () => decodeWithJsQR(0, true),       // Raw binarized
                        () => decodeWithJsQR(0.1, true),     // 10% crop + binarized
                      ];

                      for (const attempt of attempts) {
                        const result = attempt();
                        if (result) {
                          scannedResultText = result;
                          scanSuccess = true;
                          break;
                        }
                      }

                      // 2. Fallback to Html5Qrcode (with a properly sized off-screen container)
                      if (!scanSuccess) {
                        const tempId = "qr-file-reader-" + Date.now();
                        const div = document.createElement("div");
                        div.id = tempId;
                        div.style.position = "absolute";
                        div.style.left = "-9999px";
                        div.style.top = "-9999px";
                        div.style.width = "800px";
                        div.style.height = "800px";
                        document.body.appendChild(div);

                        const scanner = new Html5Qrcode(tempId);
                        try {
                          // Try raw scan
                          try {
                            scannedResultText = await scanner.scanFile(file, false);
                            scanSuccess = true;
                          } catch (err1) {
                            // Try 10% crop scan in Html5Qrcode
                            const canvas = document.createElement("canvas");
                            const cropX = img.width * 0.1;
                            const cropY = img.height * 0.1;
                            const cropW = img.width - (cropX * 2);
                            const cropH = img.height - (cropY * 2);
                            canvas.width = cropW;
                            canvas.height = cropH;
                            const ctx = canvas.getContext("2d");
                            ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                            
                            const croppedBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
                            scannedResultText = await scanner.scanFile(croppedBlob, false);
                            scanSuccess = true;
                          }
                        } catch (html5Err) {
                          console.log("Html5Qrcode scanner fallback failed:", html5Err);
                        } finally {
                          try {
                            scanner.clear();
                          } catch (scErr) {}
                          document.body.removeChild(div);
                        }
                      }

                      if (scanSuccess && scannedResultText) {
                        handleScannedCode(scannedResultText);
                      } else {
                        throw new Error("Could not decode QR code from any variant");
                      }
                    } catch (err) {
                      setScanResult({ success: false, message: "Could not read QR code from this image. Make sure the QR code is clearly visible." });
                    } finally {
                      setVerifying(false);
                      e.target.value = "";
                    }
                  }}
                />
              </div>
            )}

            {/* Verifying Spinner */}
            {verifying && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                <p style={{ color: "#666", fontWeight: 600 }}>Verifying ticket authenticity…</p>
              </div>
            )}

            {/* Result */}
            {scanResult && (
              <div
                style={{
                  padding: 24,
                  borderRadius: 12,
                  textAlign: "center",
                  background: scanResult.success ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
                  border: `1px solid ${scanResult.success ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)"}`,
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 12 }}>{scanResult.success ? "✅" : "❌"}</div>
                <h4 style={{ margin: "0 0 8px", color: scanResult.success ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                  {scanResult.success ? "Ticket Verified!" : "Invalid Ticket"}
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: scanResult.success ? "#16a34a" : "#dc2626" }}>{scanResult.message}</p>

                {scanResult.success && scanResult.booking && (
                  <div style={{ marginTop: 16, textAlign: "left", borderTop: "1px solid rgba(22,163,74,0.2)", paddingTop: 12, fontSize: 13, color: "#444" }}>
                    <div style={{ marginBottom: 4 }}><strong>Buyer:</strong> {scanResult.booking.buyerName}</div>
                    <div style={{ marginBottom: 4 }}><strong>Email:</strong> {scanResult.booking.buyerEmail}</div>
                    <div style={{ marginBottom: 4 }}><strong>Confirmation:</strong> {scanResult.booking.confirmationCode}</div>
                    {scanResult.booking.selectedSeats && scanResult.booking.selectedSeats.length > 0 && (
                      <div>
                        <strong>Seat(s):</strong>{" "}
                        {scanResult.booking.selectedSeats.map((s) => `${s.seatName} (${s.sectionName || "General"})`).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
                  <button
                    onClick={() => { setScanResult(null); setCameraError(""); }}
                    style={{ padding: "10px 20px", background: "var(--gold, #c99a3c)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
                  >
                    Scan Next
                  </button>
                  <button
                    onClick={() => setIsScanOpen(false)}
                    style={{ padding: "10px 20px", background: "#e8e0d0", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Stat card component ──────────────────────────────────────── */
const getIconForLabel = (label) => {
  const size = 20;
  const color = "var(--gold)";
  const normalized = label.toLowerCase();
  
  if (normalized.includes("booking")) return <Ticket size={size} color={color} />;
  if (normalized.includes("sold")) return <Ticket size={size} color={color} />;
  if (normalized.includes("revenue") || normalized.includes("net") || normalized.includes("amount")) {
    return <DollarSign size={size} color={color} />;
  }
  if (normalized.includes("event")) return <Calendar size={size} color={color} />;
  if (normalized.includes("venue")) return <MapPin size={size} color={color} />;
  if (normalized.includes("refund") || normalized.includes("swap") || normalized.includes("change")) {
    return <RefreshCw size={size} color={color} />;
  }
  return <Layers size={size} color={color} />;
};

const StatCard = ({ label, value }) => (
  <div 
    className="card" 
    style={{ 
      padding: "20px 24px",
      background: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderRadius: "16px",
      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    }}
  >
    <div style={{ flex: 1 }}>
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          color: "var(--paper)",
          fontFamily: "var(--font-display)",
          letterSpacing: "0.03em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
    </div>
    <div 
      style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        width: 44, 
        height: 44, 
        borderRadius: 12, 
        background: "rgba(201, 154, 60, 0.12)",
        border: "1px solid rgba(201, 154, 60, 0.2)",
        flexShrink: 0,
      }}
    >
      {getIconForLabel(label)}
    </div>
  </div>
);

export default Analytics;
