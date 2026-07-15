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

module.exports = { sendBookingConfirmation };