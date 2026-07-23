import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import SeatMapBuilder from "../components/seatmap/SeatMapBuilder";

export default function VenueSeatMapBuilder() {
  const { orgSlug, venueId, seatmapId } = useParams(); const navigate = useNavigate(); const [map, setMap] = useState(null); const [error, setError] = useState("");
  useEffect(() => { apiClient.get(`/o/${orgSlug}/venues/${venueId}/seatmaps`).then(({ data }) => setMap(data.seatmaps.find((item) => item.id === seatmapId) || null)).catch((err) => setError(err.response?.data?.message || "Could not load template.")); }, [orgSlug, venueId, seatmapId]);
  const save = async (seatmap) => {
    setError("");
    try {
      // `/new` is only a UI route. It must always create first; subsequent
      // saves use the persisted map id returned by MongoDB, never the URL
      // placeholder or a stale client-generated id.
      const persistedId = map?.id;
      const request = persistedId
        ? apiClient.put(`/o/${orgSlug}/venues/${venueId}/seatmaps/${persistedId}`, { seatmap: { ...seatmap, id: persistedId } })
        : apiClient.post(`/o/${orgSlug}/venues/${venueId}/seatmaps`, { seatmap });
      const { data } = await request;
      setMap(data.seatmap);
      if (!persistedId) navigate(`/o/${orgSlug}/manage/venues/${venueId}/seatmaps/${data.seatmap.id}`, { replace: true });
    } catch (err) { setError(err.response?.data?.message || "Could not save template."); throw err; }
  };
  return <div><Link to={`/o/${orgSlug}/manage/venues`} className="text-gold-soft">← Back to venues</Link>{error && <p className="mt-4 text-danger">{error}</p>}<div className="mt-5"><SeatMapBuilder value={map} onSave={save} title="Venue seat-map builder" /></div></div>;
}
