import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Building2, CalendarDays, ChevronDown, ChevronRight, Gift,
  LogOut, Menu, Plus, ShoppingCart, Ticket, User, WalletCards, X, ShieldCheck, Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import Logo from "./Logo";
import AICopilot from "./ai/AICopilot";
import NotificationBell from "./NotificationBell";
import "./BuyerLayout.css";

const BuyerLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [orgsOpen, setOrgsOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);

  const updateCartCount = () => {
    try {
      const raw = localStorage.getItem("stagepass_cart");
      const items = raw ? JSON.parse(raw) : [];
      const payableItems = items.filter(item => !(item.bundleId && item.itemType !== "bundle"));
      const count = payableItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
      setCartCount(count);
    } catch (e) {
      setCartCount(0);
    }
  };

  useEffect(() => {
    updateCartCount();
    window.addEventListener("cart-updated", updateCartCount);
    return () => window.removeEventListener("cart-updated", updateCartCount);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (user) {
      apiClient.get("/organizations/mine")
        .then(({ data }) => { if (!cancelled) setOrganizations(data.organizations || []); })
        .catch(() => { if (!cancelled) setOrganizations([]); })
        .finally(() => { if (!cancelled) setOrgsLoading(false); });
    } else {
      setOrgsLoading(false);
    }
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const close = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    };
    const escape = (event) => { if (event.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const links = [
    ["Browse Events", "/browse", CalendarDays, true],
    ["Cart", "/cart", ShoppingCart],
    ["Notifications", "/my/notifications", Bell],
    ["My Bookings", "/my/bookings", Ticket],
    ["Wallet", "/my/wallet", WalletCards],
    ["Referrals & Rewards", "/my/referrals", Gift],
    ["Recommendations", "/my/recommendations", Sparkles],
    ["My Staff Passes", "/my/passes", ShieldCheck],
  ];

  return (
    <div className="buyer-shell">
      <aside className={`buyer-sidebar${sidebarOpen ? " is-open" : ""}`}>
        <button className="buyer-sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close buyer menu"><X size={20} /></button>
        <Link to="/" className="buyer-sidebar__brand"><Logo width="132" height="36" idSuffix="buyer" /></Link>
        <p className="buyer-sidebar__eyebrow">MEMBER CONCIERGE</p>
        <nav className="buyer-sidebar__nav" aria-label="Buyer navigation">
          {links.slice(0, 1).map(([label, to, Icon, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `buyer-sidebar__link${isActive ? " is-active" : ""}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
          <button className={`buyer-sidebar__link buyer-sidebar__org-toggle${orgsOpen ? " is-open" : ""}`} onClick={() => setOrgsOpen((value) => !value)} aria-expanded={orgsOpen}>
            <Building2 size={18} strokeWidth={1.8} /><span>My Organizations</span>{orgsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {orgsOpen && (
            <div className="buyer-sidebar__orgs">
              {orgsLoading && <span className="buyer-sidebar__org-note">Loading…</span>}
              {!orgsLoading && organizations.length === 0 && <span className="buyer-sidebar__org-note">No organizations yet</span>}
              {organizations.map(({ organization, role }) => (
                <Link key={organization.id || organization._id} to={`/o/${organization.slug}/dashboard`} className="buyer-sidebar__org">
                  <span>{organization.name}</span><small>{role}</small>
                </Link>
              ))}
              <Link to="/create-organization" className="buyer-sidebar__create"><Plus size={14} /> Create organization</Link>
            </div>
          )}
          <span className="buyer-sidebar__divider" />
          {links.slice(1).map(([label, to, Icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `buyer-sidebar__link${isActive ? " is-active" : ""}`}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Cart" && cartCount > 0 && (
                <span className="cart-badge-count" style={{
                  marginLeft: "auto",
                  background: "var(--gold)",
                  color: "var(--ink)",
                  fontWeight: "bold",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "10px",
                }}>{cartCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="buyer-sidebar__footer">
          <span className="buyer-sidebar__avatar">{user?.name?.[0]?.toUpperCase() || "U"}</span>
          <div><strong>{user?.name}</strong><small>StagePass member</small></div>
        </div>
      </aside>

      {sidebarOpen && <button className="buyer-sidebar__backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close buyer menu" />}

      <div className="buyer-stage">
        <header className="buyer-topbar">
          <button className="buyer-topbar__menu" onClick={() => setSidebarOpen(true)} aria-label="Open buyer menu"><Menu size={22} /></button>
          <div className="buyer-topbar__title"><span>STAGEPASS</span><small>BUYER HUB</small></div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <NotificationBell />
          <div className="buyer-profile" ref={profileRef}>
            <button className="buyer-profile__trigger" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <User size={16} /><span>Profile</span><ChevronDown size={14} />
            </button>
            {profileOpen && (
              <div className="buyer-profile__menu">
                <div><strong>{user?.name}</strong><small>{user?.email}</small></div>
                <Link to="/profile"><User size={15} /> Profile settings</Link>
                <button onClick={handleLogout}><LogOut size={15} /> Log out</button>
              </div>
            )}
          </div>
          </div>
        </header>
        <main className="buyer-main">{children}</main>
        <AICopilot />
      </div>
    </div>
  );
};

export default BuyerLayout;
