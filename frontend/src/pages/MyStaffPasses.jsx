import { useEffect, useState } from "react";
import { ShieldCheck, Calendar, MapPin, QrCode, Sparkles, User, Info, Ticket } from "lucide-react";
import apiClient from "../api/client";
import "./MyStaffPasses.css";

export default function MyStaffPasses() {
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // QR Modal State
  const [selectedPassForQR, setSelectedPassForQR] = useState(null);

  const fetchPasses = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/my/passes");
      setPasses(res.data.passes || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load your staff passes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasses();
  }, []);

  const handleOpenQR = (pass) => {
    setSelectedPassForQR(pass);
  };

  if (loading) {
    return (
      <div className="my-passes-loading">
        <div className="my-passes-spinner" />
        <p>Loading your Staff Passes...</p>
      </div>
    );
  }

  return (
    <div className="my-passes">
      <header className="my-passes__header">
        <div>
          <span className="my-passes__tagline">
            <Sparkles size={14} /> StagePass Wallet
          </span>
          <h1>My Staff Passes</h1>
          <p>Access passes issued to you for organization entry and event verification.</p>
        </div>
      </header>

      {error && <div className="my-passes-error">{error}</div>}

      {passes.length === 0 ? (
        <div className="my-passes-empty">
          <ShieldCheck size={48} />
          <h3>No Staff Passes Issued</h3>
          <p>When an organization owner issues a staff pass for you, it will appear here instantly.</p>
        </div>
      ) : (
        <div className="my-passes-list">
          {passes.map((pass) => {
            let typeClass = "my-passes-card--general";
            let colorTheme = "#3b82f6";
            if (pass.passType === "VIP Pass") {
              typeClass = "my-passes-card--vip";
              colorTheme = "#d97706";
            } else if (pass.passType === "Backstage Pass") {
              typeClass = "my-passes-card--backstage";
              colorTheme = "#7c3aed";
            } else if (pass.passType === "Organizer Pass") {
              typeClass = "my-passes-card--organizer";
              colorTheme = "#059669";
            }

            return (
              <div key={pass._id} className={`my-passes-card ${typeClass}`}>
                <div className="my-passes-card__sidebar" style={{ backgroundColor: colorTheme }} />
                
                <div className="my-passes-card__content">
                  <div className="my-passes-card__header-info">
                    <span className="my-passes-card__badge" style={{ borderColor: colorTheme, color: colorTheme }}>
                      {pass.passType}
                    </span>
                    <span className="my-passes-card__org">{pass.organizationId?.name}</span>
                  </div>

                  <div className="my-passes-card__main">
                    <h2>{pass.targetType === "bundle" ? pass.bundleId?.name : pass.eventId?.name}</h2>
                    <span className="my-passes-card__code">Pass Code: {pass.confirmationCode}</span>

                    {/* Single Event Info */}
                    {pass.targetType === "event" && pass.eventId && (
                      <div className="my-passes-card__details">
                        <div className="detail-item">
                          <Calendar size={14} />
                          <span>
                            {(() => {
                              let displayDate = pass.eventId.dateTime;
                              if (pass.eventSessionId && pass.eventId.sessions) {
                                const matchedSession = pass.eventId.sessions.find(
                                  (s) => s._id.toString() === pass.eventSessionId.toString()
                                );
                                if (matchedSession) {
                                  displayDate = matchedSession.dateTime;
                                }
                              }
                              return new Date(displayDate).toLocaleString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                            })()}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Bundle Sub-events list */}
                    {pass.targetType === "bundle" && pass.bundleEvents && (
                      <div className="my-passes-card__bundle-events">
                        <p className="bundle-title"><Info size={13} /> Included Events ({pass.bundleEvents.length}):</p>
                        <div className="bundle-list">
                          {pass.bundleEvents.map((ev) => (
                            <div key={ev._id} className="bundle-list-item">
                              <Ticket size={12} />
                              <div className="bundle-list-item__details">
                                <span className="event-name">{ev.name}</span>
                                <span className="event-date">
                                  {new Date(ev.dateTime).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="my-passes-card__footer">
                    <button className="btn btn-primary my-passes-card__qr-btn" onClick={() => handleOpenQR(pass)}>
                      <QrCode size={16} /> Show Verification QR
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Scanner Modal */}
      {selectedPassForQR && (
        <div className="passes-modal-backdrop" onClick={() => setSelectedPassForQR(null)}>
          <div className="passes-modal my-passes-modal" onClick={(e) => e.stopPropagation()}>
            <div className="passes-modal__header">
              <h2>Staff Verification Pass</h2>
              <button className="passes-modal__close" onClick={() => setSelectedPassForQR(null)}>&times;</button>
            </div>
            <div className="my-passes-modal__body">
              <h3>{selectedPassForQR.passType}</h3>
              <p className="my-passes-modal__target" style={{ marginBottom: selectedPassForQR.targetType === "event" ? "8px" : "24px" }}>
                {selectedPassForQR.targetType === "bundle" ? selectedPassForQR.bundleId?.name : selectedPassForQR.eventId?.name}
              </p>
              {selectedPassForQR.targetType === "event" && selectedPassForQR.eventId && (
                <p style={{ margin: "0 0 24px", color: "var(--muted)", fontSize: 13, fontWeight: "600" }}>
                  Session Date:{" "}
                  {(() => {
                    let displayDate = selectedPassForQR.eventId.dateTime;
                    if (selectedPassForQR.eventSessionId && selectedPassForQR.eventId.sessions) {
                      const matchedSession = selectedPassForQR.eventId.sessions.find(
                        (s) => s._id.toString() === selectedPassForQR.eventSessionId.toString()
                      );
                      if (matchedSession) {
                        displayDate = matchedSession.dateTime;
                      }
                    }
                    return new Date(displayDate).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  })()}
                </p>
              )}
              
              <div className="my-passes-modal__qr-container">
                {selectedPassForQR.qrCodeUrl ? (
                  <img src={selectedPassForQR.qrCodeUrl} alt="Verification QR Code" />
                ) : (
                  <p>QR code not available</p>
                )}
              </div>

              <div className="my-passes-modal__holder-info">
                <p><strong>Code:</strong> {selectedPassForQR.confirmationCode}</p>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: 12 }}>
                  Show this QR code to the entrance supervisor for verification on arrival.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
