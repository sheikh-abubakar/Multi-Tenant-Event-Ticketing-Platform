import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import { User, Lock, Wallet, Ticket, Gift, Building, ArrowRight, CheckCircle } from "lucide-react";

const UserProfile = () => {
  const { user, updateUser } = useAuth();

  // Profile fields state
  const [profileForm, setProfileForm] = useState({ name: user?.name || "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Password fields state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Loaded user statistics
  const [walletBalance, setWalletBalance] = useState(0);
  const [bookingCount, setBookingCount] = useState(0);
  const [rewardsCount, setRewardsCount] = useState(0);
  const [organizations, setOrganizations] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch Stats & Organizations
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [walletRes, bookingsRes, referralRes, orgsRes] = await Promise.all([
          apiClient.get("/wallet").catch(() => ({ data: { wallet: { balance: 0 } } })),
          apiClient.get("/bookings/mine").catch(() => ({ data: { bookings: [] } })),
          apiClient.get("/referrals/me").catch(() => ({ data: { data: { availableRewardsCount: 0 } } })),
          apiClient.get("/organizations/mine").catch(() => ({ data: { organizations: [] } })),
        ]);

        setWalletBalance(walletRes.data.wallet?.balance || 0);
        setBookingCount(bookingsRes.data.bookings?.length || 0);
        setRewardsCount(referralRes.data.data?.availableRewardsCount || 0);
        setOrganizations(orgsRes.data.organizations || []);
      } catch (err) {
        console.error("Failed to load user details", err);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setProfileLoading(true);
    try {
      const { data } = await apiClient.put("/auth/profile", profileForm);
      updateUser(data.user);
      setProfileSuccess("Profile updated successfully.");
    } catch (err) {
      setProfileError(err.response?.data?.message || "Failed to update profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return setPasswordError("New passwords do not match.");
    }

    setPasswordLoading(true);
    try {
      await apiClient.put("/auth/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess("Password changed successfully.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPasswordError(err.response?.data?.message || "Failed to update password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Page Title */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 36, margin: "0 0 8px", color: "#f7f2e7" }}>My Account</h1>
        <p style={{ color: "#6b6f8a", fontSize: 15, margin: 0 }}>
          Manage your personal details, credentials, and organization memberships
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>

        {/* LEFT COLUMN: Profile and Password Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

          {/* ── Personal Info Card ── */}
          <div className="profile-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <User size={20} color="#c99a3c" />
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Personal Details</h2>
            </div>

            {profileError && (
              <div style={{ background: "rgba(192,30,30,0.15)", color: "#f87171", border: "1px solid rgba(192,30,30,0.3)", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div style={{ background: "rgba(26,125,26,0.15)", color: "#4ade80", border: "1px solid rgba(26,125,26,0.3)", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={15} />
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleProfileSubmit}>
              <div className="field">
                <label>Email Address (Read-only)</label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                />
              </div>

              <div className="field">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ name: e.target.value })}
                  required
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={profileLoading}
                style={{ marginTop: 8, padding: "10px 20px" }}
              >
                {profileLoading ? "Saving Changes…" : "Update Profile"}
              </button>
            </form>
          </div>

          {/* ── Change Password Card ── */}
          <div className="profile-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <Lock size={20} color="#c99a3c" />
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Change Password</h2>
            </div>

            {passwordError && (
              <div style={{ background: "rgba(192,30,30,0.15)", color: "#f87171", border: "1px solid rgba(192,30,30,0.3)", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div style={{ background: "rgba(26,125,26,0.15)", color: "#4ade80", border: "1px solid rgba(26,125,26,0.3)", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={15} />
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit}>
              <div className="field">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  id="currentPassword"
                  type="password"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={passwordLoading}
                style={{ marginTop: 8, padding: "10px 20px" }}
              >
                {passwordLoading ? "Changing Password…" : "Change Password"}
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT COLUMN: Quick Stats & Organizations */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

          {/* Quick Stats Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {/* Wallet Stat */}
            <Link to="/my/dashboard" style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: 20, textAlign: "center", background: "linear-gradient(135deg, #192436 0%, #2a3148 100%)", border: "1px solid rgba(201, 154, 60, 0.25)", color: "#f7f2e7" }}>
                <Wallet size={24} color="#c99a3c" style={{ margin: "0 auto 10px" }} />
                <p style={{ margin: 0, fontSize: 12, color: "#6b6f8a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Wallet Balance</p>
                <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "#f7f2e7" }}>
                  {statsLoading ? "..." : formatCurrency(walletBalance)}
                </p>
              </div>
            </Link>

            {/* Bookings Stat */}
            <Link to="/my/dashboard" style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: 20, textAlign: "center", background: "linear-gradient(135deg, #192436 0%, #2a3148 100%)", border: "1px solid rgba(201, 154, 60, 0.25)", color: "#f7f2e7" }}>
                <Ticket size={24} color="#c99a3c" style={{ margin: "0 auto 10px" }} />
                <p style={{ margin: 0, fontSize: 12, color: "#6b6f8a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bookings</p>
                <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: "#f7f2e7" }}>
                  {statsLoading ? "..." : bookingCount}
                </p>
              </div>
            </Link>

            {/* Referrals Stat */}
            <Link to="/my/dashboard" style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: 20, textAlign: "center", background: "linear-gradient(135deg, #192436 0%, #2a3148 100%)", border: "1px solid rgba(201, 154, 60, 0.25)", color: "#f7f2e7" }}>
                <Gift size={24} color="#c99a3c" style={{ margin: "0 auto 10px" }} />
                <p style={{ margin: 0, fontSize: 12, color: "#6b6f8a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Referral Rewards</p>
                <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: "#f7f2e7" }}>
                  {statsLoading ? "..." : rewardsCount}
                </p>
              </div>
            </Link>
          </div>

          {/* ── Organizations List Card ── */}
          <div className="profile-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Building size={20} color="#c99a3c" />
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>My Organizations</h2>
              </div>
              <Link
                to="/create-organization"
                style={{
                  fontSize: 12,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(247,242,231,0.25)",
                  color: "#f7f2e7",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                + Create New
              </Link>
            </div>

            {statsLoading ? (
              <p style={{ color: "#6b6f8a", margin: 0 }}>Loading organizations...</p>
            ) : organizations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ color: "#6b6f8a", margin: "0 0 12px" }}>You do not belong to any organizations yet.</p>
                <Link to="/create-organization" className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 13 }}>
                  Create Organization
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {organizations.map((orgMember) => (
                  <div
                    key={orgMember.organization.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(247, 242, 231, 0.10)",
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 5px", color: "#f7f2e7" }}>
                        {orgMember.organization.name}
                      </h3>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          padding: "2px 7px",
                          borderRadius: 3,
                          background:
                            orgMember.role === "owner"
                              ? "rgba(201, 154, 60, 0.18)"
                              : orgMember.role === "admin"
                              ? "rgba(124, 111, 196, 0.18)"
                              : "rgba(255, 255, 255, 0.08)",
                          color:
                            orgMember.role === "owner"
                              ? "#c99a3c"
                              : orgMember.role === "admin"
                              ? "#a89fe0"
                              : "#a8a4c0",
                        }}
                      >
                        {orgMember.role}
                      </span>
                    </div>
                    <Link
                      to={`/o/${orgMember.organization.slug}/dashboard`}
                      style={{ fontSize: 13, color: "#c99a3c", display: "flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 600 }}
                    >
                      Console <ArrowRight size={14} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default UserProfile;
