const nodemailer = require("nodemailer");
const moment = require("moment-timezone");
const Organization = require("../models/Organization");
const Event = require("../models/Event");

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
const formatDateForGoogle = (date, timezone) => {
  const tz = timezone || "Asia/Karachi";
  const m = moment.tz(date, tz);
  return m.utc().format("YYYYMMDDTHHmmss") + "Z";
};

// ── Unified Email Template Wrapper ──
// Renders a high-fidelity branded envelope with our exact gold ticket logo built in pure HTML/CSS
// to guarantee 100% support on all clients (Gmail, Outlook, Yahoo) without broken image warnings.
const renderEmailTemplate = (title, subtitle, contentHtml) => {
  return `
    <div style="background-color: #101325; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; min-height: 100%;">
      <div style="max-width: 600px; margin: 0 auto; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45); border-radius: 12px; overflow: hidden; border: 1px solid rgba(247, 242, 231, 0.12);">
        
        <!-- Header -->
        <div style="background: #15182e; padding: 32px 24px; border-bottom: 2px solid rgba(201, 154, 60, 0.25); text-align: center;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle; padding-right: 12px;">
                <!-- Pure HTML/CSS Gold Ticket Logo -->
                <table border="0" cellpadding="0" cellspacing="0" style="width: 38px; height: 24px; background: #c99a3c; background: linear-gradient(135deg, #e8bf6c 0%, #c99a3c 100%); border-radius: 4px; border-collapse: collapse; overflow: hidden; table-layout: fixed;">
                  <tr>
                    <!-- Left Notch -->
                    <td style="width: 4px; vertical-align: middle; padding: 0;">
                      <div style="width: 8px; height: 8px; background-color: #15182e; border-radius: 50%; margin-left: -4px; font-size: 1px; line-height: 1px;"></div>
                    </td>
                    <!-- Center line -->
                    <td style="vertical-align: middle; text-align: center; padding: 0;">
                      <div style="height: 16px; border-left: 2px dashed #15182e; opacity: 0.55; margin: 0 auto; width: 0px; font-size: 1px; line-height: 1px;"></div>
                    </td>
                    <!-- Right Notch -->
                    <td style="width: 4px; vertical-align: middle; text-align: right; padding: 0;">
                      <div style="width: 8px; height: 8px; background-color: #15182e; border-radius: 50%; margin-right: -4px; float: right; font-size: 1px; line-height: 1px;"></div>
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align: middle;">
                <span style="color: #f7f2e7; font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif; font-weight: 900; font-size: 28px; letter-spacing: 0.5px; line-height: 36px; display: inline-block;">
                  STAGE<span style="color: #c99a3c;">PASS</span>
                </span>
              </td>
            </tr>
          </table>
          <p style="color: #9fa2ba; margin: 8px 0 0; font-size: 11px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.12em; text-transform: uppercase;">${subtitle}</p>
        </div>

        <!-- Body -->
        <div style="background: #fffdf8; padding: 36px 32px; color: #1e2030; line-height: 1.6;">
          <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #15182e; font-family: 'Arial Black', Arial, sans-serif; letter-spacing: -0.02em;">${title}</h2>
          ${contentHtml}
        </div>

        <!-- Footer -->
        <div style="background: #0f1122; padding: 24px 32px; text-align: center; border-top: 1px solid rgba(247, 242, 231, 0.08);">
          <p style="margin: 0; font-size: 12px; color: #8a8070;">
            This email was sent by <strong>StagePass</strong>.
          </p>
          <p style="margin: 6px 0 0; font-size: 11px; color: #6b6054;">
            &copy; ${new Date().getFullYear()} StagePass. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
};

const sendBookingConfirmation = async (booking, event, qrCodeUrl, organizationId) => {
  console.log("📬 [Email Service] Sending Booking Confirmation for booking ID:", booking._id);
  const venue = event.venueId || {};
  const venueName = venue.name || "TBA";
  const venueAddress = [venue.address, venue.city].filter(Boolean).join(", ") || "Address TBA";
  const timezone = event.timezone || "Asia/Karachi";
  const targetDate = booking.eventDateTime || event.dateTime;
  const eventDate = new Date(targetDate);
  
  const formattedDate = moment.tz(eventDate, timezone).format("dddd, MMMM D, YYYY [at] h:mm A");

  const mapsQuery = encodeURIComponent(`${venueName} ${venueAddress}`);
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const eventStart = formatDateForGoogle(targetDate, timezone);
  const eventEnd = formatDateForGoogle(new Date(new Date(targetDate).getTime() + 3 * 60 * 60 * 1000), timezone);
  const location = encodeURIComponent(`${venueName}, ${venueAddress}`);
  const details = encodeURIComponent(
    [
      `Confirmation Code: ${booking.confirmationCode}`,
      `Buyer: ${booking.buyerName}`,
      `Total Paid: $${Number(booking.totalAmount || 0).toFixed(2)}`,
      `Timezone: ${timezone} (UTC${moment.tz(timezone).format("Z")})`,
      ``,
      `Tickets:`,
      ...booking.items.map((item) => `  - ${item.ticketTypeName} x${item.quantity} ($${Number(item.lineTotal || 0).toFixed(2)})`),
      ``,
      `View your booking: ${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${organizationId}/bookings/${booking._id}/confirmation`,
    ].join("\n")
  );

  const googleCalendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.name)}&dates=${eventStart}/${eventEnd}&location=${location}&details=${details}`;

  const ticketsRows = booking.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e8e0d0;">
        <td style="padding: 12px 10px; font-size: 14px; color: #1e2030;">${item.ticketTypeName}</td>
        <td style="padding: 12px 10px; text-align: center; font-size: 14px; color: #1e2030; font-weight: bold;">${item.quantity}</td>
        <td style="padding: 12px 10px; text-align: right; font-size: 14px; color: #1e2030; font-weight: bold;">$${Number(item.lineTotal || 0).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  const attachments = [];
  let qrCodeImageSrc = qrCodeUrl;

  // If the QR code is a Base64 string, package it as a standard inline attachment (CID)
  // to prevent Gmail/Outlook from blocking it as a raw data-URI.
  if (qrCodeUrl && qrCodeUrl.startsWith("data:image/")) {
    const base64Data = qrCodeUrl.split(",")[1];
    if (base64Data) {
      const cid = `qrcode_${booking._id}`;
      attachments.push({
        filename: "qrcode.png",
        content: Buffer.from(base64Data, "base64"),
        cid,
      });
      qrCodeImageSrc = `cid:${cid}`;
    }
  }

  const contentHtml = `
    <p style="font-size: 16px; margin: 0 0 16px;">Hi <strong>${booking.buyerName}</strong>,</p>
    <p style="font-size: 15px; margin: 0 0 24px; color: #3d3848; line-height: 1.6;">
      Your booking for <strong>${event.name}</strong> has been confirmed. Here are your ticket details.
    </p>

    <!-- Confirmation code banner -->
    <div style="background: #f7f2e7; border-left: 4px solid #c99a3c; padding: 16px 20px; border-radius: 6px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 12px; color: #6b6054; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;">Confirmation Code</p>
      <p style="margin: 4px 0 0; font-size: 24px; font-weight: 800; color: #15182e; letter-spacing: 0.04em;">${booking.confirmationCode}</p>
    </div>

    <!-- Event details card -->
    <div style="background: #ffffff; border: 1px solid #e8e0d0; border-radius: 10px; padding: 20px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
      <h3 style="margin: 0 0 16px; font-size: 18px; color: #15182e; font-family: Arial, sans-serif; font-weight: 700; border-bottom: 1px dashed #e8e0d0; padding-bottom: 8px;">Event Details</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.6;">
        <tr>
          <td style="padding: 6px 0; color: #6b6054; width: 110px; vertical-align: top;"><strong>Event</strong></td>
          <td style="padding: 6px 0; color: #1e2030; font-weight: 600;">${event.name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b6054; vertical-align: top;"><strong>Date & Time</strong></td>
          <td style="padding: 6px 0; color: #1e2030;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b6054; vertical-align: top;"><strong>Venue</strong></td>
          <td style="padding: 6px 0; color: #1e2030;">
            <strong>${venueName}</strong><br/>
            <span style="color: #6b6054; font-size: 13px;">${venueAddress}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b6054; vertical-align: top;"><strong>Total Paid</strong></td>
          <td style="padding: 6px 0; color: #c99a3c; font-weight: bold; font-size: 16px;">$${Number(booking.totalAmount || 0).toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <!-- Tickets table -->
    <h3 style="font-size: 16px; color: #15182e; margin: 0 0 12px; font-weight: 700;">Your Tickets</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e8e0d0; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #15182e; color: #f7f2e7;">
          <th style="padding: 12px 10px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;">Ticket Type</th>
          <th style="padding: 12px 10px; text-align: center; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; width: 60px;">Qty</th>
          <th style="padding: 12px 10px; text-align: right; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; width: 100px;">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${ticketsRows}
      </tbody>
    </table>

    <!-- QR Code -->
    ${
      qrCodeImageSrc
        ? `
      <div style="text-align: center; margin: 28px 0; background: #ffffff; border: 1px solid #e8e0d0; border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <p style="font-size: 15px; color: #15182e; margin: 0 0 12px; font-weight: bold;">Show this QR code at the event entrance:</p>
        <img src="${qrCodeImageSrc}" alt="QR Code" style="max-width: 180px; border: 2px solid #15182e; border-radius: 8px; padding: 6px; background: #fff;" />
      </div>
    `
        : ""
    }

    <!-- Action buttons -->
    <div style="text-align: center; margin: 28px 0;">
      <a
        href="${googleCalendarLink}"
        target="_blank"
        rel="noopener noreferrer"
        style="display: inline-block; background: #c99a3c; color: #1e1a0c; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 800; margin: 6px; font-size: 14px; box-shadow: 3px 3px 0 #15182e; border: 1px solid #15182e;"
      >
        📅 Add to Calendar
      </a>
      <a
        href="${mapsLink}"
        target="_blank"
        rel="noopener noreferrer"
        style="display: inline-block; background: #15182e; color: #f7f2e7; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 800; margin: 6px; font-size: 14px; box-shadow: 3px 3px 0 #c99a3c; border: 1px solid #c99a3c;"
      >
        📍 View on Map
      </a>
    </div>

    <!-- Support -->
    <div style="background: #f7f2e7; padding: 16px 20px; border-radius: 8px; margin-top: 24px; font-size: 14px; color: #6b6054; line-height: 1.5;">
      <strong>Need help?</strong> Contact us at <a href="mailto:support@stagepass.com" style="color: #c99a3c; text-decoration: none; font-weight: bold;">support@stagepass.com</a>
      or reply to this email. Please have your confirmation code <strong>${booking.confirmationCode}</strong> ready.
    </div>

    <!-- Cancellation policy -->
    <p style="font-size: 12px; color: #8a8070; margin-top: 20px; line-height: 1.6; border-top: 1px solid #e8e0d0; padding-top: 16px;">
      <strong>Cancellation & Refund Policy:</strong> Tickets can be refunded up to 7 days before the event. After that, no refunds will be issued. To request a refund, contact support with your confirmation code.
    </p>
  `;

  const html = renderEmailTemplate(
    `Booking Confirmed — ${event.name}`,
    "Booking Confirmation",
    contentHtml
  );

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: booking.buyerEmail,
    subject: `Booking Confirmed — ${event.name}`,
    html,
    attachments,
  };

  return transporter.sendMail(mailOptions);
};

const sendPaymentReminder = async (booking, event, paymentUrl) => {
  console.log("📬 [Email Service] Sending Payment Reminder for booking ID:", booking._id);
  const contentHtml = `
    <p style="font-size: 16px; margin: 0 0 16px;">Hi <strong>${booking.buyerName}</strong>,</p>
    <p style="font-size: 15px; margin: 0 0 24px; color: #3d3848; line-height: 1.6;">
      You started booking tickets for <strong>${event.name}</strong>, but the payment hasn't been completed yet.
      We're holding your tickets for a short while longer — click below to finish paying before they're released back to other buyers.
    </p>

    <div style="background: #f7f2e7; padding: 20px; border-radius: 10px; border-left: 4px solid #c99a3c; margin: 24px 0;">
      <h3 style="margin: 0 0 12px; color: #15182e; font-size: 16px; font-weight: 700;">Order Summary</h3>
      <p style="margin: 6px 0; font-size: 14px;"><strong>Event:</strong> ${event.name}</p>
      <p style="margin: 6px 0; font-size: 14px;"><strong>Total:</strong> Rs. ${booking.totalAmount}</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a
        href="${paymentUrl}"
        style="background: #c99a3c; color: #1e1a0c; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 800; display: inline-block; font-size: 16px; box-shadow: 3px 3px 0 #15182e; border: 1px solid #15182e;"
      >
        Complete Payment
      </a>
    </div>

    <p style="color: #8a8070; font-size: 13px; margin-top: 30px; border-top: 1px solid #e8e0d0; padding-top: 16px; line-height: 1.5;">
      If you've already paid, please disregard this email. This is an automated reminder from StagePass.
    </p>
  `;

  const html = renderEmailTemplate(
    "Your tickets are waiting! ⏳",
    "Payment Reminder",
    contentHtml
  );

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: booking.buyerEmail,
    subject: `Complete your payment — ${event.name}`,
    html,
  };

  return transporter.sendMail(mailOptions);
};

