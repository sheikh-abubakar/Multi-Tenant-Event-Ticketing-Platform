import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import apiClient from "../api/client";

const Dashboard = () => {
  const { orgSlug } = useParams();
  const location = useLocation();
  const initial = location.state || null;
  const [context, setContext] = useState(
    initial ? { organization: initial.organization, membership: { role: initial.role } } : null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      try {
        const { data } = await apiClient.get(`/o/${orgSlug}/whoami`);
        if (!cancelled) setContext(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Could not load this organization.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orgSlug]);

  if (error) {
    return <div className="rounded-xl bg-paper p-6 text-ink-text shadow-lg max-w-md"><h3 className="mt-0 font-semibold text-danger">Access denied</h3><p>{error}</p></div>;
  }

  const role = context?.membership?.role;

  return (
    <div className="dashboard-page">
      <Link to="/browse" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gold-soft hover:underline">
        <ArrowLeft size={15} /> My organizations
      </Link>

      {context ? (
        <header className="dashboard-page__heading">
          <p>ORGANIZATION OVERVIEW</p>
          <div><h1>{context.organization.name}</h1><span className="badge">{role}</span></div>
          <small>/o/{context.organization.slug}</small>
        </header>
      ) : (
        <div className="dashboard-page__skeleton animate-pulse"><div /><span /></div>
      )}

      <section className="dashboard-console" aria-label="Organization overview">
        <div className="dashboard-console__hero">
          <p className="dashboard-console__eyebrow">CURRENT WORKSPACE</p>
          <h2>{loading ? "Preparing your stage…" : "Your stage is ready."}</h2>
          <p>Use the sidebar to build events, prepare venues, review performance and manage the people behind your shows.</p>
          <span className="dashboard-console__stamp">STAGEPASS / {role || "MEMBER"}</span>
        </div>
        <div className="dashboard-console__guide">
          <article><span>01</span><div><h3>Shape the experience</h3><p>Set up venues and seat maps before you publish an event.</p></div></article>
          <article><span>02</span><div><h3>Bring the crowd in</h3><p>Create events, control ticketing and share your storefront.</p></div></article>
          <article><span>03</span><div><h3>Keep the show moving</h3><p>Track sales and manage your team from the workspace navigation.</p></div></article>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
