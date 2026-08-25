import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Edit3, Trash2, Send, ShieldAlert, Sparkles, User, Calendar, FolderHeart, BadgeCheck, CheckCircle, RefreshCw } from "lucide-react";
import apiClient from "../../api/client";
import "./StaffPassesManager.css";

export default function StaffPassesManager() {
  const { orgSlug } = useParams();
  const [passes, setPasses] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [bundles, setBundles] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingPass, setEditingPass] = useState(null);
  
  // Form Fields
  const [selectedUser, setSelectedUser] = useState("");
  const [targetType, setTargetType] = useState("event");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedBundle, setSelectedBundle] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [passType, setPassType] = useState("General Pass");

  const [activeTab, setActiveTab] = useState("draft");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [passesRes, teamRes, eventsRes, bundlesRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/staff-passes`),
        apiClient.get(`/o/${orgSlug}/team`),
        apiClient.get(`/o/${orgSlug}/events`),
        apiClient.get(`/o/${orgSlug}/bundles`),
      ]);

      setPasses(passesRes.data.passes || []);
      
      // Filter out owners if we only issue passes to admins and staff (though owners can also be listed)
      setTeamMembers(teamRes.data.members || []);
      setEvents(eventsRes.data.events || []);
      setBundles(bundlesRes.data.bundles || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load management console data. Are you the Owner?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgSlug) {
      fetchData();
    }
  }, [orgSlug]);

  const handleOpenCreate = () => {
    setEditingPass(null);
    const candidates = teamMembers.filter((m) => m.role !== "owner");
    setSelectedUser(candidates[0]?.user?.id || "");
    setTargetType("event");

    const futureEvents = events.filter((ev) => {
      if (ev.sessions && ev.sessions.length > 0) {
        return ev.sessions.some((s) => new Date(s.dateTime) > new Date());
      }
      return new Date(ev.dateTime) > new Date();
    });

    const defaultEvent = futureEvents[0];
    setSelectedEvent(defaultEvent?._id || "");
    
    if (defaultEvent?.sessions && defaultEvent.sessions.length > 0) {
      const futureSess = defaultEvent.sessions.filter((s) => new Date(s.dateTime) > new Date());
      setSelectedSession(futureSess[0]?._id || "");
    } else {
      setSelectedSession("");
    }

    setSelectedBundle(bundles[0]?._id || "");
    setPassType("General Pass");
    setShowModal(true);
  };

  const handleOpenEdit = (pass) => {
    setEditingPass(pass);
    setSelectedUser(pass.userId?._id || "");
    setTargetType(pass.targetType);
    if (pass.targetType === "event") {
      setSelectedEvent(pass.eventId?._id || "");
      setSelectedSession(pass.eventSessionId || "");
    } else {
      setSelectedBundle(pass.bundleId?._id || "");
      setSelectedSession("");
    }
    setPassType(pass.passType);
    setShowModal(true);
  };

  const handleEventChange = (eventId) => {
    setSelectedEvent(eventId);
    const ev = events.find((e) => e._id === eventId);
    if (ev?.sessions && ev.sessions.length > 0) {
      const futureSess = ev.sessions.filter((s) => new Date(s.dateTime) > new Date());
      setSelectedSession(futureSess[0]?._id || "");
    } else {
      setSelectedSession("");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccessMsg("");

    const payload = {
      userId: selectedUser,
      targetType,
      eventId: targetType === "event" ? selectedEvent : undefined,
      eventSessionId: targetType === "event" && selectedSession ? selectedSession : undefined,
      bundleId: targetType === "bundle" ? selectedBundle : undefined,
      passType,
    };

    try {
      if (editingPass) {
        await apiClient.put(`/o/${orgSlug}/staff-passes/${editingPass._id}`, payload);
        setSuccessMsg("Staff pass updated successfully!");
      } else {
        await apiClient.post(`/o/${orgSlug}/staff-passes`, payload);
        setSuccessMsg("Staff pass created as Draft!");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "An error occurred while saving the pass.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (passId) => {
    if (!window.confirm("Are you sure you want to delete this staff pass draft?")) return;
    setError("");
    setSuccessMsg("");
    try {
      await apiClient.delete(`/o/${orgSlug}/staff-passes/${passId}`);
      setSuccessMsg("Draft pass deleted successfully.");
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete pass.");
    }
  };

  const handleSend = async (passId) => {
    setError("");
    setSuccessMsg("");
    try {
      await apiClient.post(`/o/${orgSlug}/staff-passes/${passId}/send`);
      setSuccessMsg("Pass dispatched successfully! Notification and PDF email sent.");
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send pass.");
    }
  };

  const filteredPasses = passes.filter((p) => p.status === activeTab);

  if (loading) {
    return (
      <div className="passes-loading">
        <div className="passes-spinner" />
        <p>Loading Staff Passes Console...</p>
      </div>
    );
  }

  return (
    <div className="passes-manager">
      <header className="passes-manager__header">
        <div>
          <span className="passes-manager__tagline">
            <Sparkles size={14} /> SECURITY & OPERATIONS
          </span>
          <h1>Staff & Admin Passes</h1>
          <p>Issue, edit, and dispatch credentialed passes for gate entrance check-in.</p>
        </div>
        <button className="btn btn-primary passes-manager__create-btn" onClick={handleOpenCreate}>
          <Plus size={18} /> Create Pass
        </button>
      </header>

      {error && <div className="passes-banner passes-banner--error"><ShieldAlert size={18} /> {error}</div>}
      {successMsg && <div className="passes-banner passes-banner--success"><BadgeCheck size={18} /> {successMsg}</div>}

      <div className="passes-tabs">
        <button className={`passes-tabs__btn ${activeTab === "draft" ? "is-active" : ""}`} onClick={() => setActiveTab("draft")}>
          Drafts ({passes.filter((p) => p.status === "draft").length})
        </button>
        <button className={`passes-tabs__btn ${activeTab === "active" ? "is-active" : ""}`} onClick={() => setActiveTab("active")}>
          Active ({passes.filter((p) => p.status === "active").length})
        </button>
        <button className={`passes-tabs__btn ${activeTab === "verified" ? "is-active" : ""}`} onClick={() => setActiveTab("verified")}>
          Verified/Used ({passes.filter((p) => p.status === "verified").length})
        </button>
      </div>

      {filteredPasses.length === 0 ? (
        <div className="passes-empty">
          <FolderHeart size={44} />
          <h3>No passes found in this section</h3>
          <p>Create a pass draft and send it to your team member instantly.</p>
        </div>
      ) : (
        <div className="passes-grid">
          {filteredPasses.map((pass) => {
            let passBadgeColor = "var(--badge-blue)";
            if (pass.passType === "VIP Pass") passBadgeColor = "var(--badge-gold)";
            if (pass.passType === "Backstage Pass") passBadgeColor = "var(--badge-purple)";
            if (pass.passType === "Organizer Pass") passBadgeColor = "var(--badge-emerald)";

            return (
              <div key={pass._id} className="passes-card">
                <div className="passes-card__header">
                  <span className="passes-card__badge" style={{ backgroundColor: passBadgeColor }}>
                    {pass.passType}
                  </span>
                  <span className="passes-card__code">{pass.confirmationCode}</span>
                </div>

                <div className="passes-card__body">
                  <div className="passes-card__holder">
                    <User size={16} />
                    <div>
                      <strong>{pass.userId?.name || "Unknown"}</strong>
                      <span>{pass.userId?.email}</span>
                    </div>
                  </div>

                  <div className="passes-card__target">
                    <Calendar size={16} />
                    <div>
                      <strong>{pass.targetType === "bundle" ? "Event Bundle" : "Single Event"}</strong>
                      <span>
                        {pass.targetType === "bundle"
                          ? pass.bundleId?.name || "Bundle Deleted"
                          : pass.eventId?.name || "Event Deleted"}
                      </span>
                      {pass.targetType === "event" && pass.eventId && (
                        <span style={{ fontSize: "11px", color: "#fbbf24", marginTop: "4px", fontWeight: "600" }}>
                          Session: {(() => {
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
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="passes-card__actions">
                  {pass.status === "draft" && (
                    <>
                      <button className="btn btn-secondary btn-icon" onClick={() => handleOpenEdit(pass)} title="Edit Pass">
                        <Edit3 size={15} /> Edit
                      </button>
                      <button className="btn btn-secondary btn-icon passes-card__action--delete" onClick={() => handleDelete(pass._id)} title="Delete Pass">
                        <Trash2 size={15} /> Delete
                      </button>
                      <button className="btn btn-primary btn-icon passes-card__action--send" onClick={() => handleSend(pass._id)} title="Send Pass">
                        <Send size={15} /> Send Pass
                      </button>
                    </>
                  )}
                  {pass.status === "active" && (
                    <div className="passes-card__dispatched">
                      <CheckCircle size={15} /> Sent & Active
                    </div>
                  )}
                  {pass.status === "verified" && (
                    <div className="passes-card__dispatched" style={{ backgroundColor: "rgba(22, 163, 74, 0.15)", color: "#16a34a", borderColor: "rgba(22, 163, 74, 0.3)" }}>
                      <CheckCircle size={15} /> Verified & Checked In
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="passes-modal-backdrop">
          <div className="passes-modal">
            <div className="passes-modal__header">
              <h2>{editingPass ? "Edit Staff Pass" : "Create Staff Pass"}</h2>
              <button className="passes-modal__close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="passes-modal__form">
              <div className="form-group">
                <label>Select Team Member</label>
                <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} required>
                  <option value="" disabled>Choose a member...</option>
                  {teamMembers
                    .filter((m) => m.role !== "owner")
                    .map((m) => (
                      <option key={m.user?.id} value={m.user?.id}>
                        {m.user?.name} ({m.role})
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Scope / Target Access</label>
                <div className="passes-radio-group">
                  <label className={`passes-radio-label ${targetType === "event" ? "is-selected" : ""}`}>
                    <input type="radio" name="targetType" value="event" checked={targetType === "event"} onChange={() => setTargetType("event")} />
                    Single Event
                  </label>
                  <label className={`passes-radio-label ${targetType === "bundle" ? "is-selected" : ""}`}>
                    <input type="radio" name="targetType" value="bundle" checked={targetType === "bundle"} onChange={() => setTargetType("bundle")} />
                    Event Bundle
                  </label>
                </div>
              </div>

              {targetType === "event" ? (
                <>
                  <div className="form-group">
                    <label>Select Event</label>
                    <select value={selectedEvent} onChange={(e) => handleEventChange(e.target.value)} required>
                      <option value="" disabled>Choose an event...</option>
                      {events
                        .filter((ev) => {
                          if (editingPass && ev._id === editingPass.eventId?._id) return true;
                          if (ev.sessions && ev.sessions.length > 0) {
                            return ev.sessions.some((s) => new Date(s.dateTime) > new Date());
                          }
                          return new Date(ev.dateTime) > new Date();
                        })
                        .map((ev) => (
                          <option key={ev._id} value={ev._id}>{ev.name}</option>
                        ))}
                    </select>
                  </div>

                  {(() => {
                    const currentEvent = events.find((e) => e._id === selectedEvent);
                    if (currentEvent?.sessions && currentEvent.sessions.length > 0) {
                      const futureSessions = currentEvent.sessions.filter((s) => {
                        if (editingPass && s._id.toString() === editingPass.eventSessionId?.toString()) return true;
                        return new Date(s.dateTime) > new Date();
                      });

                      return (
                        <div className="form-group" style={{ marginTop: "16px" }}>
                          <label>Select Event Session</label>
                          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} required>
                            <option value="" disabled>Choose a session...</option>
                            {futureSessions.map((s, idx) => (
                              <option key={s._id} value={s._id}>
                                Session {idx + 1}: {new Date(s.dateTime).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              ) : (
                <div className="form-group">
                  <label>Select Bundle</label>
                  <select value={selectedBundle} onChange={(e) => setSelectedBundle(e.target.value)} required>
                    <option value="" disabled>Choose a bundle...</option>
                    {bundles.map((b) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Pass Type / Badge Level</label>
                <select value={passType} onChange={(e) => setPassType(e.target.value)} required>
                  <option value="General Pass">General Pass</option>
                  <option value="VIP Pass">VIP Pass</option>
                  <option value="Backstage Pass">Backstage Pass</option>
                  <option value="Organizer Pass">Organizer Pass</option>
                </select>
              </div>

              <div className="passes-modal__actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingPass ? "Update Pass" : "Create Pass"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
