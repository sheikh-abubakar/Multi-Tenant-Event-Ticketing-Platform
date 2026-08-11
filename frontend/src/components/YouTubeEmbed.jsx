import { useState } from "react";
import "./YouTubeEmbed.css";

/**
 * Extracts YouTube video ID from any common YouTube URL format:
 *  - https://www.youtube.com/watch?v=VIDEO_ID
 *  - https://youtu.be/VIDEO_ID
 *  - https://www.youtube.com/embed/VIDEO_ID
 *  - https://www.youtube.com/shorts/VIDEO_ID
 */
export function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * A cinematic YouTube embed component.
 *
 * Props:
 *  - youtubeUrl  {string}  Raw YouTube URL
 *  - eventName   {string}  Name of the event (shown in the text panel below)
 *  - description {string}  Event description (shown below the video)
 *  - label       {string}  Section heading label (default: "Official Video")
 */
export default function YouTubeEmbed({ youtubeUrl, eventName, description, label = "Official Video" }) {
  const videoId = extractYouTubeId(youtubeUrl);
  const [playing, setPlaying] = useState(false);

  if (!videoId) return null;

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const sdFallback = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white`;

  return (
    <section className="yt-section" aria-label="Event video">
      {/* Section label */}
      <div className="yt-label-row">
        <span className="yt-label-dot" />
        <span className="yt-label-text">{label}</span>
      </div>

      {/* Video player */}
      <div className="yt-player-wrap">
        {!playing ? (
          <button
            className="yt-thumbnail-btn"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${label} video`}
          >
            <img
              src={thumbnailUrl}
              alt={`${eventName || "Event"} video thumbnail`}
              className="yt-thumbnail-img"
              onError={(e) => { e.target.src = sdFallback; }}
            />
            {/* Cinematic dark gradient overlay */}
            <div className="yt-overlay" />
            {/* YouTube-style play button */}
            <div className="yt-play-btn" aria-hidden="true">
              <svg viewBox="0 0 68 48" className="yt-play-svg">
                <path
                  className="yt-play-shape"
                  d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"
                />
                <path className="yt-play-arrow" d="M 45,24 27,14 27,34" />
              </svg>
            </div>
            {/* Hover shimmer */}
            <div className="yt-hover-shimmer" />
          </button>
        ) : (
          <iframe
            src={embedSrc}
            title={`${eventName || "Event"} — Official Video`}
            className="yt-iframe"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>

      {/* Cinematic info panel below the video */}
      {(eventName || description) && (
        <div className="yt-info-panel">
          {eventName && <h3 className="yt-info-title">{eventName}</h3>}
          {description && <p className="yt-info-desc">{description}</p>}
        </div>
      )}
    </section>
  );
}
