const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendBookingConfirmation = async (booking, event, qrCodeUrl) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: booking.buyerEmail,
    subject: `Booking Confirmed — ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #192436;">Booking Confirmed!</h1>
        <p>Hi <strong>${booking.buyerName}</strong>,</p>
        <p>Your booking for <strong>${event.name}</strong> has been confirmed.</p>

        <div style="background: #f7f2e7; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #192436;">Booking Details</h3>
          <p><strong>Confirmation Code:</strong> ${booking.confirmationCode}</p>
          <p><strong>Event:</strong> ${event.name}</p>
          <p><strong>Date:</strong> ${new Date(event.dateTime).toLocaleString()}</p>
          <p><strong>Total Paid:</strong> Rs. ${booking.totalAmount}</p>
          <p><strong>Status:</strong> ${booking.status}</p>
        </div>

        <h3>Your Tickets</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <thead>
            <tr style="background: #192436; color: #f7f2e7;">
              <th style="padding: 10px; text-align: left;">Ticket Type</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${booking.items
              .map(
                (item) => `
              <tr style="border-bottom: 1px solid #e0d6c5;">
                <td style="padding: 10px;">${item.ticketTypeName}</td>
                <td style="padding: 10px; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right;">Rs. ${item.lineTotal}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        ${
          qrCodeUrl
            ? `
          <div style="text-align: center; margin: 25px 0;">
            <p><strong>Your QR Code — Show this at the event entrance:</strong></p>
            <img src="${qrCodeUrl}" alt="QR Code" style="max-width: 200px; border: 2px solid #192436; border-radius: 8px;" />
          </div>
        `
            : ""
        }

        <p style="color: #8a8070; font-size: 13px; margin-top: 30px;">
          This is an automated confirmation from StagePass. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

/**
 * Sent by the booking scheduler (see services/bookingScheduler.js) when a
 * pending booking's payment hasn't been completed 30 seconds after
 * checkout started. Links directly to the Stripe-hosted payment page
 * (paymentUrl = the Stripe Checkout Session's `.url`) so the buyer can
 * finish paying in one click, without needing to re-add items to a cart.
 */
const sendPaymentReminder = async (booking, event, paymentUrl) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: booking.buyerEmail,
    subject: `Complete your payment — ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #192436;">Your tickets are waiting!</h1>
        <p>Hi <strong>${booking.buyerName}</strong>,</p>
        <p>
          You started booking tickets for <strong>${event.name}</strong>, but
          the payment hasn't been completed yet. We're holding your tickets
          for a short while longer — click below to finish paying before
          they're released back to other buyers.
        </p>

        <div style="background: #f7f2e7; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #192436;">Order Summary</h3>
          <p><strong>Event:</strong> ${event.name}</p>
          <p><strong>Total:</strong> Rs. ${booking.totalAmount}</p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a
            href="${paymentUrl}"
            style="background: #c99a3c; color: #1e1a0c; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;"
          >
            Complete Payment
          </a>
        </div>

        <p style="color: #8a8070; font-size: 13px; margin-top: 30px;">
          If you've already paid, please disregard this email. This is an
          automated reminder from StagePass — please do not reply.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendBookingConfirmation, sendPaymentReminder };
