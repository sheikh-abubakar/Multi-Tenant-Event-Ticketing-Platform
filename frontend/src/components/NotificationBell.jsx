import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./NotificationBell.css";
const base = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
export default function NotificationBell({ inboxPath = "/my/notifications" }) {
 const { token } = useAuth(); const navigate = useNavigate(); const ref = useRef(null); const [open,setOpen]=useState(false); const [items,setItems]=useState([]); const [unread,setUnread]=useState(0);
 const load=async()=>{try{const {data}=await apiClient.get("/notifications?limit=2");setItems(data.notifications);setUnread(data.unread)}catch{}};
  useEffect(()=>{if(token)load()},[token]);
  useEffect(()=>{window.addEventListener("notifications-updated",load);return()=>window.removeEventListener("notifications-updated",load)},[token]);
 useEffect(()=>{if(!token)return;const socket=io(base,{auth:{token},withCredentials:true,transports:["websocket","polling"]});socket.on("notifications:new",n=>{setItems(x=>[n,...x].slice(0,2));setUnread(x=>x+1);window.dispatchEvent(new Event("notifications-updated"))});return()=>socket.disconnect()},[token]);
 useEffect(()=>{const close=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);
 const openItem=async n=>{if(!n.readAt){await apiClient.patch(`/notifications/${n._id}/read`).catch(()=>{});setUnread(x=>Math.max(0,x-1))}setOpen(false);navigate(n.link||inboxPath)};
 return <div className="notification-bell" ref={ref}><button className="notification-bell__trigger" onClick={()=>{setOpen(!open);if(!open)load()}} aria-label="Notifications"><Bell size={20}/>{unread>0&&<span>{unread>99?"99+":unread}</span>}</button>{open&&<section className="notification-popover"><header><div><strong>Notifications</strong><small>{unread?`${unread} unread`:"You're all caught up"}</small></div><button onClick={async()=>{await apiClient.post("/notifications/read-all");setUnread(0);setItems(x=>x.map(n=>({...n,readAt:n.readAt||new Date()})))}}><CheckCheck size={17}/></button></header><div>{items.length?items.map(n=><button key={n._id} onClick={()=>openItem(n)} className={`notification-row${n.readAt?"":" is-unread"}`}><b>{n.title}</b>{n.organizationId?.name&&<em>{n.organizationId.name}</em>}<p>{n.message}</p><time>{new Date(n.createdAt).toLocaleString()}</time></button>):<p className="notification-empty">No notifications yet.</p>}</div><footer><button onClick={()=>{setOpen(false);navigate(inboxPath)}}>View all notifications</button></footer></section>}</div>;
}
