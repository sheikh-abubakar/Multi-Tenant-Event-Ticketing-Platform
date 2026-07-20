import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div>
      <header style={{ padding: "24px 0 18px" }}>
        <div className="container" style={styles.headerRow}>
          <Link to="/" className="display" style={styles.logo}>
            Stagepass
          </Link>
          <nav style={styles.nav}>
            {user ? (
              <>
                <Link to="/my/dashboard" style={{ color: "var(--gold)", fontSize: 13, fontWeight: 600 }}>
                  My Dashboard
                </Link>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {user.name}
                </span>
                <button className="btn btn-ghost" onClick={handleLogout} style={styles.navBtn}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Log in</Link>
                <Link to="/signup">Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <hr className="tear-line" />
      <main className="container" style={{ padding: "40px 24px 80px" }}>
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
