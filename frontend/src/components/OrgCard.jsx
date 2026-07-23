import { useNavigate } from "react-router-dom";
import { gradientForOrg } from "../utils/orgTheme";

const OrgCard = ({ organization, role }) => {
  const navigate = useNavigate();

  return (
    <button
      className="browse-hub__org-card"
      onClick={() =>
        navigate(`/o/${organization.slug}/dashboard`, {
          // Dashboard can paint its header immediately with this,
          // instead of showing a blank/loading state until /whoami
          // resolves — the API call still happens for the real
          // (security-authoritative) permissions data.
          state: { organization, role },
        })
      }
      style={styles.card}
      aria-label={`Open ${organization.name} dashboard`}
    >
      <div style={{ ...styles.banner, backgroundImage: gradientForOrg(organization.slug) }}>
        <span className="badge" style={styles.roleBadge}>
          {role}
        </span>
      </div>
      <div style={styles.body}>
        <h3 style={styles.name}>{organization.name}</h3>
        <p style={styles.slug}>/o/{organization.slug}</p>
      </div>
    </button>
  );
};

const styles = {
  card: {
    display: "block",
    textAlign: "left",
    width: "100%",
    padding: 0,
    border: "none",
    borderRadius: "var(--radius)",
    overflow: "hidden",
    background: "var(--paper)",
    boxShadow: "var(--shadow)",
    cursor: "pointer",
  },
  banner: {
    height: 96,
    position: "relative",
  },
  roleBadge: {
    position: "absolute",
    bottom: 10,
    left: 12,
    background: "rgba(20, 22, 43, 0.55)",
    color: "#fff",
  },
  body: {
    padding: "14px 16px 18px",
  },
  name: {
    margin: 0,
    fontSize: 20,
    color: "var(--text)",
  },
  slug: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
  },
};

export default OrgCard;
