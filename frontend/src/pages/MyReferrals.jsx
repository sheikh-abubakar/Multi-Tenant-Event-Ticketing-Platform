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
    <header className="buyer-hub-heading"><div><p>SHARE THE EXPERIENCE</p><h1>Referrals &amp; Rewards</h1><span>Invite friends and earn cash rewards directly in your wallet.</span></div><Gift size={34} /></header>
    {error && <div className="buyer-hub-alert">{error}</div>}
    <div className="referral-feature">
      <div><span>YOUR REFERRAL CODE</span><strong>{loading ? "Loading…" : data?.referralCode}</strong><p>Share your personal link. A successful friend booking unlocks a cash reward.</p></div>
      <button onClick={copyLink} disabled={!data}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy referral link"}</button>
    </div>
    <div className="referral-stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
      <div><Sparkles size={20} /><strong>${Number(data?.totalEarnedAmount || 0).toFixed(2)}</strong><span>Total cash earned</span></div>
      <div><Share2 size={20} /><strong>{data?.totalEarnedCount || 0}</strong><span>Total referrals</span></div>
    </div>
    <div className="reward-columns" style={{ gridTemplateColumns: "1fr" }}>
      <section style={{ maxWidth: "800px", margin: "0 auto", width: "100%" }}>
        <h2>Earnings &amp; Referral History</h2>
        {!loading && !data?.usedRewardsHistory?.length ? (
          <div className="buyer-hub-empty compact">
            <Gift size={24} />
            <p>No referrals completed yet.</p>
          </div>
        ) : (
          data?.usedRewardsHistory?.map((reward) => (
            <article className="reward-row is-available" key={reward._id}>
              <div>
                <strong>${Number(reward.rewardAmount || 0).toFixed(2)} Cash Reward</strong>
                <span>Earned from referral of {reward.referredEmail} for booking of <strong>{reward.referredBookingId?.isBundleBooking ? `bundle "${reward.referredBookingId?.bundleName || "Bundle"}"` : `event "${reward.referredBookingId?.eventName || "Event"}"`}</strong></span>
              </div>
              <small style={{ color: "var(--gold)", fontWeight: 600 }}>Credited to Wallet</small>
            </article>
          ))
        )}
      </section>
    </div>
  </section>;
};
export default MyReferrals;
