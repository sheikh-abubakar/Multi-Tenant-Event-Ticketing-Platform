import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import apiClient from "../api/client";
import CouponsTab from "../components/org/CouponsTab";
import MediaGalleryPickerModal from "../components/media/MediaGalleryPickerModal";

const OrgSettings = () => {
  const { orgSlug } = useParams();
  const navigate = useNavigate();

  const [org, setOrg] = useState(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("general"); // "general" or "coupons"

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get(`/o/${orgSlug}/settings`)
      .then(({ data }) => {
        if (cancelled) return;
        setOrg(data.organization);
        setName(data.organization.name);
        setSlug(data.organization.slug);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load settings for this organization.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    setLogoFile(file || null);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleGallerySelect = (url) => {
    setLogoFile(null);
    setLogoPreview(url);
    setGalleryOpen(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("slug", slug);
    if (logoFile) {
      formData.append("logo", logoFile);
    } else if (logoPreview && logoPreview !== org?.logoUrl) {
      // Gallery-selected URL that differs from the existing one
      formData.append("logoUrl", logoPreview);
    }

    try {
      const { data } = await apiClient.put(`/o/${orgSlug}/settings`, formData);
      setOrg(data.organization);
      setSuccessMsg("Settings saved.");

      if (data.organization.slug !== orgSlug) {
        navigate(`/o/${data.organization.slug}/manage/settings`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await apiClient.delete(`/o/${orgSlug}/settings`);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete this organization.");
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-muted">Loading settings…</p>;
  }

  if (error && !org) {
    return (
      <div className="max-w-md rounded-xl bg-paper p-6 text-ink-text shadow-lg">
        <h3 className="mt-0 text-danger font-semibold">Access denied</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="settings-page mx-auto max-w-2xl">
      <p className="mb-4">
        <Link to={`/o/${orgSlug}/dashboard`} className="text-gold-soft hover:underline">
          &larr; Back to dashboard
        </Link>
      </p>

      <h1 className="font-display text-4xl text-paper mb-1">Organization settings</h1>
      <p className="text-muted mb-6">Update your public details, manage settings, or configure coupon codes.</p>

      {/* Tabs Switcher */}
      <div className="flex border-b border-black/10 mb-6 gap-2">
        <button
          onClick={() => setActiveTab("general")}
          style={{
            padding: "8px 16px",
            borderBottom: activeTab === "general" ? "2px solid var(--gold)" : "none",
            color: activeTab === "general" ? "var(--gold)" : "var(--paper)",
            background: "none",
            border: "none",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          General Profile
        </button>
        <button
          onClick={() => setActiveTab("coupons")}
          style={{
            padding: "8px 16px",
            borderBottom: activeTab === "coupons" ? "2px solid var(--gold)" : "none",
            color: activeTab === "coupons" ? "var(--gold)" : "var(--paper)",
            background: "none",
            border: "none",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          Coupon Codes
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-success">
          {successMsg}
        </div>
      )}

      {activeTab === "general" ? (
        <>
          <form
            onSubmit={handleSave}
            className="rounded-xl bg-paper p-6 shadow-lg space-y-5"
          >
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-soft ring-1 ring-black/10">
                {(logoPreview || org?.logoUrl) ? (
                  <img
                    src={logoPreview || org.logoUrl}
                    alt="Organization logo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                    No logo
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                  Logo
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoChange}
                  className="text-sm text-ink-text file:mr-3 file:rounded-md file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-gold-soft"
                />
                <button
                  type="button"
                  onClick={() => setGalleryOpen(true)}
                  style={{
                    marginTop: 8,
                    padding: "5px 12px",
                    background: "rgba(245, 178, 52, 0.1)",
                    border: "1px solid rgba(245, 178, 52, 0.4)",
                    borderRadius: 8,
                    color: "var(--gold)",
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  🖼️ Choose from Gallery
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                Organization name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>

            <div>
              <label htmlFor="slug" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                URL slug
              </label>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 font-mono text-sm text-ink-text focus:outline-none focus:ring-2 focus:ring-gold"
              />
              <p className="mt-1 text-xs text-muted">
                Changing this changes your public storefront URL: /o/{slug || "..."}/events
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>

          {/* Danger zone */}
          <div className="mt-10 rounded-xl border-2 border-danger/40 bg-red-50 p-6">
            <h3 className="mt-0 text-danger font-semibold text-lg">Danger zone</h3>
            <p className="text-sm text-ink-text/80 mt-1 mb-4">
              Deleting this organization hides it and all of its events from
              everyone immediately. Your data is not permanently erased — it's
              kept for records — but this cannot be undone from this screen.
            </p>

            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Type <span className="font-mono">{org?.slug}</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full max-w-xs rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-ink-text mb-3"
              placeholder={org?.slug}
            />

            <button
              onClick={handleDelete}
              disabled={confirmText !== org?.slug || deleting}
              className="rounded-md bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting…" : "Delete organization"}
            </button>
          </div>
        </>
      ) : (
        <CouponsTab orgSlug={orgSlug} />
      )}
      <MediaGalleryPickerModal
        orgSlug={orgSlug}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        selectedUrl={logoPreview || org?.logoUrl}
        onSelect={handleGallerySelect}
      />
    </div>
  );
};

export default OrgSettings;
