import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import "./EventDetail.css";

export default function BundleDetail() {
  const { orgSlug, bundleId } = useParams();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(2); // default is 2 seats

  // Protected Bundle states
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockCodeInput, setUnlockCodeInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    const loadBundle = async () => {
      setLoading(true);
      setError("");
      try {
        const savedCodes = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
        const bundleCode = savedCodes[bundleId] || "";
        const headers = {};
        if (bundleCode) {
          headers["x-bundle-access-code"] = bundleCode;
        }
        const res = await apiClient.get(`/o/${orgSlug}/bundles/${bundleId}`, { headers });
        setBundle(res.data.bundle);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load bundle details.");
      } finally {
        setLoading(false);
      }
    };
    loadBundle();
  }, [orgSlug, bundleId, reloadTrigger]);

  if (loading) {
    return (
      <div className="ed-loading">
        <div className="ed-skeleton-banner" />
        <div className="ed-skeleton-body">
          <div className="ed-skeleton-line w-40" />
          <div className="ed-skeleton-line w-70" />
          <div className="ed-skeleton-line w-55" />
        </div>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="ed-error-wrap">
        <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to storefront</Link>
        <div className="ed-error-box">
          <span>⚠️</span>
          <p>{error || "Bundle not found."}</p>
        </div>
      </div>
    );
  }

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    setVerifyingCode(true);
    setUnlockError("");
    try {
      await apiClient.post(`/o/${orgSlug}/bundles/${bundleId}/verify-access`, {
        accessCode: unlockCodeInput,
      });
      const savedCodes = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
      savedCodes[bundleId] = unlockCodeInput;
      sessionStorage.setItem("unlockedCodes", JSON.stringify(savedCodes));

      setShowUnlockModal(false);
      setUnlockCodeInput("");
      setReloadTrigger((prev) => prev + 1);
    } catch (err) {
      setUnlockError(err.response?.data?.message || "Invalid access code.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const renderUnlockModal = () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        className="unlock-modal-card"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "linear-gradient(155deg, #181b35 0%, #111326 100%)",
          border: "1px solid rgba(201, 154, 60, 0.3)",
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
          color: "var(--paper)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="font-display text-2xl" style={{ margin: 0, color: "var(--gold)" }}>🔒 Unlock Bundle</h3>
          <button
            onClick={() => { setShowUnlockModal(false); setUnlockError(""); }}
            style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: 20, cursor: "pointer" }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleUnlockSubmit}>
          <label style={{ display: "block", marginBottom: 16, fontSize: 13, fontWeight: 600, color: "var(--paper, #ffffff)" }}>
            Enter Security Code
            <input
              type="text"
              required
              value={unlockCodeInput}
              onChange={(e) => setUnlockCodeInput(e.target.value)}
              placeholder="Private access code..."
              className="w-full mt-2 rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
              style={{ fontSize: 14 }}
              autoFocus
            />
          </label>

          {unlockError && (
            <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(192, 80, 62, 0.12)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "#ffa0a0" }}>
              ⚠️ {unlockError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => { setShowUnlockModal(false); setUnlockError(""); }}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ background: "transparent", color: "var(--paper)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifyingCode}
              className="rounded-lg bg-gold px-5 py-2 font-bold text-ink text-sm"
            >
              {verifyingCode ? "Verifying..." : "Verify & Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (bundle.isProtected) {
    return (
      <div className="ed-page">
        <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to storefront</Link>
        <div className="ed-hero" style={{ filter: "blur(4px)", pointerEvents: "none" }}>
          <div className="ed-hero-banner-wrap">
            {bundle.bannerImageUrl ? (
              <img src={bundle.bannerImageUrl} alt={bundle.name} className="ed-hero-img" />
            ) : (
              <div className="ed-hero-fallback" />
            )}
            <div className="ed-hero-gradient" />
            <div className="ed-hero-overlay-info">
              <h1 className="ed-hero-title">{bundle.name}</h1>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: -60,
            position: "relative",
            zIndex: 10,
            background: "rgba(20, 22, 43, 0.55)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(201, 154, 60, 0.25)",
            borderRadius: 20,
            padding: "48px 32px",
            textAlign: "center",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            maxWidth: 600,
            margin: "0 auto 40px",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 className="font-display text-3xl" style={{ color: "var(--paper)", margin: "0 0 12px" }}>Protected Bundle</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            This is a private event bundle. You must provide a valid security code to unlock its details and select seats.
          </p>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="ed-sm-cta"
            style={{ margin: "0 auto", padding: "12px 32px", fontSize: 15, fontWeight: 700 }}
          >
            🔑 Unlock with Access Code
          </button>
        </div>

        {showUnlockModal && renderUnlockModal()}
      </div>
    );
  }

  return (
    <div className="ed-seatmap-page">
      <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to storefront</Link>

      <div className="ed-seatmap-hero">
        {/* Banner with cinematic gradient */}
        <div className="ed-sm-banner-wrap">
          {bundle.bannerImageUrl ? (
            <img src={bundle.bannerImageUrl} alt={bundle.name} className="ed-sm-banner-img" />
          ) : (
            <div className="ed-sm-banner-fallback" />
          )}
          <div className="ed-sm-banner-gradient" />
        </div>

        {/* Content card floating over the gradient */}
        <div className="ed-sm-content">
          <div className="ed-sm-badges">
            <span className="ed-sm-badge ed-sm-badge--seat" style={{ background: "linear-gradient(135deg, #c99a3c 0%, #e5b95f 100%)", color: "#14162b" }}>
              🎉 Special Event Bundle
            </span>
            <span className="ed-sm-badge ed-sm-badge--live">
              ${bundle.pricePerSeat} / Bundle
            </span>
          </div>

          <h1 className="ed-sm-title">{bundle.name}</h1>

          {bundle.description && (
            <p className="ed-sm-desc" style={{ marginBottom: 28 }}>{bundle.description}</p>
          )}

          {/* Timeline of Bundled Events */}
          <h3 style={{ color: "#f7f2e7", fontSize: 16, marginBottom: 16 }}>Included Events:</h3>
          <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
            {bundle.eventIds?.map((event, idx) => (
              <div key={event._id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 14, background: "rgba(247, 242, 231, 0.03)", border: "1px solid rgba(247, 242, 231, 0.06)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#c99a3c", color: "#14162b", display: "flex", alignItems: "center", justifyCenter: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, color: "#f7f2e7", fontSize: 15, fontWeight: 700 }}>{event.name}</h4>
                  <p style={{ margin: "2px 0 0", color: "rgba(247, 242, 231, 0.5)", fontSize: 12.5 }}>
                    📅 {new Date(event.dateTime).toLocaleString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Seat selection quantity configurator */}
          <div className="card" style={{ background: "rgba(14, 17, 35, 0.5)", border: "1px solid rgba(201, 154, 60, 0.15)", borderRadius: 16, padding: 24, marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div>
                <h4 style={{ margin: 0, color: "#f7f2e7", fontSize: 15, fontWeight: 700 }}>How many seats do you want to book?</h4>
                <p style={{ margin: "6px 0 0", color: "rgba(247, 242, 231, 0.6)", fontSize: 12.5 }}>You must pick exactly this number of seats per event in the bundle.<br/><strong style={{ color: "#c99a3c" }}>Total = ${bundle.pricePerSeat} × {quantity} = ${(bundle.pricePerSeat * quantity).toFixed(2)}</strong></p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(247,242,231,0.15)", background: "rgba(247,242,231,0.05)", color: "#fff", fontSize: 18, cursor: "pointer" }}
                >
                  −
                </button>
                <span style={{ fontSize: 18, fontWeight: 800, minWidth: 24, textAlign: "center", color: "#fff" }}>{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.min(10, q + 1))}
                  style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(247,242,231,0.15)", background: "rgba(247,242,231,0.05)", color: "#fff", fontSize: 18, cursor: "pointer" }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate(`/o/${orgSlug}/bundles/${bundleId}/seats?qty=${quantity}`)}
            className="ed-sm-cta"
            style={{ border: "none", cursor: "pointer" }}
          >
            <span className="ed-sm-cta-icon">🗺️</span>
            Start Step-by-Step Seat Selection
            <span className="ed-sm-cta-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
