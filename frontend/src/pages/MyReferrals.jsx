import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, Gift, Share2, Sparkles } from "lucide-react";
import apiClient from "../api/client";
import "./BuyerHub.css";

const MyReferrals = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiClient.get("/referrals/me").then((res) => { if (!cancelled) setData(res.data.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || "Could not load referral rewards"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/browse?ref=${data.referralCode}`);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return <section className="buyer-hub-page">
    <Link to="/browse" className="buyer-hub-back"><ArrowLeft size={15} /> Back to browse</Link>
    <header className="buyer-hub-heading"><div><p>SHARE THE EXPERIENCE</p><h1>Referrals &amp; Rewards</h1><span>Invite friends and earn 10% rewards, up to 50% per checkout.</span></div><Gift size={34} /></header>
    {error && <div className="buyer-hub-alert">{error}</div>}
    <div className="referral-feature">
      <div><span>YOUR REFERRAL CODE</span><strong>{loading ? "Loading…" : data?.referralCode}</strong><p>Share your personal link. A successful friend booking unlocks a reward.</p></div>
      <button onClick={copyLink} disabled={!data}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy referral link"}</button>
    </div>
    <div className="referral-stats"><div><Sparkles size={20} /><strong>{data?.availableRewardsCount || 0}</strong><span>Available rewards</span></div><div><Share2 size={20} /><strong>{data?.totalEarnedCount || 0}</strong><span>Total earned</span></div><div><Gift size={20} /><strong>{Math.min((data?.availableRewardsCount || 0) * 10, 50)}%</strong><span>Available discount</span></div></div>
    <div className="reward-columns">
      <section><h2>Available rewards</h2>{!loading && !data?.availableRewards?.length ? <div className="buyer-hub-empty compact"><Gift size={24} /><p>No rewards available yet.</p></div> : data?.availableRewards?.map((reward) => <article className="reward-row is-available" key={reward._id}><div><strong>{reward.discountPercent}% OFF</strong><span>Earned from {reward.referredEmail}</span></div><small>Ready to use</small></article>)}</section>
      <section><h2>Used rewards</h2>{!loading && !data?.usedRewardsHistory?.length ? <div className="buyer-hub-empty compact"><Check size={24} /><p>No used rewards yet.</p></div> : data?.usedRewardsHistory?.map((reward) => <article className="reward-row" key={reward._id}><div><strong>{reward.discountPercent}% OFF</strong><span>{reward.referredEmail}</span></div><small>Used</small></article>)}</section>
    </div>
  </section>;
};
export default MyReferrals;
