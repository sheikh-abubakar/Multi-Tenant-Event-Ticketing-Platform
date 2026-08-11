import "./AnimatedEyeIcon.css";

/**
 * Premium animated eye icon component for show/hide password fields.
 *
 * Props:
 *  - isOpen {boolean} True if password is shown (eye open), False if hidden (eye closed)
 */
export default function AnimatedEyeIcon({ isOpen }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`premium-eye-icon ${isOpen ? "is-open" : "is-closed"}`}
      aria-hidden="true"
    >
      {/* Pupil */}
      <circle cx="12" cy="12" r="3" className="eye-pupil" />

      {/* Upper Eyelid (morphs using path d in CSS) */}
      <path className="eye-upper-lid" />

      {/* Lower Eyelid (always curved down) */}
      <path d="M3 12C3 12 7 19 12 19C17 19 21 12 21 12" className="eye-lower-lid" />

      {/* Eyelashes (appear when closed, closed eye lashes point outwards/down) */}
      <line x1="12" y1="19" x2="12" y2="22" className="eyelash lash-center" />
      <line x1="7.5" y1="17" x2="5.5" y2="19.5" className="eyelash lash-left" />
      <line x1="16.5" y1="17" x2="18.5" y2="19.5" className="eyelash lash-right" />
      <line x1="4.5" y1="14" x2="2.5" y2="15.5" className="eyelash lash-far-left" />
      <line x1="19.5" y1="14" x2="21.5" y2="15.5" className="eyelash lash-far-right" />
    </svg>
  );
}
