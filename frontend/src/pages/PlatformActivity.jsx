import { useEffect, useState } from "react";
import apiClient from "../api/client";
import "../components/PlatformAdmin.css";

const PlatformActivity = () => {
  const [data, setData] = useState(null); const [page, setPage] = useState(1); const [error, setError] = useState("");
  useEffect(() => { apiClient.get(`/platform-admin/activity?page=${page}`).then(({ data }) => setData(data)).catch((err) => setError(err.response?.data?.message || "Could not load activity.")); }, [page]);
  return <><div className="platform-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h1>Activity log.</h1><p>Important platform actions recorded from this feature onward.</p></div></div><div className="platform-card">{error && <div className="platform-alert">{error}</div>}{!data ? <p className="platform-empty">Loading activity…</p> : <><ul className="platform-activity">{data.activity.length ? data.activity.map((item) => <li key={item._id}><strong>{item.action.replace(".", " ")}</strong>{item.organizationId && <> · {item.organizationId.name}</>}<small>{item.actorUserId?.name || "System"}{item.actorUserId?.email ? ` (${item.actorUserId.email})` : ""} · {new Date(item.createdAt).toLocaleString("en-US")}</small>{item.metadata?.reason && <small>Reason: {item.metadata.reason}</small>}</li>) : <li className="platform-empty">No audited actions yet.</li>}</ul><div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}><button className="platform-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span style={{ color: "#aeb0c4" }}>Page {data.pagination.page} of {data.pagination.pages}</span><button className="platform-btn" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</button></div></> }</div></>;
};
export default PlatformActivity;
