import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, Activity, LogOut, ShieldCheck, X, Sparkles, Bell } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import "./PlatformAdmin.css";

const PlatformAdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    sessionStorage.removeItem("unlockedCodes");
    logout();
    navigate("/platform-admin/login");
  };

  // Close sidebar on path changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const links = [
    ["Overview", "/platform-admin", LayoutDashboard],
    ["Organizations", "/platform-admin/organizations", Building2],
    ["Activity log", "/platform-admin/activity", Activity],
    ["Notifications", "/platform-admin/notifications", Bell],
    ["AI Assistant", "/platform-admin/assistant", Sparkles]
  ];

  return (
    <div className="platform-shell">
      {/* ── Mobile top navbar with hamburger ── */}
      <header className="platform-mobile-header">
        <button
          className={`platform-hamburger ${sidebarOpen ? "is-active" : ""}`}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle platform menu"
          aria-expanded={sidebarOpen}
        >
          <div className="hamburger-box">
            <span className="hamburger-line line-1"></span>
            <span className="hamburger-line line-2"></span>
            <span className="hamburger-line line-3"></span>
          </div>
        </button>
        <div className="platform-mobile-brand">
          <ShieldCheck size={20} color="#d4a53d" />
          <span>StagePass CONTROL</span>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className={`platform-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="platform-brand">
          <ShieldCheck size={23} />
          <div>
            <strong>StagePass</strong>
            <span>PLATFORM CONTROL</span>
          </div>
        </div>

        <nav className="platform-nav">
          {links.map(([label, to, Icon]) => (
            <NavLink
              key={to}
              end={to === "/platform-admin"}
              to={to}
              className={({ isActive }) => `platform-nav-link ${isActive ? "is-active" : ""}`}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="platform-user">
          <span>SUPER ADMIN</span>
          <strong>{user?.name}</strong>
          <small>{user?.email}</small>
          <button onClick={handleLogout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      {/* ── Backdrop Overlay ── */}
      {sidebarOpen && (
        <div
          className="platform-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main viewport ── */}
      <main className="platform-main">
        <div style={{ position: "fixed", top: 20, right: 26, zIndex: 90 }}>
          <NotificationBell inboxPath="/platform-admin/notifications" />
        </div>
        <Outlet />
      </main>
    </div>
  );
};

export default PlatformAdminLayout;
