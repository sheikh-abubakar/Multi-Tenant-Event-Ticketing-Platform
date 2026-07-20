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
const getWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId, balance: 0, currency: "PKR" });
  }
  return wallet;
};

/**
 * Get wallet balance
 */
const getBalance = async (userId) => {
  const wallet = await getWallet(userId);
  return wallet.balance;
};

/**
 * Credit wallet (add funds)
 * 
 * @param {string} userId 
 * @param {number} amount - Positive number
 * @param {string} description - Description for transaction log
 * @param {object} options - Optional: { type, bookingId }
 * @returns {object} { wallet, transaction }
 */
const credit = async (userId, amount, description, options = {}) => {
  if (!amount || amount <= 0) {
    const error = new Error("Amount must be positive");
    error.statusCode = 400;
    throw error;
  }

  const wallet = await getWallet(userId);
  const balanceBefore = wallet.balance;

  wallet.balance += amount;
  await wallet.save();

  const transaction = await WalletTransaction.create({
    userId,
    type: options.type || "credit",
    amount,
    description,
    bookingId: options.bookingId || null,
    balanceBefore,
    balanceAfter: wallet.balance,
  });

  return { wallet, transaction };
};

/**
 * Debit wallet (deduct funds)
 * 
 * @param {string} userId 
 * @param {number} amount - Positive number (will be deducted)
 * @param {string} description - Description for transaction log
 * @param {object} options - Optional: { type, bookingId }
 * @returns {object} { wallet, transaction }
 */
const debit = async (userId, amount, description, options = {}) => {
  if (!amount || amount <= 0) {
    const error = new Error("Amount must be positive");
    error.statusCode = 400;
    throw error;
  }

  const wallet = await getWallet(userId);

  if (wallet.balance < amount) {
    const error = new Error("Insufficient wallet balance");
    error.statusCode = 409;
    throw error;
  }

  const balanceBefore = wallet.balance;
  wallet.balance -= amount;
  await wallet.save();

  const transaction = await WalletTransaction.create({
    userId,
    type: options.type || "debit",
    amount: -amount, // negative to show deduction
    description,
    bookingId: options.bookingId || null,
    balanceBefore,
    balanceAfter: wallet.balance,
  });

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