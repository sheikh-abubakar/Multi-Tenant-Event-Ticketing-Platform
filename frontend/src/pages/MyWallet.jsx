import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ReceiptText, WalletCards, Banknote, X, Info } from "lucide-react";
import apiClient from "../api/client";
import "./BuyerHub.css";

const money = (value, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(value || 0));

const MyWallet = () => {
  const [wallet, setWallet] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal & Form State
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  // Top-Up State
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [alertInfo, setAlertInfo] = useState(null);

  const fetchData = async () => {
    try {
      const [walletRes, withdrawalsRes] = await Promise.all([
        apiClient.get("/wallet"),
        apiClient.get("/wallet/withdrawals"),
      ]);
      setWallet(walletRes.data.wallet);
      setWithdrawals(withdrawalsRes.data.withdrawals || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load wallet details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Check URL parameters for topup status
    const params = new URLSearchParams(window.location.search);
    const topupStatus = params.get("topup");
    if (topupStatus === "success") {
      setAlertInfo({ type: "success", message: "Success! Your wallet balance has been topped up." });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (topupStatus === "cancelled") {
      setAlertInfo({ type: "error", message: "Wallet top-up was cancelled." });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setWithdrawError("");
    setWithdrawSuccess(false);

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 5) {
      setWithdrawError("Minimum withdrawal limit is $5.00.");
      return;
    }

    if (wallet && wallet.balance < numericAmount) {
      setWithdrawError("Insufficient wallet balance.");
      return;
    }

    setWithdrawLoading(true);
    try {
      await apiClient.post("/wallet/withdrawals", {
        amount: numericAmount,
        bankName,
        accountHolderName,
        accountNumber,
      });

      setWithdrawSuccess(true);
      // Reset form fields
      setAmount("");
      setBankName("");
      setAccountHolderName("");
      setAccountNumber("");

      // Refetch updated wallet and withdrawals
      await fetchData();

      // Automatically close modal after 1.5 seconds on success
      setTimeout(() => {
        setShowModal(false);
        setWithdrawSuccess(false);
      }, 1500);
    } catch (err) {
      setWithdrawError(err.response?.data?.message || "Withdrawal request failed.");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleTopupSubmit = async (e) => {
    e.preventDefault();
    setTopupError("");

    const numericAmount = Number(topupAmount);
    if (isNaN(numericAmount) || numericAmount < 5) {
      setTopupError("Minimum top-up amount is $5.00.");
      return;
    }

    setTopupLoading(true);
    try {
      const response = await apiClient.post("/wallet/topups/checkout", {
        amount: numericAmount,
      });

      if (response.data?.checkoutUrl) {
        window.location.href = response.data.checkoutUrl;
      } else {
        throw new Error("Invalid response from checkout endpoint");
      }
    } catch (err) {
      setTopupError(err.response?.data?.message || "Failed to initiate top-up checkout.");
      setTopupLoading(false);
    }
  };

  return (
    <section className="buyer-hub-page" style={{ position: "relative" }}>
      <Link to="/browse" className="buyer-hub-back">
        <ArrowLeft size={15} /> Back to browse
      </Link>
      
      <header className="buyer-hub-heading">
        <div>
          <p>PERSONAL CREDIT</p>
          <h1>My Wallet</h1>
          <span>Refund credit, referral rewards and cash withdrawals.</span>
        </div>
        <WalletCards size={34} />
      </header>

      {error && <div className="buyer-hub-alert">{error}</div>}
      {alertInfo && (
        <div 
          className="buyer-hub-alert" 
          style={{ 
            color: alertInfo.type === "success" ? "#54d793" : "#ffb2b2",
            borderColor: alertInfo.type === "success" ? "rgba(84, 215, 147, 0.25)" : "rgba(248, 113, 113, 0.25)",
            background: alertInfo.type === "success" ? "rgba(84, 215, 147, 0.08)" : "rgba(248, 113, 113, 0.08)",
          }}
        >
          {alertInfo.message}
        </div>
      )}

      {/* Available Balance Card */}
      <div className="wallet-balance-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span>AVAILABLE BALANCE</span>
          <strong>{loading ? "—" : money(wallet?.balance, wallet?.currency)}</strong>
          <small>{wallet?.currency || "USD"} StagePass credit</small>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={() => {
                setTopupError("");
                setShowTopupModal(true);
              }}
              className="buyer-hub-discover"
              style={{
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <ArrowDownLeft size={16} style={{ color: "var(--gold)" }} />
              Top Up Balance
            </button>
            <button
              type="button"
              onClick={() => {
                setWithdrawError("");
                setWithdrawSuccess(false);
                setShowModal(true);
              }}
              disabled={loading || !wallet?.balance || wallet.balance < 5}
              className="buyer-hub-discover"
              style={{
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: (!wallet?.balance || wallet.balance < 5) ? "not-allowed" : "pointer",
                opacity: (!wallet?.balance || wallet.balance < 5) ? 0.6 : 1,
              }}
            >
              <Banknote size={16} />
              Withdraw Cash
            </button>
          </div>
          {wallet?.balance < 5 && (
            <small style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
              <Info size={11} /> Min withdraw limit is $5.00
            </small>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "24px" }} className="reward-columns">
        {/* Transaction Ledger */}
        <div className="buyer-ledger">
          <div className="buyer-ledger__head">
            <div>
              <ReceiptText size={18} />
              <h2>Transaction history</h2>
            </div>
            <span>{wallet?.transactions?.length || 0} entries</span>
          </div>
          {!loading && !wallet?.transactions?.length && (
            <div className="buyer-hub-empty">
              <ReceiptText size={28} />
              <h3>No transactions yet</h3>
              <p>Refunds, bookings and credits will appear here.</p>
            </div>
          )}
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {wallet?.transactions?.map((tx) => {
              const incoming = tx.amount > 0;
              return (
                <div className="buyer-ledger__row" key={tx._id}>
                  <span className={`buyer-ledger__icon ${incoming ? "is-credit" : "is-debit"}`}>
                    {incoming ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </span>
                  <div>
                    <strong>{tx.description || tx.type}</strong>
                    <small>{new Date(tx.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small>
                  </div>
                  <b className={incoming ? "is-credit" : "is-debit"}>
                    {incoming ? "+" : "−"}
                    {money(tx.amount, wallet.currency)}
                  </b>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cash Withdrawals Ledger */}
        <div className="buyer-ledger">
          <div className="buyer-ledger__head">
            <div>
              <Banknote size={18} style={{ color: "var(--gold)" }} />
              <h2>Withdrawals history</h2>
            </div>
            <span>{withdrawals.length} entries</span>
          </div>
          {!loading && !withdrawals.length && (
            <div className="buyer-hub-empty">
              <Banknote size={28} />
              <h3>No withdrawals yet</h3>
              <p>Cash withdrawals requested from your balance will show here.</p>
            </div>
          )}
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {withdrawals.map((w) => (
              <div
                className="buyer-ledger__row"
                key={w._id}
                style={{ gridTemplateColumns: "38px 1fr auto" }}
              >
                <span className="buyer-ledger__icon is-debit" style={{ background: "rgba(212, 165, 61, 0.1)", color: "var(--gold)" }}>
                  <ArrowUpRight size={17} />
                </span>
                <div>
                  <strong>Withdrawal to {w.bankName}</strong>
                  <small style={{ display: "block", color: "rgba(255, 255, 255, 0.4)", fontSize: "10px", marginTop: "2px" }}>
                    Acc: {w.accountNumber} · Holder: {w.accountHolderName}
                  </small>
                  <small style={{ display: "block", marginTop: "4px" }}>
                    {new Date(w.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </small>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <b className="is-debit" style={{ color: "#f87171" }}>
                    −{money(w.amount, w.currency)}
                  </b>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "10px",
                      background: w.status === "completed" ? "rgba(84, 215, 147, 0.15)" : "rgba(246, 129, 129, 0.15)",
                      color: w.status === "completed" ? "#54d793" : "#f68181",
                      textTransform: "uppercase",
                    }}
                  >
                    {w.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Glassmorphic Payout Withdrawal Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(10, 11, 22, 0.7)",
            backdropFilter: "blur(12px)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
          className="animate-fade-in"
        >
          <div
            style={{
              background: "linear-gradient(135deg, #1b1e39, #111326)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              borderRadius: "20px",
              padding: "30px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 15px 40px rgba(0, 0, 0, 0.5)",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!withdrawLoading) setShowModal(false);
              }}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "none",
                border: 0,
                color: "rgba(255, 255, 255, 0.5)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>

            {withdrawSuccess ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: "52px", marginBottom: "16px" }}>🎉</div>
                <h3 style={{ fontSize: "20px", color: "#54d793", margin: "0 0 8px" }}>Withdrawal Initiated!</h3>
                <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
                  Your payout has been processed successfully through Stripe.
                </p>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: "20px", color: "var(--paper)", margin: "0 0 6px", fontFamily: "var(--font-display)" }}>
                  Cash Withdrawal
                </h2>
                <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "12px", margin: "0 0 20px" }}>
                  Withdraw your available credit directly to your bank account.
                </p>

                <form onSubmit={handleWithdrawSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Amount Input */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--gold)", marginBottom: "6px", textTransform: "uppercase" }}>
                      Amount to Withdraw (USD)
                    </label>
                    <input
                      type="number"
                      required
                      min="5"
                      max={wallet?.balance || 0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 15.00"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    />
                    <small style={{ display: "block", marginTop: "4px", color: "rgba(255, 255, 255, 0.4)", fontSize: "11px" }}>
                      Max available: {money(wallet?.balance)} (Min limit: $5.00)
                    </small>
                  </div>

                  {/* Bank Name */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--gold)", marginBottom: "6px", textTransform: "uppercase" }}>
                      Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. Chase Bank"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    />
                  </div>

                  {/* Account Holder Name */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--gold)", marginBottom: "6px", textTransform: "uppercase" }}>
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      placeholder="e.g. John Doe"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    />
                  </div>

                  {/* Account Number */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--gold)", marginBottom: "6px", textTransform: "uppercase" }}>
                      Account Number
                    </label>
                    <input
                      type="text"
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="e.g. 1234567890"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    />
                  </div>

                  {/* Error display */}
                  {withdrawError && (
                    <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "6px", fontSize: "12px", color: "#fca5a5" }}>
                      ⚠️ {withdrawError}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={withdrawLoading}
                    className="buyer-hub-discover"
                    style={{
                      margin: "10px 0 0",
                      width: "100%",
                      justifyContent: "center",
                      cursor: withdrawLoading ? "not-allowed" : "pointer",
                      padding: "12px",
                    }}
                  >
                    {withdrawLoading ? "Processing Payout..." : "Confirm & Request Withdrawal"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Glassmorphic Top-Up Modal */}
      {showTopupModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(10, 11, 22, 0.7)",
            backdropFilter: "blur(12px)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
          className="animate-fade-in"
        >
          <div
            style={{
              background: "linear-gradient(135deg, #1b1e39, #111326)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              borderRadius: "20px",
              padding: "30px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 15px 40px rgba(0, 0, 0, 0.5)",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!topupLoading) setShowTopupModal(false);
              }}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "none",
                border: 0,
                color: "rgba(255, 255, 255, 0.5)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>

            <h2 style={{ fontSize: "20px", color: "var(--paper)", margin: "0 0 6px", fontFamily: "var(--font-display)" }}>
              Top Up Wallet
            </h2>
            <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "12px", margin: "0 0 20px" }}>
              Add mock funds to your wallet using Stripe Test Card payments.
            </p>

            <form onSubmit={handleTopupSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Amount Input */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--gold)", marginBottom: "6px", textTransform: "uppercase" }}>
                  Amount to Add (USD)
                </label>
                <input
                  type="number"
                  required
                  min="5"
                  step="0.01"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="e.g. 50.00"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                />
                <small style={{ display: "block", marginTop: "4px", color: "rgba(255, 255, 255, 0.4)", fontSize: "11px" }}>
                  Minimum top-up limit: $5.00
                </small>
              </div>

              {/* Error display */}
              {topupError && (
                <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "6px", fontSize: "12px", color: "#fca5a5" }}>
                  ⚠️ {topupError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={topupLoading}
                className="buyer-hub-discover"
                style={{
                  margin: "10px 0 0",
                  width: "100%",
                  justifyContent: "center",
                  cursor: topupLoading ? "not-allowed" : "pointer",
                  padding: "12px",
                }}
              >
                {topupLoading ? "Redirecting to Stripe..." : "Proceed to Payment"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default MyWallet;
