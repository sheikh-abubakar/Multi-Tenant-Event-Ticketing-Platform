import { useEffect, useRef } from "react";

const seatPosition = (block, seat) => {
  const gap = Number(block.configuration?.gap ?? 28);
  const x = Number(block.position?.x || 0) + Number(seat.column || 0) * gap;
  const y = Number(block.position?.y || 0) + Number(seat.row || 0) * gap;
  return { x, y };
};

export const drawSeatmap = (ctx, map, selectedIds = new Set(), selectedShapeId = null) => {
  const boundary = map.boundary || {};
  ctx.fillStyle = boundary.color || "#080b12";
  ctx.fillRect(0, 0, Number(boundary.width || 1200), Number(boundary.height || 800));
  (map.shapes || []).filter((shape) => shape.visible !== false).forEach((shape) => {
    ctx.save(); ctx.fillStyle = shape.color || "#7c3aed";
    if (shape.type === "text") { ctx.font = `${shape.fontSize || 18}px sans-serif`; ctx.fillText(shape.text || "Text", shape.x || 0, shape.y || 0); }
    else { ctx.fillRect(shape.x || 0, shape.y || 0, shape.width || 200, shape.height || 70); if (shape.label) { ctx.fillStyle = "#fff"; ctx.font = "600 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText(shape.label, (shape.x || 0) + (shape.width || 200) / 2, (shape.y || 0) + (shape.height || 70) / 2); } }
    if (shape.id === selectedShapeId) { ctx.strokeStyle = "#f5b234"; ctx.lineWidth = 3; ctx.strokeRect(shape.x || 0, shape.y || 0, shape.width || 200, shape.height || 70); }
    ctx.restore();
  });
  (map.blocks || []).filter((block) => !block.hidden).forEach((block) => {
    if (block.type === "general-admission") {
      ctx.fillStyle = block.configuration?.color || "#1d4ed8";
      ctx.fillRect(block.position?.x || 0, block.position?.y || 0, block.dimensions?.width || 260, block.dimensions?.height || 130);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "600 16px sans-serif";
      ctx.fillText(block.name || "General Admission", (block.position?.x || 0) + (block.dimensions?.width || 260) / 2, (block.position?.y || 0) + 54);
      ctx.font = "13px sans-serif"; ctx.fillText(`${(block.seats || []).filter((seat) => seat.status === "available").length} available`, (block.position?.x || 0) + (block.dimensions?.width || 260) / 2, (block.position?.y || 0) + 76);
      return;
    }
    (block.seats || []).forEach((seat) => {
      const { x, y } = seatPosition(block, seat); const id = `${block.id}:${seat.id}`;
      // Public lifecycle colours: yellow = available, green = checkout hold,
      // red = paid/sold. Organizer holds remain slate so they don't look paid.
      const palette = { available: "#facc15", "sold": "#ef4444", "checkout-held": "#22c55e", "organizer-held": "#64748b" };
      // Live inventory is authoritative. A stale session-cart selection must never
      // mask a seat that has already become held or sold in the database.
      const isSelectable = seat.status === "available";
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = isSelectable && selectedIds.has(id) ? "#f5b234" : (palette[seat.status] || "#facc15"); ctx.fill();
      // Labels deliberately use a dark, high-contrast colour because venue
      // maps may have a light boundary background. Draw the full row+number
      // identity below every seat, e.g. A1, B4.
      ctx.fillStyle = "#172033"; ctx.font = "700 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(seat.seatName || "", x, y + 19);
    });
  });
};

export default function SeatMapCanvas({ map, selectedIds, selectedShapeId, onSeatClick, onGaClick, onShapeClick, onPointerDown, onPointerMove, onPointerUp, zoom = 1, className = "" }) {
  const ref = useRef(null);
  useEffect(() => { const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height); drawSeatmap(ctx, map, selectedIds, selectedShapeId); }, [map, selectedIds, selectedShapeId]);
  const pointFor = (event) => {
    const rect = ref.current.getBoundingClientRect(); const scaleX = ref.current.width / rect.width; const scaleY = ref.current.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  };
  const handleClick = (event) => {
    if (!onSeatClick) return;
    const { x, y } = pointFor(event);
    for (const shape of [...(map.shapes || [])].reverse()) {
      if (shape.visible !== false && x >= (shape.x || 0) && x <= (shape.x || 0) + (shape.width || 200) && y >= (shape.y || 0) && y <= (shape.y || 0) + (shape.height || 70)) return onShapeClick?.(shape);
    }
    for (const block of map.blocks || []) {
      if (block.type !== "general-admission") continue;
      const bx = Number(block.position?.x || 0); const by = Number(block.position?.y || 0);
      if (x >= bx && x <= bx + Number(block.dimensions?.width || 0) && y >= by && y <= by + Number(block.dimensions?.height || 0)) return onGaClick?.(block);
    }
    for (const block of map.blocks || []) for (const seat of block.seats || []) { const point = seatPosition(block, seat); if (Math.hypot(x - point.x, y - point.y) <= 14) return onSeatClick(block, seat); }
  };
  return <div className={`overflow-auto rounded-2xl border border-white/10 bg-black ${className}`}><div style={{ width: (map.boundary?.width || 1200) * zoom, height: (map.boundary?.height || 800) * zoom }}><canvas ref={ref} width={map.boundary?.width || 1200} height={map.boundary?.height || 800} onClick={handleClick} onPointerDown={(event) => onPointerDown?.(pointFor(event), event)} onPointerMove={(event) => onPointerMove?.(pointFor(event), event)} onPointerUp={(event) => onPointerUp?.(pointFor(event), event)} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} className="min-w-[900px] max-w-none cursor-crosshair" /></div></div>;
}
