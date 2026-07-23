import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Layout.css";
import "./PageVisuals.css";

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const organizerMatch = location.pathname.match(/^\/o\/([^/]+)\/(?:dashboard|manage(?:\/|$))/);
  const orgSlug = organizerMatch?.[1];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (orgSlug && user) {
    const organizationLinks = [
      ["Overview", `/o/${orgSlug}/dashboard`],
      ["Events", `/o/${orgSlug}/manage/events`],
      ["Venues", `/o/${orgSlug}/manage/venues`],
      ["Analytics", `/o/${orgSlug}/manage/analytics`],
      ["Team", `/o/${orgSlug}/manage/team`],
      ["Settings", `/o/${orgSlug}/manage/settings`],
    ];

    return (
      <div className="organizer-shell">
        <aside className="organizer-sidebar">
          <Link to="/" className="display sidebar-brand">Stagepass</Link>
          <p className="sidebar-caption">ORGANIZER CONSOLE</p>
          <nav className="sidebar-nav" aria-label="Organization navigation">
            <NavLink to="/browse" className="sidebar-link sidebar-link--global">My Organizations</NavLink>
            <span className="sidebar-link sidebar-link--disabled" title="Cart opens from a specific event">View Cart <small>EVENT</small></span>
            <NavLink to="/my/dashboard" className="sidebar-link sidebar-link--global">Wallet <small>ACCOUNT</small></NavLink>
            <span className="sidebar-divider" />
            <p className="sidebar-caption">THIS ORGANIZATION</p>
            {organizationLinks.map(([label, to]) => (
              <NavLink key={to} to={to} end={label === "Overview"} className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-user">
            <span>{user.name}</span>
            <button type="button" onClick={handleLogout}>Log out <b>→</b></button>
          </div>
        </aside>
        <div className="organizer-stage">
          <header className="organizer-mobile-header"><Link to="/" className="display">Stagepass</Link><span>{orgSlug}</span></header>
          <main className="organizer-main">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header" style={{ padding: "24px 0 18px" }}>
        <div className="container" style={styles.headerRow}>
          <Link to="/" className="display" style={styles.logo}>
            Stagepass
          </Link>
          <nav className="layout-nav" style={styles.nav}>
            {user ? (
              <>
                <Link to="/browse" className="nav-login">My Organizations</Link>
                <Link to="/my/dashboard" className="nav-login">My Tickets</Link>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {user.name}
                </span>
                <button className="btn btn-ghost" onClick={handleLogout} style={styles.navBtn}>
                  Log out
                </button>
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
