import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import SeatMapBuilder from "../components/seatmap/SeatMapBuilder";

export default function EventSeatMapBuilder() {
  const { orgSlug, eventId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "";

  const [map, setMap] = useState(null);
  const [event, setEvent] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg("");
    }, 4000);
  };

  useEffect(() => {
    (async () => {
      try {
        const eventResponse = await apiClient.get(`/o/${orgSlug}/events/${eventId}`);
        const loadedEvent = eventResponse.data.event;
        setEvent(loadedEvent);
        const venueId = loadedEvent.venueId?._id || loadedEvent.venueId;
        const [mapResult, templateResult] = await Promise.allSettled([
          apiClient.get(`/o/${orgSlug}/events/${eventId}/seatmap?sessionId=${sessionId}`),
          apiClient.get(`/o/${orgSlug}/venues/${venueId}/seatmaps`),
        ]);
        if (mapResult.status === "fulfilled") {
          setMap(mapResult.value.data.seatmap);
        } else if (mapResult.reason?.response?.status !== 404) {
          throw mapResult.reason;
        }
        if (templateResult.status === "fulfilled") {
          setTemplates(templateResult.value.data.seatmaps);
        } else {
          throw templateResult.reason;
        }
      } catch (err) {
        setError(err.response?.data?.message || "Could not load event seat map.");
      }
    })();
  }, [orgSlug, eventId, sessionId]);

  const save = async (seatmap) => {
    try {
      const { data } = await apiClient.put(`/o/${orgSlug}/events/${eventId}/seatmap?sessionId=${sessionId}`, { seatmap });
      setMap(data.seatmap);
      showToast("Seat map saved successfully!");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save seat map.");
    }
  };

  const seed = async (seatmapId) => {
    if (map && !window.confirm("Replace the current unsaved layout with this venue template?")) return;
    try {
      const { data } = await apiClient.post(`/o/${orgSlug}/events/${eventId}/seatmap/seed`, { seatmapId, sessionId });
      setMap(data.seatmap);
      showToast("Seat map template loaded successfully!");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load template.");
    }
  };

  return (
    <div>
      <Link to={`/o/${orgSlug}/manage/events`} className="text-gold-soft">
        &larr; Back to events
      </Link>
      {error && <p className="mt-4 text-danger">{error}</p>}
      
      {!map && (
        <div className="mt-5 rounded-2xl bg-paper p-5 text-ink-text">
          <h2 className="font-display text-xl">Venue templates</h2>
          <p className="text-sm text-muted">
            Templates define layout only. Set ticket prices after selecting a template in this event editor.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => seed(template.id)}
                className="rounded-lg bg-ink px-4 py-2 text-sm text-paper"
              >
                Use {template.name}
              </button>
            ))}
            {!templates.length && (
              <span className="text-sm text-muted">No saved template for this venue yet.</span>
            )}
            <button
              onClick={() =>
                setMap({
                  name: event?.name || "Event seating",
                  boundary: { width: 1200, height: 800, color: "#06080d" },
                  shapes: [],
                  blocks: [],
                  sections: [],
                })
              }
              className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink"
            >
              Start blank
            </button>
          </div>
        </div>
      )}

      {map && (
        <div className="mt-5">
          <SeatMapBuilder
            value={map}
            onSave={save}
            eventMode
            title={`${event?.name || "Event"} seat-map builder`}
          />
        </div>
      )}

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
