import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Link2, Sparkles } from "lucide-react";
import apiClient from "../api/client";
import "./BuyerContextPages.css";

const CreateOrganization = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", slug: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      const payload = { name: form.name };
      if (form.slug.trim()) payload.slug = form.slug.trim();
      const { data } = await apiClient.post("/organizations", payload);
      navigate(`/o/${data.organization.slug}/dashboard`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create organization.");
    } finally { setLoading(false); }
  };

  return <div className="create-org-page buyer-context-page">
    <Link to="/browse" className="buyer-hub-back"><ArrowLeft size={15} /> Back to browse</Link>
    <header className="buyer-context-heading"><div><p>ORGANIZER ONBOARDING</p><h1>Build your stage.</h1><span>Create an organization and begin shaping memorable events.</span></div><Building2 size={42} /></header>
    <div className="create-org-grid">
      <div className="create-org-card">
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="name"><Building2 size={14} /> Organization name</label><input id="name" name="name" placeholder="Coke Studio Events" value={form.name} onChange={handleChange} required /></div>
          <div className="field"><label htmlFor="slug"><Link2 size={14} /> URL slug (optional)</label><input id="slug" name="slug" placeholder="Auto-generated if left blank" value={form.slug} onChange={handleChange} /></div>
          <button className="btn btn-primary create-org-submit" type="submit" disabled={loading}>{loading ? "Creating…" : "Create organization"}</button>
        </form>
      </div>
      <aside className="create-org-benefits"><Sparkles size={24} /><h2>Your organizer workspace</h2><p>Once created, you become the owner with full control of your workspace.</p><ul><li><CheckCircle2 size={15} /> Build venues and seat maps</li><li><CheckCircle2 size={15} /> Publish events and bundles</li><li><CheckCircle2 size={15} /> Invite and manage your team</li><li><CheckCircle2 size={15} /> Track bookings and analytics</li></ul></aside>
    </div>
  </div>;
};

export default CreateOrganization;
