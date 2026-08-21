const withdrawalService = require("../services/withdrawal.service");

/**
 * Request a new cash withdrawal
 */
const requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, bankName, accountHolderName, accountNumber } = req.body;

    if (!amount || !bankName || !accountHolderName || !accountNumber) {
      return res.status(400).json({ message: "amount, bankName, accountHolderName and accountNumber are required" });
    }

    const result = await withdrawalService.requestWithdrawal(userId, {
      amount,
      bankName,
      accountHolderName,
      accountNumber,
    });

    return res.json({
      message: "Withdrawal completed successfully",
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * Get withdrawal history
 */
const getWithdrawals = async (req, res) => {
  try {
    const userId = req.user._id;
    const history = await withdrawalService.getWithdrawals(userId);
    return res.json({ withdrawals: history });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = {
  requestWithdrawal,
  getWithdrawals,
};
