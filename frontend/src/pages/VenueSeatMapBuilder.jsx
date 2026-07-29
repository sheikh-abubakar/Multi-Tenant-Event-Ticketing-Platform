import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import SeatMapBuilder from "../components/seatmap/SeatMapBuilder";

export default function VenueSeatMapBuilder() {
  const { orgSlug, venueId, seatmapId } = useParams();
  const navigate = useNavigate();
  const [map, setMap] = useState(null);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg("");
    }, 4000);
  };

  useEffect(() => {
    apiClient
      .get(`/o/${orgSlug}/venues/${venueId}/seatmaps`)
      .then(({ data }) => setMap(data.seatmaps.find((item) => item.id === seatmapId) || null))
      .catch((err) => setError(err.response?.data?.message || "Could not load template."));
  }, [orgSlug, venueId, seatmapId]);

  const save = async (seatmap) => {
    setError("");
    try {
      // `/new` is only a UI route. It must always create first; subsequent
      // saves use the persisted map id returned by MongoDB, never the URL
      // placeholder or a stale client-generated id.
      const persistedId = map?.id;
      const request = persistedId
        ? apiClient.put(`/o/${orgSlug}/venues/${venueId}/seatmaps/${persistedId}`, {
            seatmap: { ...seatmap, id: persistedId },
          })
        : apiClient.post(`/o/${orgSlug}/venues/${venueId}/seatmaps`, { seatmap });
      const { data } = await request;
      setMap(data.seatmap);
      showToast("Venue template saved successfully!");
      if (!persistedId) {
        navigate(`/o/${orgSlug}/manage/venues/${venueId}/seatmaps/${data.seatmap.id}`, {
          replace: true,
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not save template.");
      throw err;
    }
  };

  return (
    <div>
      <Link to={`/o/${orgSlug}/manage/venues`} className="text-gold-soft">
        &larr; Back to venues
      </Link>
      {error && <p className="mt-4 text-danger">{error}</p>}
      <div className="mt-5">
        <SeatMapBuilder value={map} onSave={save} title="Venue seat-map builder" />
      </div>

      {toastMsg && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            backgroundColor: "#111827",
            color: "#f7f2e7",
            padding: "16px 24px",
            borderRadius: "12px",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            borderLeft: "4px solid #10b981",
            zIndex: 9999,
            fontFamily: "sans-serif",
            fontSize: "14px",
            fontWeight: "600",
            animation: "slideIn 0.3s ease-out",
          }}
        >
          ✅ {toastMsg}
        </div>
      )}
    </div>
  );
}