// A cart checkout can create several Booking documents but has one Stripe
// session. This sends one complete order reminder for that session.
const sendUnifiedPaymentReminder = async (bookings, paymentUrl) => {
  const primary = bookings[0];
  if (!primary) return;
  const money = (amount) => `$${Number(amount || 0).toFixed(2)}`;
  const groups = new Map();
  for (const booking of bookings) {
    const key = booking.isBundleBooking && booking.bundleId ? `bundle:${booking.bundleId}` : `event:${booking._id}`;
    if (!groups.has(key)) groups.set(key, { title: booking.isBundleBooking ? (booking.bundleName || "Event Bundle") : (booking.eventName || "Event"), bundle: Boolean(booking.isBundleBooking), lines: [], total: 0 });
    const group = groups.get(key);
    const seats = (booking.selectedSeats || []).map((seat) => `${seat.sectionName || "Section"} - ${seat.seatName}`).join(", ");
    const tickets = (booking.items || []).map((item) => `${item.ticketTypeName} x${item.quantity}`).join(", ");
    group.lines.push({ event: booking.eventName || "Event", detail: seats || tickets || "Tickets selected" });
    group.total += Number(booking.totalAmount || 0);
  }
  const total = bookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0);
  const expiry = bookings.reduce((earliest, booking) => !earliest || new Date(booking.expiresAt) < earliest ? new Date(booking.expiresAt) : earliest, null);
  const minutesRemaining = expiry ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (60 * 1000))) : null;
  const summary = [...groups.values()].map((group) => `<div style="padding:12px 0;border-bottom:1px solid #e8e0d0"><p style="margin:0 0 5px;font-size:14px;font-weight:800">${group.bundle ? "Bundle: " : "Event: "}${group.title}</p>${group.lines.map((line) => `<p style="margin:3px 0;font-size:13px;color:#5d5668">${group.bundle ? `${line.event}: ` : ""}${line.detail}</p>`).join("")}<p style="margin:6px 0 0;text-align:right;font-weight:800">${money(group.total)}</p></div>`).join("");
  const contentHtml = `<p style="font-size:16px;margin:0 0 16px">Hi <strong>${primary.buyerName}</strong>,</p><p style="font-size:15px;margin:0 0 24px;color:#3d3848;line-height:1.6">Your cart checkout is waiting for payment. Complete payment before your selected tickets are released to other buyers.</p><div style="background:#f7f2e7;padding:20px;border-radius:10px;border-left:4px solid #c99a3c;margin:24px 0"><h3 style="margin:0 0 12px;color:#15182e;font-size:16px">Order Summary</h3>${summary}<p style="margin:14px 0 0;text-align:right;font-size:15px"><strong>Order total:</strong> ${money(total)}</p></div><div style="text-align:center;margin:32px 0"><a href="${paymentUrl}" style="background:#c99a3c;color:#1e1a0c;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:800;display:inline-block;font-size:16px">Complete Payment</a></div><p style="color:#8a8070;font-size:13px;margin-top:30px;border-top:1px solid #e8e0d0;padding-top:16px;line-height:1.5">${expiry ? `<strong>Time remaining: about ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}.</strong><br/>This payment link and ticket hold expire at <strong>${expiry.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</strong>. ` : ""}If you've already paid, please disregard this email.</p>`;
  return transporter.sendMail({ from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>', to: primary.buyerEmail, subject: `Complete your StagePass payment (${bookings.length} booking${bookings.length === 1 ? "" : "s"})`, html: renderEmailTemplate("Your tickets are waiting", "Payment Reminder", contentHtml) });
};

const sendUnifiedBookingConfirmation = async (bookings) => {
  const primary = bookings[0];
  if (!primary) return;
  const money = (amount) => `$${Number(amount || 0).toFixed(2)}`;
  const events = await Event.find({ _id: { $in: bookings.map((booking) => booking.eventId).filter(Boolean) } })
    .select("venueId timezone")
    .populate("venueId", "name address city")
    .lean();
  const eventById = new Map(events.map((event) => [String(event._id), event]));
  const organization = await Organization.findById(primary.organizationId).select("slug").lean();
  const groups = new Map();
  for (const booking of bookings) {
    const key = booking.isBundleBooking && booking.bundleId ? `bundle:${booking.bundleId}` : `event:${booking._id}`;
    if (!groups.has(key)) groups.set(key, { title: booking.isBundleBooking ? (booking.bundleName || "Event Bundle") : (booking.eventName || "Event"), bundle: Boolean(booking.isBundleBooking), lines: [], total: 0 });
    const group = groups.get(key);
    const seats = (booking.selectedSeats || []).map((seat) => `${seat.sectionName || "Section"} - ${seat.seatName}`).join(", ");
    const tickets = (booking.items || []).map((item) => `${item.ticketTypeName} x${item.quantity}`).join(", ");
    const venue = eventById.get(String(booking.eventId))?.venueId;
    const timezone = eventById.get(String(booking.eventId))?.timezone || "Asia/Karachi";
    const venueLabel = [venue?.name, venue?.address, venue?.city].filter(Boolean).join(", ");
    const eventStart = formatDateForGoogle(booking.eventDateTime, timezone);
    const eventEnd = formatDateForGoogle(new Date(new Date(booking.eventDateTime).getTime() + 3 * 60 * 60 * 1000), timezone);
    const calendarDetails = [
      `Confirmation Code: ${booking.confirmationCode}`,
      `Tickets: ${tickets || "Confirmed tickets"}`,
      venueLabel ? `Venue: ${venueLabel}` : "",
      `View tickets: ${organization?.slug ? `${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${organization.slug}/bookings/${booking._id}/confirmation` : `${process.env.FRONTEND_URL || "http://localhost:5173"}/my/bookings`}`,
    ].filter(Boolean).join("\n");
    group.lines.push({
      event: booking.eventName || "Event",
      detail: seats || tickets || "Tickets confirmed",
      code: booking.confirmationCode,
      venueName: venue?.name || "Venue to be announced",
      venueAddress: venueLabel || null,
      mapUrl: venueLabel ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueLabel)}` : null,
      calendarUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(booking.eventName || "StagePass Event")}&dates=${eventStart}/${eventEnd}&location=${encodeURIComponent(venueLabel)}&details=${encodeURIComponent(calendarDetails)}`,
    });
    group.total += Number(booking.totalAmount || 0);
  }
  const total = bookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0);
  const summary = [...groups.values()].map((group) => `<div style="padding:12px 0;border-bottom:1px solid #e8e0d0"><p style="margin:0 0 5px;font-size:14px;font-weight:800">${group.bundle ? "Bundle: " : "Event: "}${group.title}</p>${group.lines.map((line) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0;border-collapse:collapse"><tr><td style="font-size:13px;color:#5d5668;line-height:1.5">${group.bundle ? `<strong style="color:#1e2030">${line.event}</strong><br/>` : ""}${line.detail}<br/><strong>Confirmation: ${line.code}</strong><br/><span style="font-size:12px;color:#6b6054"><strong>Venue:</strong> ${line.venueName}${line.venueAddress ? `<br/>${line.venueAddress}` : ""}</span></td><td align="right" valign="middle" style="padding-left:12px;white-space:nowrap">${line.mapUrl ? `<a href="${line.mapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;color:#fffdf8;background:#15182e;border:1px solid #c99a3c;border-radius:5px;padding:8px 10px;font-size:12px;font-weight:800;text-decoration:none;margin-bottom:6px">View venue map</a><br/>` : ""}<a href="${line.calendarUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;color:#1e1a0c;background:#c99a3c;border-radius:5px;padding:8px 10px;font-size:12px;font-weight:800;text-decoration:none">Add to Google Calendar</a></td></tr></table>`).join("")}<p style="margin:6px 0 0;text-align:right;font-weight:800">${money(group.total)}</p></div>`).join("");
  const confirmationUrl = organization?.slug
    ? `${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${organization.slug}/bookings/${primary._id}/confirmation`
    : `${process.env.FRONTEND_URL || "http://localhost:5173"}/my/bookings`;
  const contentHtml = `<p style="font-size:16px;margin:0 0 16px">Hi <strong>${primary.buyerName}</strong>,</p><p style="font-size:15px;margin:0 0 24px;color:#3d3848;line-height:1.6">Your StagePass checkout is confirmed. Keep the confirmation codes below for entry.</p><div style="background:#f7f2e7;padding:20px;border-radius:10px;border-left:4px solid #c99a3c;margin:24px 0"><h3 style="margin:0 0 12px;color:#15182e;font-size:16px">Confirmed Order</h3>${summary}<p style="margin:14px 0 0;text-align:right;font-size:15px"><strong>Total paid:</strong> ${money(total)}</p></div><p style="font-size:13px;color:#5d5668;margin:0 0 12px">Use the calendar button beside each event to open Google Calendar with its correct time and venue.</p><div style="text-align:center;margin:32px 0"><a href="${confirmationUrl}" style="background:#c99a3c;color:#1e1a0c;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:800;display:inline-block;font-size:14px;margin:10px 6px">View Tickets and QR Codes</a></div>`;
  return transporter.sendMail({ from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>', to: primary.buyerEmail, subject: `Booking Confirmed - ${bookings.length} booking${bookings.length === 1 ? "" : "s"}`, html: renderEmailTemplate("Your StagePass booking is confirmed", "Booking Confirmation", contentHtml) });
};

const sendTeamInvitation = async ({ email, orgName, orgSlug, inviterName, invitationToken }) => {
  console.log("📬 [Email Service] Sending Team Invitation to email:", email);
  const acceptUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${orgSlug}/accept-invite?token=${invitationToken}`;

  const contentHtml = `
    <p style="font-size: 16px; margin: 0 0 16px;">Hi there,</p>
    <p style="font-size: 15px; margin: 0 0 24px; color: #3d3848; line-height: 1.6;">
      <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on StagePass as a team member.
    </p>

    <div style="background: #f7f2e7; padding: 20px; border-radius: 10px; border-left: 4px solid #c99a3c; margin: 24px 0;">
      <p style="margin: 0; color: #1e2030; font-size: 15px; line-height: 1.6;">
        Click the button below to accept the invitation and set up your login credentials.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a
        href="${acceptUrl}"
        style="background: #c99a3c; color: #1e1a0c; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 800; display: inline-block; font-size: 16px; box-shadow: 3px 3px 0 #15182e; border: 1px solid #15182e;"
      >
        Accept Invitation
      </a>
    </div>

    <p style="color: #8a8070; font-size: 13px; margin-top: 30px; border-top: 1px solid #e8e0d0; padding-top: 16px; line-height: 1.5;">
      This invitation link will expire after 7 days. If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  `;

  const html = renderEmailTemplate(
    `You're invited to join ${orgName}! 🎫`,
    "Team Invitation",
    contentHtml
  );

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: email,
    subject: `You've been invited to join ${orgName} on StagePass`,
    html,
  };

  return transporter.sendMail(mailOptions);
};

