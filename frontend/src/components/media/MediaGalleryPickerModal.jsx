import { useState, useEffect } from "react";
import apiClient from "../../api/client";

export default function MediaGalleryPickerModal({ orgSlug, isOpen, onClose, onSelect, selectedUrl }) {
  const [assets, setAssets] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const loadAssets = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await apiClient.get(`/o/${orgSlug}/media`, {
        params: { search },
      });
      setAssets(res.data.assets || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load media gallery.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAssets();
    }
  }, [isOpen, search]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);

    try {
      setUploading(true);
      setError("");
      const res = await apiClient.post(`/o/${orgSlug}/media`, fd);
      const newAsset = res.data.asset;
      setAssets((prev) => [newAsset, ...prev]);
      onSelect(newAsset.url);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(8, 11, 25, 0.85)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 700,
          background: "#111326",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 className="font-display text-2xl text-paper" style={{ margin: 0 }}>Choose from Media Gallery</h3>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0" }}>Select an asset or upload a new one directly</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: 24,
              cursor: "pointer",
              opacity: 0.7,
            }}
          >
            &times;
          </button>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search by filename..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: "#080b12",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "10px 16px",
              color: "#fff",
              outline: "none",
              fontSize: 14,
            }}
          />
          <label
            style={{
              background: "var(--gold-soft)",
              color: "var(--ink)",
              fontWeight: 700,
              padding: "10px 20px",
              borderRadius: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              fontSize: 14,
              opacity: uploading ? 0.7 : 1,
              pointerEvents: uploading ? "none" : "auto",
            }}
          >
            {uploading ? "Uploading..." : "+ Upload Image"}
            <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>

        {error && (
          <div style={{ color: "#ef4444", background: "rgba(239, 68, 68, 0.1)", padding: "12px 16px", borderRadius: 12, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Thumbnails list */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 250, paddingRight: 4 }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px" }}>
              <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "var(--gold-soft)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            </div>
          ) : assets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
              No images found in your gallery. Try uploading a new one!
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 16 }}>
              {assets.map((asset) => {
                const isSelected = selectedUrl === asset.url;
                return (
                  <div
                    key={asset._id}
                    onClick={() => {
                      onSelect(asset.url);
                      onClose();
                    }}
                    style={{
                      position: "relative",
                      borderRadius: 16,
                      overflow: "hidden",
                      border: isSelected ? "3.5px solid var(--gold)" : "2px solid rgba(255,255,255,0.06)",
                      aspectRatio: "1",
                      cursor: "pointer",
                      background: "#080b12",
                      transition: "transform 0.2s ease, border-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <img
                      src={asset.url}
                      alt={asset.originalName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "rgba(8,11,25,0.85)",
                        padding: "6px 8px",
                        fontSize: 10,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                      }}
                    >
                      {asset.originalName}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
