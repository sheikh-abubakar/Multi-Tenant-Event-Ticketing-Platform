const nodemailer = require("nodemailer");
const moment = require("moment-timezone");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: format date for Google Calendar in UTC
// Uses the event's timezone to convert local time to UTC
// so Google Calendar automatically displays correct time for any user's timezone
const formatDateForGoogle = (date, timezone) => {
  const tz = timezone || "Asia/Karachi";
  // Convert local time (in event's timezone) to UTC
  const m = moment.tz(date, tz);
  // Return in UTC format
  return m.utc().format("YYYYMMDDTHHmmss") + "Z";
};

const sendBookingConfirmation = async (booking, event, qrCodeUrl, organizationId) => {
  const venue = event.venueId || {};
  const venueName = venue.name || "TBA";
  const venueAddress = [venue.address, venue.city].filter(Boolean).join(", ") || "Address TBA";
  const timezone = event.timezone || "Asia/Karachi";
  const eventDate = new Date(event.dateTime);
  
  // Display date in venue's local timezone
  const formattedDate = moment.tz(eventDate, timezone).format("dddd, MMMM D, YYYY [at] h:mm A");
  const timezoneDisplay = timezone.split("/").pop().replace(/_/g, " ");

  // Google Maps link
  const mapsQuery = encodeURIComponent(`${venueName} ${venueAddress}`);
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  // Google Calendar "Quick Add" link — uses UTC times for correct display everywhere
  const eventStart = formatDateForGoogle(event.dateTime, timezone);
  const eventEnd = formatDateForGoogle(new Date(new Date(event.dateTime).getTime() + 3 * 60 * 60 * 1000), timezone);
  const location = encodeURIComponent(`${venueName}, ${venueAddress}`);
  const details = encodeURIComponent(
    [
      `Confirmation Code: ${booking.confirmationCode}`,
      `Buyer: ${booking.buyerName}`,
      `Total Paid: Rs. ${booking.totalAmount}`,
      `Timezone: ${timezone} (UTC${moment.tz(timezone).format("Z")})`,
      ``,
      `Tickets:`,
      ...booking.items.map((item) => `  - ${item.ticketTypeName} x${item.quantity} (Rs. ${item.lineTotal})`),
      ``,
      `View your booking: ${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${organizationId}/bookings/${booking._id}/confirmation`,
    ].join("\n")
  );

  const googleCalendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.name)}&dates=${eventStart}/${eventEnd}&location=${location}&details=${details}`;

  // Order summary rows
  const ticketsRows = booking.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e0d6c5;">
        <td style="padding: 10px; font-size: 14px; color: #1e2030;">${item.ticketTypeName}</td>
        <td style="padding: 10px; text-align: center; font-size: 14px; color: #1e2030;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right; font-size: 14px; color: #1e2030;">Rs. ${item.lineTotal}</td>
      </tr>
    `,
    )
    .join("");

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: booking.buyerEmail,
    subject: `Booking Confirmed — ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e2030;">
        <!-- Header -->
        <div style="background: #192436; padding: 28px 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #c99a3c; margin: 0; font-size: 28px; letter-spacing: 0.04em;">StagePass</h1>
          <p style="color: #f7f2e7; margin: 6px 0 0; font-size: 14px;">Booking Confirmation</p>
        </div>

        <!-- Body -->
        <div style="background: #fffdf8; padding: 28px 32px; border: 1px solid #e8e0d0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin: 0 0 12px;">Hi <strong>${booking.buyerName}</strong>,</p>
          <p style="font-size: 15px; margin: 0 0 20px; color: #3d3848;">
            Your booking for <strong>${event.name}</strong> has been confirmed. Here are your ticket details.
          </p>

          <!-- Confirmation code banner -->
          <div style="background: #f7f2e7; border-left: 4px solid #c99a3c; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; color: #6b6054; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;">Confirmation Code</p>
            <p style="margin: 4px 0 0; font-size: 22px; font-weight: 700; color: #192436; letter-spacing: 0.04em;">${booking.confirmationCode}</p>
          </div>

          <!-- Event details card -->
          <div style="background: #ffffff; border: 1px solid #e8e0d0; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 12px; font-size: 18px; color: #192436;">Event Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #6b6054; width: 110px; vertical-align: top;"><strong>Event</strong></td>
                <td style="padding: 6px 0; color: #1e2030;">${event.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b6054; vertical-align: top;"><strong>Date & Time</strong></td>
                <td style="padding: 6px 0; color: #1e2030;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b6054; vertical-align: top;"><strong>Venue</strong></td>
                <td style="padding: 6px 0; color: #1e2030;">
                  ${venueName}<br/>
                  <span style="color: #6b6054; font-size: 13px;">${venueAddress}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b6054; vertical-align: top;"><strong>Total Paid</strong></td>
                <td style="padding: 6px 0; color: #1e2030; font-weight: 600;">Rs. ${booking.totalAmount}</td>
              </tr>
            </table>
          </div>

          <!-- Tickets table -->
          <h3 style="font-size: 16px; color: #192436; margin: 0 0 10px;">Your Tickets</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #192436; color: #f7f2e7;">
                <th style="padding: 10px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Ticket Type</th>
                <th style="padding: 10px; text-align: center; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Qty</th>
                <th style="padding: 10px; text-align: right; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${ticketsRows}
            </tbody>
          </table>

          <!-- QR Code -->
          ${
            qrCodeUrl
              ? `
            <div style="text-align: center; margin: 24px 0;">
              <p style="font-size: 14px; color: #3d3848; margin: 0 0 10px;"><strong>Show this QR code at the event entrance:</strong></p>
              <img src="${qrCodeUrl}" alt="QR Code" style="max-width: 180px; border: 2px solid #192436; border-radius: 8px; padding: 6px; background: #fff;" />
            </div>
          `
              : ""
          }

          <!-- Action buttons -->
          <div style="text-align: center; margin: 24px 0;">
            <a
              href="${googleCalendarLink}"
              target="_blank"
              rel="noopener noreferrer"
              style="display: inline-block; background: #c99a3c; color: #1e1a0c; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 6px; font-size: 14px;"
            >
              📅 Add to Calendar
            </a>
            <a
              href="${mapsLink}"
              target="_blank"
              rel="noopener noreferrer"
              style="display: inline-block; background: #192436; color: #f7f2e7; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 6px; font-size: 14px;"
            >
              📍 View on Map
            </a>
          </div>

          <!-- Support -->
          <div style="background: #f7f2e7; padding: 14px 18px; border-radius: 8px; margin-top: 20px; font-size: 13px; color: #6b6054;">
            <strong>Need help?</strong> Contact us at <a href="mailto:support@stagepass.com" style="color: #c99a3c; text-decoration: none;">support@stagepass.com</a>
            or reply to this email. Please have your confirmation code <strong>${booking.confirmationCode}</strong> ready.
          </div>

          <!-- Cancellation policy -->
          <p style="font-size: 12px; color: #8a8070; margin-top: 18px; line-height: 1.5;">
            <strong>Cancellation & Refund Policy:</strong> Tickets can be refunded up to 7 days before the event. After that, no refunds will be issued. To request a refund, contact support with your confirmation code.
          </p>

          <p style="font-size: 12px; color: #8a8070; margin-top: 14px;">
            This is an automated confirmation from StagePass. Please do not reply to this email.
          </p>
        </div>
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

/**
 * Sent when a staff member is invited to an organization.
 * Contains a magic link they click to accept and set their password.
 */
const sendTeamInvitation = async ({ email, orgName, orgSlug, inviterName, invitationToken }) => {
  const acceptUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${orgSlug}/accept-invite?token=${invitationToken}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: email,
    subject: `You've been invited to join ${orgName} on StagePass`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto;">
        <h1 style="color: #192436;">You're invited! 🎫</h1>
        <p>
          <strong>${inviterName}</strong> has invited you to join
          <strong>${orgName}</strong> on StagePass as a team member.
        </p>

        <div style="background: #f7f2e7; padding: 20px; border-radius: 12px; margin: 20px 0;">
          <p style="margin: 0; color: #1e2030;">
            Click the button below to accept the invitation and set up your
            login credentials.
          </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a
            href="${acceptUrl}"
            style="background: #c99a3c; color: #1e1a0c; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block; font-size: 16px;"
          >
            Accept Invitation
          </a>
        </div>

        <p style="color: #8a8070; font-size: 13px;">
          This invitation link will expire after 7 days. If you weren't
          expecting this invitation, you can safely ignore this email.
        </p>
        <p style="color: #8a8070; font-size: 13px; margin-top: 20px;">
          — StagePass Team
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendBookingConfirmation, sendPaymentReminder, sendTeamInvitation };
