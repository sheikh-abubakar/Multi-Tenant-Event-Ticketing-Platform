import { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";

const CreateOrganization = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", slug: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // slug is optional — backend auto-generates one from the name
      // if left blank (see backend/src/utils/slugify.js).
      const payload = { name: form.name };
      if (form.slug.trim()) payload.slug = form.slug.trim();

      const { data } = await apiClient.post("/organizations", payload);
      navigate(`/o/${data.organization.slug}/dashboard`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create organization.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-org-page" style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ color: "var(--paper)", marginBottom: 8 }}>Create your organization</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        You'll become the owner of this organization and can invite your team later.
      </p>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Organization name</label>
            <input
              id="name"
              name="name"
              placeholder="Coke Studio Events"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="slug">URL slug (optional)</label>
            <input
              id="slug"
              name="slug"
              placeholder="Auto-generated if left blank"
              value={form.slug}
              onChange={handleChange}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Creating…" : "Create organization"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateOrganization;
