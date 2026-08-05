import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";

export default function Bundles() {
  const { orgSlug } = useParams();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get(`/o/${orgSlug}/bundles`);
      setBundles(res.data.bundles || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load bundles.");
    } finally {
      setLoading(false);
    }
  };

  const removeBundle = async (bundleId) => {
    if (!window.confirm("Are you sure you want to delete this event bundle?")) return;
    try {
      await apiClient.delete(`/o/${orgSlug}/bundles/${bundleId}`);
      setBundles(prev => prev.filter(b => b._id !== bundleId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete bundle.");
    }
  };

  useEffect(() => {
    load();
  }, [orgSlug]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 className="font-display text-4xl text-paper" style={{ margin: 0 }}>Event Bundles</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>Manage special multi-event seat packages</p>
        </div>
        <Link to={`/o/${orgSlug}/manage/bundles/new`} className="rounded-lg bg-gold px-4 py-2 font-bold text-ink">
          + Create Bundle
        </Link>
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>Loading bundles…</p>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {!loading && !error && bundles.length === 0 && (
        <div className="rounded-2xl bg-paper p-10 text-ink-text shadow-lg" style={{ textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>No bundles created yet. Create one to sell multiple event seats together!</p>
        </div>
      )}

      {!loading && !error && bundles.length > 0 && (
        <div style={{ display: "grid", gap: 16 }}>
          {bundles.map((bundle) => (
            <article
              key={bundle._id}
              className="flex gap-4 rounded-2xl bg-paper p-5 text-ink-text shadow-lg"
              style={{ alignItems: "center" }}
            >
              {bundle.bannerImageUrl ? (
                <img
                  src={bundle.bannerImageUrl}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-20 rounded-lg bg-ink/10 flex items-center justify-center text-2xl">
                  📦
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl text-ink-text">{bundle.name}</h2>
                    <p className="text-sm text-muted" style={{ margin: "4px 0 8px" }}>
                      {bundle.description || "No description provided."}
                    </p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold">
                        📍 {bundle.venueId?.name}
                      </span>
                      <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold">
                        🗓️ {bundle.eventIds?.length || 0} events bundled
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div style={{ textAlign: "right" }}>
                      <div className="text-2xl font-bold text-gold-soft">${bundle.pricePerSeat}</div>
                      <div className="text-xs text-muted uppercase">per bundle</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/o/${orgSlug}/manage/bundles/${bundle._id}/edit`)}
                        className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-black/5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeBundle(bundle._id)}
                        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-danger hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
