import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ReceiptText, WalletCards } from "lucide-react";
import apiClient from "../api/client";
import "./BuyerHub.css";

const money = (value, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(value || 0));

const MyWallet = () => {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    apiClient.get("/wallet").then(({ data }) => { if (!cancelled) setWallet(data.wallet); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || "Could not load your wallet"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return <section className="buyer-hub-page">
    <Link to="/browse" className="buyer-hub-back"><ArrowLeft size={15} /> Back to browse</Link>
    <header className="buyer-hub-heading"><div><p>PERSONAL CREDIT</p><h1>My Wallet</h1><span>Refund credit and purchase activity in one clear ledger.</span></div><WalletCards size={34} /></header>
    {error && <div className="buyer-hub-alert">{error}</div>}
    <div className="wallet-balance-card"><div><span>AVAILABLE BALANCE</span><strong>{loading ? "—" : money(wallet?.balance, wallet?.currency)}</strong><small>{wallet?.currency || "USD"} StagePass credit</small></div><WalletCards size={52} /></div>
    <div className="buyer-ledger">
      <div className="buyer-ledger__head"><div><ReceiptText size={18} /><h2>Transaction history</h2></div><span>{wallet?.transactions?.length || 0} entries</span></div>
      {!loading && !wallet?.transactions?.length && <div className="buyer-hub-empty"><ReceiptText size={28} /><h3>No transactions yet</h3><p>Refunds and wallet purchases will appear here.</p></div>}
      {wallet?.transactions?.map((tx) => { const incoming = tx.amount > 0; return <div className="buyer-ledger__row" key={tx._id}>
        <span className={`buyer-ledger__icon ${incoming ? "is-credit" : "is-debit"}`}>{incoming ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span>
        <div><strong>{tx.description || tx.type}</strong><small>{new Date(tx.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small></div>
        <b className={incoming ? "is-credit" : "is-debit"}>{incoming ? "+" : "−"}{money(tx.amount, wallet.currency)}</b>
      </div>; })}
    </div>
  </section>;
};
export default MyWallet;
