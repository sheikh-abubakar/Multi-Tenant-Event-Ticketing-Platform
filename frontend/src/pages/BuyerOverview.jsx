import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Gift, Sparkles, Ticket, WalletCards } from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./BuyerHub.css";

const BuyerOverview = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ balance: 0, bookings: 0, rewards: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get("/wallet"),
      apiClient.get("/bookings/mine"),
      apiClient.get("/referrals/me"),
    ]).then(([wallet, bookings, referrals]) => {
      if (!cancelled) setStats({
        balance: wallet.data.wallet?.balance || 0,
        bookings: bookings.data.bookings?.length || 0,
        rewards: referrals.data.data?.availableRewardsCount || 0,
      });
    }).catch((err) => { if (!cancelled) setError(err.response?.data?.message || "Could not load your overview"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const cards = [
    { label: "Wallet", value: `$${stats.balance.toFixed(2)}`, text: "Your available StagePass credit", to: "/my/wallet", icon: WalletCards },
    { label: "Bookings", value: stats.bookings, text: "Tickets, refunds and seat changes", to: "/my/bookings", icon: Ticket },
    { label: "Rewards", value: stats.rewards, text: "Discount rewards ready to use", to: "/my/referrals", icon: Gift },
  ];

  return (
    <section className="buyer-hub-page">
      <Link to="/browse" className="buyer-hub-back"><ArrowLeft size={15} /> Back to browse</Link>
      <header className="buyer-hub-hero">
        <div><p>MEMBER OVERVIEW</p><h1>Welcome back, <em>{user?.name?.split(" ")[0]}</em>.</h1><span>Your tickets, credit and rewards—beautifully organized.</span></div>
        <Sparkles className="buyer-hub-hero__icon" aria-hidden="true" />
      </header>
      {error && <div className="buyer-hub-alert">{error}</div>}
      <div className="buyer-overview-grid">
        {cards.map(({ label, value, text, to, icon: Icon }) => (
          <Link to={to} className="buyer-overview-card" key={to}>
            <div className="buyer-overview-card__top"><Icon size={21} /><span>{label}</span></div>
            <strong>{loading ? "—" : value}</strong><p>{text}</p>
            <small>Open {label} <ArrowRight size={14} /></small>
          </Link>
        ))}
      </div>
      <Link to="/browse" className="buyer-hub-discover">Discover upcoming events <ArrowRight size={16} /></Link>
    </section>
  );
};

export default BuyerOverview;
