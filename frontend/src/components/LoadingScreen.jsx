import { useEffect, useState } from "react";

/**
 * LoadingScreen — full-screen splash shown while the app initialises.
 * Uses the same ticket-icon mark as the logo/favicon with a gentle
 * pulse animation and animated "marching" perforation line.
 */
const LoadingScreen = () => {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setPulse((p) => !p), 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.wrapper}>
      <div
        style={{
          ...styles.markWrap,
          transform: pulse ? "scale(1.08)" : "scale(1)",
        }}
      >
        <svg width="72" height="72" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="loadingGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e8bf6c" />
              <stop offset="100%" stopColor="#c99a3c" />
            </linearGradient>
            <mask id="loadingTicketMask">
              <rect x="8" y="14" width="48" height="36" rx="9" fill="white" />
              <circle cx="8" cy="32" r="7" fill="black" />
              <circle cx="56" cy="32" r="7" fill="black" />
            </mask>
          </defs>
          <rect
            x="8" y="14" width="48" height="36" rx="9"
            fill="url(#loadingGoldGrad)"
            mask="url(#loadingTicketMask)"
          />
          <line
            x1="32" y1="21" x2="32" y2="43"
            stroke="#1e2030" strokeWidth="3"
            strokeDasharray="3.2 4" strokeLinecap="round"
            opacity="0.55"
            style={styles.tearLine}
          />
        </svg>
      </div>
      <p style={styles.label}>STAGEPASS</p>
    </div>
  );
};

const styles = {
  wrapper: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    background: "#0b0d17",
    zIndex: 9999,
  },
  markWrap: {
    filter: "drop-shadow(0 0 20px rgba(201, 154, 60, 0.45))",
    transition: "transform 1.4s ease-in-out",
  },
  tearLine: {
    animation: "stagepass-dash 2.2s linear infinite",
  },
  label: {
    margin: 0,
    color: "#f7f2e7",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.35em",
    opacity: 0.7,
  },
};

// Inject keyframes once — marching-ants effect on the dashed perforation
if (typeof document !== "undefined" && !document.getElementById("stagepass-loading-keyframes")) {
  const styleTag = document.createElement("style");
  styleTag.id = "stagepass-loading-keyframes";
  styleTag.textContent = `
    @keyframes stagepass-dash {
      to { stroke-dashoffset: -14; }
    }
  `;
  document.head.appendChild(styleTag);
}

export default LoadingScreen;
