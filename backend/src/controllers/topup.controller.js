const stripe = require("../config/stripe");

/**
 * Create a Stripe Checkout Session for Wallet Top-up
 */
const createTopupSession = async (req, res) => {
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount < 5) {
      return res.status(400).json({ message: "Minimum top-up amount is $5.00." });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: req.user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "StagePass Wallet Top-up",
              description: "Purchase store credit to buy tickets.",
            },
            unit_amount: Math.round(numericAmount * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${frontendUrl}/my/wallet?topup=success`,
      cancel_url: `${frontendUrl}/my/wallet?topup=cancelled`,
      metadata: {
        type: "wallet_topup",
        userId: req.user._id.toString(),
        amount: String(numericAmount),
      },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("[Top-up Checkout Error]:", error);
    return res.status(500).json({ message: error.message || "Failed to create top-up checkout session." });
  }
};

module.exports = {
  createTopupSession,
};