const sendPasswordResetOTP = async (email, otpCode) => {
  console.log("📬 [Email Service] Sending Password Reset OTP to email:", email);
  const contentHtml = `
    <p style="font-size: 16px; margin: 0 0 16px;">Hi,</p>
    <p style="font-size: 15px; line-height: 1.6; color: #3d3848; margin: 0 0 24px;">
      You requested to reset your password. Use the following 6-digit verification code to complete the reset. This code is valid for <strong>10 minutes</strong>.
    </p>
    
    <div style="background: #f7f2e7; text-align: center; padding: 24px; border-radius: 10px; margin-bottom: 24px; border: 2px dashed #c99a3c;">
      <span style="font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #15182e; font-family: monospace;">${otpCode}</span>
    </div>

    <p style="font-size: 13px; color: #6b6054; line-height: 1.5; margin: 0 0 24px;">
      If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
  `;

  const html = renderEmailTemplate(
    "Password Reset Request 🔒",
    "Security Verification",
    contentHtml
  );

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"StagePass" <noreply@stagepass.com>',
    to: email,
    subject: `Password Reset Verification Code — ${otpCode}`,
    html,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendBookingConfirmation, sendPaymentReminder, sendUnifiedPaymentReminder, sendUnifiedBookingConfirmation, sendTeamInvitation, sendPasswordResetOTP };
