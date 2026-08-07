import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../../api/client";

export default function SeatChangeRequests() {
  const { orgSlug } = useParams();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState(null);
  const [actionSuccess, setActionSuccess] = useState("");

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await apiClient.get(`/o/${orgSlug}/seat-change/requests/manage`);
      setRequests(res.data.requests || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load seat change requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [orgSlug]);

  const handleAction = async (requestId, action) => {
    setActioningId(requestId);
    setError("");
    setActionSuccess("");
    try {
      const res = await apiClient.post(`/o/${orgSlug}/seat-change/requests/${requestId}/${action}`);
      setActionSuccess(res.data.message || `Request ${action}ed successfully.`);
      await loadRequests();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} request.`);
    } finally {
      setActioningId(null);
    }
  };

  if (loading && requests.length === 0) {
    return (
      <div style={{ color: "var(--muted)", padding: "40px", textAlign: "center" }}>
        <p>Loading pending seat change requests...</p>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/o/${orgSlug}/dashboard`} className="text-gold-soft">
        &larr; Back to dashboard
      </Link>

      <h1 className="mt-5 font-display text-4xl text-paper">Seat Change Requests</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Review and approve or reject seat transfer/change requests from buyers. Seat swaps automatically update booking data and release the old seats.
      </p>

      {actionSuccess && (
        <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8, padding: 12, color: "#10b981", marginBottom: 20 }}>
          {actionSuccess}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-danger border border-red-100" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-2xl bg-paper p-8 text-center text-ink-text shadow-xl" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ color: "var(--muted)", fontSize: 16 }}>No pending seat change requests found for this organization.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {requests.map((request) => {
            const isCheaper = request.priceDifference < 0;
            const isPriceEqual = request.priceDifference === 0;
            
            return (
              <div 
                key={request._id} 
                className="rounded-2xl bg-paper p-6 shadow-xl" 
                style={{ 
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 20,
                  alignItems: "start",
                  color: "var(--text)"
                }}
              >
                {/* Left: Request Details */}
                <div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <span 
                      style={{ 
                        fontSize: 11, 
                        fontWeight: 700, 
                        padding: "3px 8px", 
                        borderRadius: 6, 
                        background: request.paymentStatus === "paid" ? "rgba(16, 185, 129, 0.1)" : "rgba(20, 22, 43, 0.08)", 
                        color: request.paymentStatus === "paid" ? "#10b981" : "var(--muted)",
                        textTransform: "uppercase"
                      }}
                    >
                      Payment: {request.paymentStatus}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Submitted: {new Date(request.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px", color: "var(--text)" }}>
                    Buyer: {request.bookingId?.buyerName || "Loading..."} ({request.bookingId?.buyerEmail || ""})
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--gold)", margin: "0 0 16px" }}>
                    Event: <strong>{request.bookingId?.eventName}</strong>
                  </p>

                  <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 16 }}>
                    {/* Old Seat */}
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Original Seat</span>
                      <strong style={{ fontSize: 14, color: "var(--text)" }}>
                        {request.oldSeat.seatName} ({request.oldSeat.sectionName || "General"})
                      </strong>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                        Paid: ${request.oldSeat.unitPrice.toFixed(2)}
                      </span>
                      <span 
                        style={{ 
                          display: "inline-block",
                          marginTop: 4,
                          fontSize: 10, 
                          fontWeight: 700, 
                          padding: "2px 6px", 
                          borderRadius: 4, 
                          background: request.bookingId?.paymentStatus === "paid" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)", 
                          color: request.bookingId?.paymentStatus === "paid" ? "#10b981" : "#ef4444",
                          textTransform: "uppercase"
                        }}
                      >
                        Seat Payment: {request.bookingId?.paymentStatus || "unknown"}
                      </span>
                    </div>

                    {/* Arrow indicator */}
                    <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: "var(--gold)" }}>
                      &rarr;
                    </div>

                    {/* New Seat */}
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", display: "block" }}>New Requested Seat</span>
                      <strong style={{ fontSize: 14, color: "#10b981" }}>
                        {request.newSeat.seatName} ({request.newSeat.sectionName || "General"})
                      </strong>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                        Price: ${request.newSeat.unitPrice.toFixed(2)}
                      </span>
                    </div>

                    {/* Price difference */}
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", display: "block" }}>Price Difference</span>
                      <strong style={{ fontSize: 14, color: isCheaper ? "#10b981" : isPriceEqual ? "var(--text)" : "var(--gold)" }}>
                        {isCheaper ? `Refund $${Math.abs(request.priceDifference).toFixed(2)}` : isPriceEqual ? "Same Price ($0.00)" : `Upgrade Fee: $${request.priceDifference.toFixed(2)}`}
                      </strong>
                    </div>
                  </div>

                  {request.reason && (
                    <div style={{ background: "rgba(20, 22, 43, 0.05)", padding: 12, borderRadius: 8, fontSize: 13, borderLeft: "3px solid var(--gold)" }}>
                      <strong style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>REASON FOR REQUEST:</strong>
                      "{request.reason}"
                    </div>
                  )}
                </div>

                {/* Right: Approve/Reject buttons */}
                <div style={{ display: "grid", gap: 10, minWidth: 140 }}>
                  <button
                    onClick={() => handleAction(request._id, "approve")}
                    disabled={actioningId !== null || request.paymentStatus === "pending"}
                    className="rounded-lg bg-gold px-4 py-2 font-bold text-ink text-sm transition-opacity"
                    style={{ 
                      width: "100%", 
                      cursor: (actioningId !== null || request.paymentStatus === "pending") ? "not-allowed" : "pointer",
                      opacity: (actioningId !== null || request.paymentStatus === "pending") ? 0.5 : 1
                    }}
                  >
                    {actioningId === request._id ? "Approving..." : "Approve Swap"}
                  </button>
                  {request.paymentStatus === "pending" && (
                    <span style={{ fontSize: 10, color: "var(--danger, #c0503e)", textAlign: "center", display: "block", marginTop: -4, marginBottom: 4 }}>
                      ⚠️ Waiting for Buyer Payment
                    </span>
                  )}

                  <button
                    onClick={() => handleAction(request._id, "reject")}
                    disabled={actioningId !== null}
                    style={{
                      width: "100%",
                      padding: "8px 16px",
                      background: "rgba(220, 38, 38, 0.08)",
                      border: "1px solid rgba(220, 38, 38, 0.3)",
                      borderRadius: "8px",
                      color: "var(--danger, #dc2626)",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: "center"
                    }}
                  >
                    Reject Swap
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
