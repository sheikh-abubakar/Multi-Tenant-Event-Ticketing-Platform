const stripe = require("../config/stripe");
const walletService = require("./wallet.service");
const Withdrawal = require("../models/Withdrawal");

/**
 * Enforce minimum withdrawal amount limit
 */
const MIN_WITHDRAWAL_LIMIT = 5;

/**
 * Create a new cash withdrawal request
 */
const requestWithdrawal = async (userId, { amount, bankName, accountHolderName, accountNumber }) => {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount < MIN_WITHDRAWAL_LIMIT) {
    const error = new Error(`Minimum withdrawal amount is $${MIN_WITHDRAWAL_LIMIT.toFixed(2)}`);
    error.statusCode = 400;
    throw error;
  }

  // Get current wallet balance
  const balance = await walletService.getBalance(userId);
  if (balance < numericAmount) {
    const error = new Error("Insufficient wallet balance for withdrawal");
    error.statusCode = 409;
    throw error;
  }

  const maskedAcc = String(accountNumber).slice(-4).padStart(String(accountNumber).length, "*");

  // Debit the wallet balance locally first
  const debitResult = await walletService.debit(
    userId,
    numericAmount,
    `Cash withdrawal to ${bankName} (${maskedAcc})`,
    { type: "withdrawal" }
  );

  try {
    // Attempt actual Stripe payout API call
    const payout = await stripe.payouts.create({
      amount: Math.round(numericAmount * 100), // convert to cents
      currency: "usd",
      statement_descriptor: "STAGEPASS PAYOUT",
    });

    console.log(`[Stripe Payout] ✅ Created payout ${payout.id} for $${numericAmount}`);

    // Create the database record on success
    const withdrawal = await Withdrawal.create({
      userId,
      amount: numericAmount,
      bankName,
      accountHolderName,
      accountNumber: maskedAcc, // Mask account number in DB for privacy
      status: "completed",
      stripePayoutId: payout.id,
    });

    return {
      withdrawal,
      newBalance: debitResult.wallet.balance,
    };
  } catch (err) {
    console.error(`[Stripe Payout Error] Payout API call failed: ${err.message}. Rolling back wallet debit.`);
    
    // Rollback: Refund the amount back to user's wallet
    await walletService.credit(
      userId,
      numericAmount,
      `Failed cash withdrawal rollback (Stripe error: ${err.message})`,
      { type: "credit" }
    );

    const error = new Error(`Stripe Payout failed: ${err.message}`);
    error.statusCode = err.statusCode || 400;
    throw error;
  }
};

/**
 * Get withdrawal history for a user
 */
const getWithdrawals = async (userId) => {
  return await Withdrawal.find({ userId }).sort({ createdAt: -1 }).lean();
};

module.exports = {
  requestWithdrawal,
  getWithdrawals,
};
