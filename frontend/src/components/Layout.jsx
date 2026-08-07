import { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, WalletCards, User, Menu, X, LogOut, Building2, LayoutDashboard, Calendar, MapPin, Package, BarChart3, Users2, Settings, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import AICopilot from "./ai/AICopilot";
import "./Layout.css";
import "./PageVisuals.css";

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const organizerMatch = location.pathname.match(/^\/o\/([^/]+)\/(?:dashboard|manage(?:\/|$))/);
  const orgSlug = organizerMatch?.[1];

  // ── Organizer sidebar state (mobile only) ──────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── User profile dropdown state ────────────────────────────────
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem("unlockedCodes");
    logout();
    navigate("/login");
  };

  if (location.pathname.startsWith("/platform-admin")) return children;

  // ── ORGANIZER CONSOLE LAYOUT ──────────────────────────────────
  if (orgSlug && user) {
    const organizationLinks = [
      ["Overview", `/o/${orgSlug}/dashboard`, LayoutDashboard],
      ["Events", `/o/${orgSlug}/manage/events`, Calendar],
      ["Venues", `/o/${orgSlug}/manage/venues`, MapPin],
      ["Bundles", `/o/${orgSlug}/manage/bundles`, Package],
      ["Seat Changes", `/o/${orgSlug}/manage/seat-changes`, RefreshCw],
      ["Analytics", `/o/${orgSlug}/manage/analytics`, BarChart3],
      ["Team", `/o/${orgSlug}/manage/team`, Users2],
      ["Settings", `/o/${orgSlug}/manage/settings`, Settings],
    ];

    return (
      <div className="organizer-shell">
        {/* ── Sidebar ── */}
        <aside className={`organizer-sidebar${sidebarOpen ? " is-open" : ""}`}>
          {/* Close button — only visible on mobile */}
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>

          <Link to="/" className="display sidebar-brand" onClick={() => setSidebarOpen(false)}>
            <Logo width="130" height="36" />
          </Link>
          <p className="sidebar-caption">ORGANIZER CONSOLE</p>
          <nav className="sidebar-nav" aria-label="Organization navigation">
            <NavLink
              to="/browse"
              className="sidebar-link sidebar-link--global"
              onClick={() => setSidebarOpen(false)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Building2 size={16} />
                <span>My Organizations</span>
              </div>
            </NavLink>
            <span className="sidebar-divider" />
            <p className="sidebar-caption">THIS ORGANIZATION</p>
            {organizationLinks.map(([label, to, Icon]) => (
              <NavLink
                key={to}
                to={to}
                end={label === "Overview"}
                className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon size={16} />
                  <span>{label}</span>
                </div>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-user">
            <span>{user.name}</span>
            <button type="button" onClick={handleLogout}>Log out <b>→</b></button>
          </div>
        </aside>

        {/* ── Backdrop overlay (mobile only) ── */}
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── Main content ── */}
        <div className="organizer-stage">
          <header className="organizer-mobile-header">
            {/* Hamburger — only on mobile */}
            <button
              className={`hamburger-btn platform-hamburger ${sidebarOpen ? "is-active" : ""}`}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <div className="hamburger-box">
                <span className="hamburger-line line-1"></span>
                <span className="hamburger-line line-2"></span>
                <span className="hamburger-line line-3"></span>
              </div>
            </button>
            <Link to="/" className="display organizer-mobile-logo">
              <Logo width="110" height="30" />
            </Link>
            <span className="organizer-mobile-slug">{orgSlug}</span>
          </header>
          <main className="organizer-main">{children}</main>
          <AICopilot />
        </div>
      </div>
    );
  }

  // ── PUBLIC / LOGGED-IN USER LAYOUT ───────────────────────────
  return (
    <div className="app-shell">
      <header className="app-header" style={{ padding: "24px 0 18px" }}>
        <div className="container" style={styles.headerRow}>
          <Link to="/" className="display" style={styles.logo}>
            <Logo width="130" height="36" />
          </Link>

          <nav className="layout-nav" style={styles.nav}>
            {user ? (
              <>
                {/* Desktop links — hidden on mobile */}
                <Link to="/browse" className="nav-login nav-desktop-only">My Organizations</Link>
                <Link to="/cart" className="nav-personal-link nav-desktop-only" aria-label="View cart">
                  <ShoppingCart size={15} aria-hidden="true" /> <span>Cart</span>
                </Link>
                <Link to="/my/dashboard" className="nav-personal-link nav-desktop-only" aria-label="Open wallet">
                  <WalletCards size={15} aria-hidden="true" /> <span>Wallet</span>
                </Link>
                <Link to="/profile" className="nav-personal-link nav-desktop-only" aria-label="View profile">
                  <User size={15} aria-hidden="true" /> <span>Profile</span>
                </Link>
                <span className="nav-username nav-desktop-only">{user.name}</span>
                <button className="btn btn-ghost nav-desktop-only" onClick={handleLogout} style={styles.navBtn}>
                  Log out
                </button>

                {/* ── Mobile profile dropdown trigger ── */}
                <div className="nav-profile-menu" ref={profileRef}>
                  <button
                    className="nav-profile-btn"
                    onClick={() => setProfileOpen((o) => !o)}
                    aria-label="User menu"
                    aria-expanded={profileOpen}
                  >
                    <div className="nav-avatar">
                      {user.name?.[0]?.toUpperCase() || "U"}
                    </div>
                  </button>

                  {profileOpen && (
                    <div className="nav-dropdown">
                      <div className="nav-dropdown-header">
                        <span className="nav-dropdown-name">{user.name}</span>
                      </div>
                      <Link to="/browse" className="nav-dropdown-item" onClick={() => setProfileOpen(false)}>
                        <Building2 size={15} /> My Organizations
                      </Link>
                      <Link to="/cart" className="nav-dropdown-item" onClick={() => setProfileOpen(false)}>
                        <ShoppingCart size={15} /> Cart
                      </Link>
                      <Link to="/my/dashboard" className="nav-dropdown-item" onClick={() => setProfileOpen(false)}>
                        <WalletCards size={15} /> Wallet
                      </Link>
                      <Link to="/profile" className="nav-dropdown-item" onClick={() => setProfileOpen(false)}>
                        <User size={15} /> Profile
                      </Link>
                      <button className="nav-dropdown-item nav-dropdown-logout" onClick={handleLogout}>
                        <LogOut size={15} /> Log out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-login">Log in</Link>
                <Link to="/signup" className="nav-signup">Sign up <span>→</span></Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <hr className="tear-line" />
      <main
        className={location.pathname === "/" ? "app-main app-main--landing" : "container app-main"}
        style={location.pathname === "/" ? undefined : { padding: "40px 24px 80px" }}
      >
        {children}
      </main>
      <AICopilot />
    </div>
  );
};

const styles = {
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    fontSize: 28,
    color: "var(--paper)",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  navBtn: {
    color: "var(--paper)",
    borderColor: "rgba(247,242,231,0.35)",
    background: "transparent",
    padding: "6px 14px",
  },
};

export default Layout;
