import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, Activity, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "./PlatformAdmin.css";

const PlatformAdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate("/platform-admin/login"); };
  const links = [["Overview", "/platform-admin", LayoutDashboard], ["Organizations", "/platform-admin/organizations", Building2], ["Activity log", "/platform-admin/activity", Activity]];

  return <div className="platform-shell">
    <aside className="platform-sidebar">
      <div className="platform-brand"><ShieldCheck size={23} /><div><strong>StagePass</strong><span>PLATFORM CONTROL</span></div></div>
      <nav className="platform-nav">{links.map(([label, to, Icon]) => <NavLink key={to} end={to === "/platform-admin"} to={to} className={({ isActive }) => `platform-nav-link${isActive ? " is-active" : ""}`}><Icon size={17} />{label}</NavLink>)}</nav>
      <div className="platform-user"><span>SUPER ADMIN</span><strong>{user?.name}</strong><small>{user?.email}</small><button onClick={handleLogout}><LogOut size={15} /> Log out</button></div>
    </aside>
    <main className="platform-main"><Outlet /></main>
  </div>;
};

export default PlatformAdminLayout;
