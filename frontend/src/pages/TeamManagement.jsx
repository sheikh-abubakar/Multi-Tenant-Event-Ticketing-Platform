import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { X } from "lucide-react";
import apiClient from "../api/client";
import { getPermissionCatalog } from "../utils/permissionsClient";

/**
 * Team Management page — complete flow:
 *
 * INVITE FLOWS:
 *   1. Admin invite → Owner enters email + password + role "admin"
 *      Admin can login immediately with that password
 *
 *   2. Staff invite → Owner enters email + role "staff"
 *      System sends email with magic link → staff clicks → sets password
 *
 * PERMISSIONS:
 *   Owner sees a "Permissions" toggle on each non-owner member row
 *   Clicking it opens a panel to grant/revoke individual permissions
 *   Owner also has a "Reset to defaults" button for each member
 *
 *   Default permissions:
 *   - Admin: Full CRUD on venues/events/team/settings (except org:delete)
 *   - Staff: Create/read/update venues & events + team:read
 */

const PERMISSION_CATALOG = getPermissionCatalog();

const TeamManagement = () => {
  const { orgSlug } = useParams();
  const [members, setMembers] = useState([]);
  const [context, setContext] = useState(null); // { role, permissions, user }
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);

  // Permissions editing
  const [editingPermissions, setEditingPermissions] = useState(null); // memberId or null
  const [permChanges, setPermChanges] = useState({}); // memberId -> string[]

  // Venue assignment
  const [venueModal, setVenueModal] = useState(null); // member object or null
  const [orgVenues, setOrgVenues] = useState([]);
  const [selectedVenueIds, setSelectedVenueIds] = useState([]);
  const [savingVenues, setSavingVenues] = useState(false);

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [teamRes, whoamiRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/team`),
        apiClient.get(`/o/${orgSlug}/whoami`),
      ]);
      setMembers(teamRes.data.members);
      setContext(whoamiRes.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load team data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  const myRole = context?.membership?.role;
  const myPermissions = context?.membership?.permissions || [];
  const isOwner = myRole === "owner";
  const canInvite = myPermissions.includes("team:invite") || isOwner;
  const canManageRoles = myPermissions.includes("team:role") || isOwner;
  const canRemove = myPermissions.includes("team:remove") || isOwner;
  const canManagePermissions = myPermissions.includes("permissions:manage") || isOwner;

  // ── Invite ───────────────────────────────────────────────────────

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setInviting(true);

    try {
      const payload = { email: inviteEmail, role: inviteRole };
      // Only send password for admin invites
      if (inviteRole === "admin") {
        payload.password = invitePassword;
      }

      const { data } = await apiClient.post(`/o/${orgSlug}/team/invite`, payload);
      setSuccessMsg(data.message);
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("staff");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not invite member.");
    } finally {
      setInviting(false);
    }
  };

  // ── Change role ──────────────────────────────────────────────────

  const handleRoleChange = async (memberId, newRole) => {
    setError("");
    setSuccessMsg("");
    try {
      await apiClient.put(`/o/${orgSlug}/team/${memberId}/role`, { role: newRole });
      setSuccessMsg("Role updated. Permissions reset to defaults.");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not change role.");
    }
  };

  // ── Permissions ──────────────────────────────────────────────────

  const openPermissionsEditor = (member) => {
    setEditingPermissions(member.id);
    setPermChanges((prev) => ({
      ...prev,
      [member.id]: [...(member.permissions || [])],
    }));
  };

  const togglePermission = (memberId, perm) => {
    setPermChanges((prev) => {
      const current = prev[memberId] || [];
      const updated = current.includes(perm)
        ? current.filter((p) => p !== perm)
        : [...current, perm];
      return { ...prev, [memberId]: updated };
    });
  };

  const savePermissions = async (memberId) => {
    setError("");
    setSuccessMsg("");
    try {
      await apiClient.put(`/o/${orgSlug}/team/${memberId}/permissions`, {
        permissions: permChanges[memberId] || [],
      });
      setSuccessMsg("Permissions updated.");
      setEditingPermissions(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save permissions.");
    }
  };

  const cancelPermissionsEdit = () => {
    setEditingPermissions(null);
  };

  // ── Venue Assignment ─────────────────────────────────────────────

  const openVenueModal = async (member) => {
    setVenueModal(member);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.get(`/o/${orgSlug}/venues`);
      setOrgVenues(res.data.venues);
      // Pre-select venues that are already assigned
      const assigned = member.assignedVenues || [];
      setSelectedVenueIds(assigned.map((v) => v._id || v));
    } catch (err) {
      setError("Could not load venues: " + (err.response?.data?.message || err.message));
    }
  };

  const toggleVenueSelection = (venueId) => {
    setSelectedVenueIds((prev) =>
      prev.includes(venueId)
        ? prev.filter((id) => id !== venueId)
        : [...prev, venueId],
    );
  };

  const saveVenueAssignment = async () => {
    if (!venueModal) return;
    setSavingVenues(true);
    setError("");
    setSuccessMsg("");
    try {
      await apiClient.put(`/o/${orgSlug}/team/${venueModal.id}/venues`, {
        venueIds: selectedVenueIds,
      });
      setSuccessMsg(`Venues assigned to ${venueModal.user?.name || venueModal.user?.email}`);
      setVenueModal(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not assign venues.");
    } finally {
      setSavingVenues(false);
    }
  };

  // ── Remove member ────────────────────────────────────────────────

  const handleRemove = async (member) => {
    const userName = member.user?.name || member.user?.email || "this person";
    if (!window.confirm(`Remove ${userName} from this organization?`)) return;

    setError("");
    setSuccessMsg("");
    try {
      await apiClient.delete(`/o/${orgSlug}/team/${member.id}`);
      setSuccessMsg(`${userName} has been removed.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove member.");
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────

  const getRoleBadgeClass = (memberRole) => {
    switch (memberRole) {
      case "owner": return "role-badge role-owner";
      case "admin": return "role-badge role-admin";
      default: return "role-badge role-staff";
    }
  };

  const isCurrentUser = (member) => member.user?.id === context?.user?.id;

  if (loading) {
    return (
      <div className="mx-auto" style={{ maxWidth: 800, padding: "40px 0" }}>
        <p style={{ color: "var(--muted)" }}>Loading team…</p>
      </div>
    );
  }

  return (
    <div className="team-page mx-auto" style={{ maxWidth: 800 }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/dashboard`} style={{ color: "var(--gold-soft)" }}>
          &larr; Back to dashboard
        </Link>
      </p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h1 style={{ color: "var(--paper)", margin: 0, fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 400 }}>
          Team
        </h1>
        <span className="badge">{members.length} member{members.length !== 1 ? "s" : ""}</span>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: 32, marginTop: 0 }}>
        Manage who has access to this organization's dashboard.
      </p>

      {successMsg && <div className="success-banner" style={{ marginBottom: 16 }}>{successMsg}</div>}
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ── Invite form (permission-based) ─────────────────────────── */}
      {canInvite && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
            Invite a team member
          </h3>
          <form onSubmit={handleInvite} className="invite-team-form">
            <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
              <label htmlFor="inviteEmail" style={{ fontSize: 12 }}>Email address</label>
              <input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                style={{ padding: "10px 12px", fontSize: 14 }}
              />
            </div>
            <div className="field" style={{ flex: "0 0 120px", marginBottom: 0 }}>
              <label htmlFor="inviteRole" style={{ fontSize: 12 }}>Role</label>
              <select
                id="inviteRole"
                value={inviteRole}
                onChange={(e) => {
                  setInviteRole(e.target.value);
                  if (e.target.value === "staff") setInvitePassword("");
                }}
                style={{ padding: "10px 12px", fontSize: 14 }}
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff (email invite)</option>
              </select>
            </div>
            {inviteRole === "admin" && (
              <div className="field" style={{ flex: "0 0 180px", marginBottom: 0 }}>
                <label htmlFor="invitePassword" style={{ fontSize: 12 }}>
                  Password <span style={{ fontWeight: 400, color: "var(--muted)" }}>(Optional)</span>
                </label>
                <input
                  id="invitePassword"
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Only for new accounts"
                  minLength={6}
                  style={{ padding: "10px 12px", fontSize: 14 }}
                />
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={inviting || !inviteEmail.trim()}
              style={{ marginBottom: 0, height: 42 }}
            >
              {inviting ? "Inviting…" : "Send invite"}
            </button>
          </form>
          {inviteRole === "staff" && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Staff will receive an email with a link to accept the invitation. If they don't have an account, they can set their password then.
            </p>
          )}
          {inviteRole === "admin" && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
              New users can login immediately with the password you set. For existing StagePass users, leave this blank; they will receive a secure email invitation.
            </p>
          )}
        </div>
      )}

      {/* ── Member list ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((member) => {
          const memberPerms = editingPermissions === member.id
            ? (permChanges[member.id] || [])
            : (member.permissions || []);

          return (
            <div key={member.id}>
              <MemberRow
                member={member}
                currentUser={isCurrentUser(member)}
                isOwner={isOwner}
                canManageRoles={canManageRoles}
                canRemove={canRemove}
                canManagePermissions={canManagePermissions}
                editingPermissions={editingPermissions === member.id}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
                onEditPermissions={() => openPermissionsEditor(member)}
                onAssignVenues={() => openVenueModal(member)}
                getRoleBadgeClass={getRoleBadgeClass}
              />

              {/* ── Permissions panel ─────────────────────────────── */}
              {editingPermissions === member.id && (
                <div className="card" style={{ marginTop: 4, padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Permissions — {member.user?.name || member.user?.email}
                    </h4>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => savePermissions(member.id)}>
                        Save
                      </button>
                      <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }} onClick={cancelPermissionsEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 16 }}>
                    {PERMISSION_CATALOG.map((group) => (
                      <div key={group.resource}>
                        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                          {group.label}
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {group.actions.map((action) => {
                            const isChecked = memberPerms.includes(`${group.resource}:${action.action}`);
                            return (
                              <label
                                key={action.action}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 13,
                                  padding: "4px 10px",
                                  borderRadius: 4,
                                  background: isChecked ? "rgba(201, 154, 60, 0.12)" : "rgba(0,0,0,0.03)",
                                  border: `1px solid ${isChecked ? "var(--gold)" : "#e0d8c5"}`,
                                  cursor: "pointer",
                                  color: "var(--text)",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(member.id, `${group.resource}:${action.action}`)}
                                  style={{ accentColor: "var(--gold)" }}
                                />
                                {action.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 32, padding: 20 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Role permissions
        </h4>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
          <div>
            <span className="role-badge role-owner" style={{ marginRight: 6 }}>Owner</span>
            <span style={{ color: "var(--muted)" }}>Full access — everything</span>
          </div>
          <div>
            <span className="role-badge role-admin" style={{ marginRight: 6 }}>Admin</span>
            <span style={{ color: "var(--muted)" }}>Manage content & team</span>
          </div>
          <div>
            <span className="role-badge role-staff" style={{ marginRight: 6 }}>Staff</span>
            <span style={{ color: "var(--muted)" }}>Event & venue operations</span>
          </div>
        </div>
      </div>

      {/* ── Venue Assignment Modal ───────────────────────────────── */}
      {venueModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: "var(--card)",
            borderRadius: 16,
            padding: "28px 24px",
            maxWidth: 480,
            width: "100%",
            border: "1px solid var(--border)",
            position: "relative",
            maxHeight: "80vh",
            overflow: "auto",
          }}>
            <button
              onClick={() => setVenueModal(null)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                fontSize: 20,
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ color: "var(--paper)", margin: "0 0 4px", fontSize: 18 }}>
              🏟️ Assign Venues
            </h3>
            <p style={{ color: "var(--muted)", margin: "0 0 20px", fontSize: 14 }}>
              Select venues for <strong>{venueModal.user?.name || venueModal.user?.email}</strong> ({venueModal.role})
            </p>

            {orgVenues.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 14, textAlign: "center", padding: 20 }}>
                No venues created yet. <Link to={`/o/${orgSlug}/manage/venues`}>Create venues first</Link>.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orgVenues.map((venue) => {
                  const checked = selectedVenueIds.includes(venue._id);
                  return (
                    <label
                      key={venue._id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 8,
                        background: checked ? "rgba(201, 154, 60, 0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${checked ? "#c99a3c" : "var(--border)"}`,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleVenueSelection(venue._id)}
                        style={{ width: 18, height: 18, accentColor: "#c99a3c" }}
                      />
                      <div>
                        <p style={{ margin: 0, color: "var(--paper)", fontSize: 14, fontWeight: 500 }}>
                          {venue.name}
                        </p>
                        {venue.city && (
                          <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 12 }}>
                            📍 {venue.city}{venue.capacity ? ` • Capacity: ${venue.capacity}` : ""}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={saveVenueAssignment}
                className="btn btn-primary"
                disabled={savingVenues}
                style={{ flex: 1, padding: "12px 20px" }}
              >
                {savingVenues ? "Saving…" : `Save (${selectedVenueIds.length} venues)`}
              </button>
              <button
                onClick={() => setVenueModal(null)}
                className="btn btn-ghost"
                style={{ padding: "12px 20px" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Single member row component.
 */
const MemberRow = ({
  member,
  currentUser,
  isOwner,
  canManageRoles,
  canRemove,
  canManagePermissions,
  editingPermissions,
  onRoleChange,
  onRemove,
  onEditPermissions,
  onAssignVenues,
  getRoleBadgeClass,
}) => {
  const memberRole = member.role;
  const isOwnerMember = memberRole === "owner";

  return (
    <div
      className="card member-row"
      style={currentUser ? { borderLeft: "3px solid var(--gold)" } : {}}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "1 1 auto", minWidth: 0 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: getAvatarColor(member.user?.email || ""),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
            fontFamily: "var(--font-body)",
          }}
        >
          {(member.user?.name || member.user?.email || "?")[0].toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>
              {member.user?.name || member.user?.email?.split("@")[0]}
            </span>
            {currentUser && (
              <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                You
              </span>
            )}
            {!member.passwordSet && (
              <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Pending
              </span>
            )}
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.user?.email}
          </p>
        </div>
      </div>

      <div className="member-controls">
        <span className={getRoleBadgeClass(memberRole)} style={{ fontSize: 11, padding: "3px 10px" }}>
          {memberRole}
        </span>

        {/* Role change dropdown (owner/admin only, not on owners) */}
        {canManageRoles && !isOwnerMember && (
          <select
            value={memberRole}
            onChange={(e) => onRoleChange(member.id, e.target.value)}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #d8d0bd",
              background: "#fffdf8",
              color: "var(--text)",
              cursor: "pointer",
            }}
            title="Change role"
          >
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
          </select>
        )}

        {/* Permissions button (owner only) */}
        {canManagePermissions && !isOwnerMember && !editingPermissions && (
          <button
            onClick={onEditPermissions}
            className="btn btn-ghost"
            style={{
              padding: "4px 10px",
              fontSize: 12,
              background: "transparent",
            }}
            title="Customize permissions"
          >
            Permissions
          </button>
        )}

        {/* Assign Venues button (for staff members only) */}
        {canManageRoles && memberRole === "staff" && !editingPermissions && (
          <button
            onClick={onAssignVenues}
            className="btn btn-ghost"
            style={{
              padding: "4px 10px",
              fontSize: 12,
              background: "transparent",
            }}
            title="Assign venues to this staff member"
          >
            🏟️ Venues
          </button>
        )}

        {/* Remove button */}
        {canRemove && !isOwnerMember && !currentUser && (
          <button
            onClick={() => onRemove(member)}
            className="btn btn-ghost"
            style={{
              padding: "4px 10px",
              fontSize: 12,
              color: "var(--danger)",
              borderColor: "#edb9af",
              background: "transparent",
            }}
            title="Remove from organization"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

/* ── Avatar color utility ──────────────────────────────────────── */
const AVATAR_COLORS = [
  "#7c6fc4", "#c99a3c", "#3f7d5c", "#c0503e", "#4a7db5", "#b57a4a",
];

const getAvatarColor = (email) => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export default TeamManagement;
