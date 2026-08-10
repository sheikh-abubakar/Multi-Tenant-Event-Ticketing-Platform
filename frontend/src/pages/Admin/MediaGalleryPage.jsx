import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import apiClient from "../../api/client";

export default function MediaGalleryPage() {
  const { orgSlug } = useParams();
  const [assets, setAssets] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const loadAssets = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await apiClient.get(`/o/${orgSlug}/media`, {
        params: { search },
      });
      setAssets(res.data.assets || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load media assets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [orgSlug, search]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");

    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiClient.post(`/o/${orgSlug}/media`, fd);
        setAssets((prev) => [res.data.asset, ...prev]);
      }
    } catch (err) {
      setError(err.response?.data?.message || "One or more uploads failed.");
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset input file
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this image from your gallery?")) return;

    try {
      await apiClient.delete(`/o/${orgSlug}/media/${id}`);
      setAssets((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete media asset.");
    }
  };

  const copyToClipboard = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "30px 20px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20, marginBottom: 30 }}>
        <div>
          <h1 className="font-display text-4xl text-paper" style={{ margin: 0 }}>Media Gallery</h1>
          <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 14 }}>
            Manage and upload images that you can reuse across venues, events, and bundles.
          </p>
        </div>

        <label
          style={{
            background: "var(--gold-soft)",
            color: "var(--ink)",
            fontWeight: 700,
            padding: "12px 24px",
            borderRadius: 12,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            fontSize: 14,
            transition: "opacity 0.2s",
            opacity: uploading ? 0.7 : 1,
            pointerEvents: uploading ? "none" : "auto",
            boxShadow: "0 4px 15px rgba(245, 178, 52, 0.2)",
          }}
        >
          {uploading ? "Uploading Assets..." : "Upload Images"}
          <input type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: "none" }} />
        </label>
      </div>

      {error && (
        <div style={{ color: "#ef4444", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "16px 20px", borderRadius: 16, marginBottom: 24, fontSize: 14 }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Filter and Stats Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#111326",
          padding: "16px 24px",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.05)",
          marginBottom: 30,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <input
          type="text"
          placeholder="Filter images by filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#080b12",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "10px 18px",
            color: "#fff",
            outline: "none",
            fontSize: 14,
            width: "100%",
            maxWidth: 400,
          }}
        />

        <div style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
          Total Images: <span style={{ color: "#fff" }}>{assets.length}</span>
        </div>
      </div>

      {/* Grid List */}
      {loading && assets.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "100px 0" }}>
          <div style={{ width: 45, height: 45, border: "4px solid rgba(255,255,255,0.1)", borderTopColor: "var(--gold-soft)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>
      ) : assets.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 20px",
            background: "#111326",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.04)",
            color: "var(--muted)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
          <h3 style={{ color: "#fff", margin: "0 0 8px", fontSize: 18 }}>No images in gallery</h3>
          <p style={{ margin: 0, fontSize: 14 }}>Upload banner or logo images using the top button to start building your gallery.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 24 }}>
          {assets.map((asset) => (
            <div
              key={asset._id}
              style={{
                background: "#111326",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: 20,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
                transition: "transform 0.3s ease, border-color 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "rgba(245, 178, 52, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
              }}
            >
              {/* Image box */}
              <div
                style={{
                  position: "relative",
                  background: "#080b12",
                  width: "100%",
                  paddingTop: "65%", // landscape aspect ratio
                  overflow: "hidden",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <img
                  src={asset.url}
                  alt={asset.originalName}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>

              {/* Details and Actions */}
              <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                <div>
                  <h4
                    style={{
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      margin: "0 0 4px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={asset.originalName}
                  >
                    {asset.originalName}
                  </h4>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 11, marginBottom: 14 }}>
                    <span>{formatBytes(asset.size)}</span>
                    <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => copyToClipboard(asset.url, asset._id)}
                    style={{
                      flex: 1,
                      background: copiedId === asset._id ? "rgba(16, 185, 129, 0.1)" : "rgba(255, 255, 255, 0.04)",
                      border: "1px solid " + (copiedId === asset._id ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.08)"),
                      borderRadius: 10,
                      padding: "8px 12px",
                      color: copiedId === asset._id ? "#10b981" : "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                  >
                    {copiedId === asset._id ? "Copied! ✓" : "Copy Link"}
                  </button>

                  <button
                    onClick={() => handleDelete(asset._id)}
                    style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: 10,
                      padding: "8px 12px",
                      color: "#ef4444",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                      transition: "all 0.2s",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
