const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

/**
 * Wallet Service
 * 
 * Handles wallet operations:
 * - Auto-create wallet on first access
 * - Credit (refund, deposit)
 * - Debit (purchase)
 * - Get balance
 * - Get transaction history
 */

/**
 * Get wallet for a user — auto-creates if it doesn't exist
 */
const getWallet = async (userId, session) => {
  let query = Wallet.findOne({ userId });
  if (session) {
    query = query.session(session);
  }
  let wallet = await query;
  if (!wallet) {
    if (session) {
      const created = await Wallet.create([{ userId, balance: 0, currency: "USD" }], { session });
      wallet = created[0];
    } else {
      wallet = await Wallet.create({ userId, balance: 0, currency: "USD" });
    }
  } else if (wallet.currency !== "USD") {
    // StagePass prices, Stripe charges and refund amounts are all USD. Legacy
    // wallets only carried an incorrect display label; their stored numeric
    // credit is already used directly in the USD checkout calculations.
    wallet.currency = "USD";
    if (session) await wallet.save({ session });
    else await wallet.save();
  }
  return wallet;
};

/**
 * Get wallet balance
 */
const getBalance = async (userId, session) => {
  const wallet = await getWallet(userId, session);
  return wallet.balance;
};

/**
 * Credit wallet (add funds)
 * 
 * @param {string} userId 
 * @param {number} amount - Positive number
 * @param {string} description - Description for transaction log
 * @param {object} options - Optional: { type, bookingId, session }
 * @returns {object} { wallet, transaction }
 */
const credit = async (userId, amount, description, options = {}) => {
  if (!amount || amount <= 0) {
    const error = new Error("Amount must be positive");
    error.statusCode = 400;
    throw error;
  }

  const session = options.session;
  const wallet = await getWallet(userId, session);
  const balanceBefore = wallet.balance;

  wallet.balance += amount;
  if (session) {
    await wallet.save({ session });
  } else {
    await wallet.save();
  }

  const txData = {
    userId,
    type: options.type || "credit",
    amount,
    description,
    bookingId: options.bookingId || null,
    balanceBefore,
    balanceAfter: wallet.balance,
  };

  let transaction;
  if (session) {
    const created = await WalletTransaction.create([txData], { session });
    transaction = created[0];
  } else {
    transaction = await WalletTransaction.create(txData);
  }

  return { wallet, transaction };
};

/**
 * Debit wallet (deduct funds)
 * 
 * @param {string} userId 
 * @param {number} amount - Positive number (will be deducted)
 * @param {string} description - Description for transaction log
 * @param {object} options - Optional: { type, bookingId, session }
 * @returns {object} { wallet, transaction }
 */
const debit = async (userId, amount, description, options = {}) => {
  if (!amount || amount <= 0) {
    const error = new Error("Amount must be positive");
    error.statusCode = 400;
    throw error;
  }

  const session = options.session;
  const wallet = await getWallet(userId, session);

  if (wallet.balance < amount) {
    const error = new Error("Insufficient wallet balance");
    error.statusCode = 409;
    throw error;
  }

  const balanceBefore = wallet.balance;
  wallet.balance -= amount;
  if (session) {
    await wallet.save({ session });
  } else {
    await wallet.save();
  }

  const txData = {
    userId,
    type: options.type || "debit",
    amount: -amount, // negative to show deduction
    description,
    bookingId: options.bookingId || null,
    balanceBefore,
    balanceAfter: wallet.balance,
  };

  let transaction;
  if (session) {
    const created = await WalletTransaction.create([txData], { session });
    transaction = created[0];
  } else {
    transaction = await WalletTransaction.create(txData);
  }

  return { wallet, transaction };
};

/**
 * Get transaction history for a user
 */
const getTransactions = async (userId, limit = 20) => {
  const transactions = await WalletTransaction.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return transactions;
};

/**
 * Get full wallet info (balance + recent transactions)
 */
const getWalletInfo = async (userId) => {
  const wallet = await getWallet(userId);
  const transactions = await getTransactions(userId);

  return {
    balance: wallet.balance,
    currency: wallet.currency,
    transactions,
  };
};

module.exports = {
  getWallet,
  getBalance,
  credit,
  debit,
  getTransactions,
  getWalletInfo,
};
