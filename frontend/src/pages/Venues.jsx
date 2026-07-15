import { useParams, Link } from "react-router-dom";

const Venues = () => {
  const { orgSlug } = useParams();
  return (
    <div>
      <p>
        <Link to={`/o/${orgSlug}/dashboard`}>&larr; Back to dashboard</Link>
      </p>
      <h1 style={{ color: "var(--paper)" }}>Venues</h1>
      <p style={{ color: "var(--muted)" }}>
        Venue management UI is coming next — the backend CRUD is already live.
      </p>
    </div>
  );
};

export default Venues;
