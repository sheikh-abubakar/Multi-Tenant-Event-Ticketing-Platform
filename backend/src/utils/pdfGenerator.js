const PDFDocument = require("pdfkit");
const moment = require("moment-timezone");

/**
 * Generates a PDF pass for staff check-in using PDFKit.
 * Returns a Promise that resolves to a Buffer.
 */
function generatePassPDF(pass, user, orgName, target, eventsList = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A5", margin: 30 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      // Theme Colors based on Pass Type
      let themeColor = "#3b82f6"; // Blue (General)
      if (pass.passType === "VIP Pass") {
        themeColor = "#d97706"; // Amber/Gold
      } else if (pass.passType === "Backstage Pass") {
        themeColor = "#7c3aed"; // Purple
      } else if (pass.passType === "Organizer Pass") {
        themeColor = "#059669"; // Emerald
      }

      // Background Card Border
      doc.rect(15, 15, doc.page.width - 30, doc.page.height - 30)
         .lineWidth(3)
         .stroke(themeColor);

      // Header Accents
      doc.rect(15, 15, doc.page.width - 30, 80)
         .fill(themeColor);

      // Header Text
      doc.fillColor("#ffffff")
         .font("Helvetica-Bold")
         .fontSize(20)
         .text("STAGEPASS ACCESS", 30, 32, { align: "center" });

      doc.fontSize(12)
         .font("Helvetica")
         .text(orgName.toUpperCase(), 30, 58, { align: "center", characterSpacing: 1 });

      // Pass Badge Title
      doc.rect((doc.page.width - 200) / 2, 110, 200, 28, 4)
         .fill("#1e293b");

      doc.fillColor("#ffffff")
         .font("Helvetica-Bold")
         .fontSize(12)
         .text(pass.passType.toUpperCase(), 30, 118, { align: "center" });

      // Main Info Table
      doc.fillColor("#1e293b")
         .font("Helvetica-Bold")
         .fontSize(13)
         .text("HOLDER DETAILS", 30, 160);

      doc.lineWidth(1)
         .moveTo(30, 175)
         .lineTo(doc.page.width - 30, 175)
         .stroke("#cbd5e1");

      // Holder Details text
      doc.font("Helvetica")
         .fontSize(10)
         .fillColor("#64748b")
         .text("Name:", 30, 185)
         .fillColor("#0f172a")
         .font("Helvetica-Bold")
         .text(user.name, 90, 185)

         .font("Helvetica")
         .fillColor("#64748b")
         .text("Email:", 30, 200)
         .fillColor("#0f172a")
         .text(user.email, 90, 200)

         .font("Helvetica")
         .fillColor("#64748b")
         .text("Code:", 30, 215)
         .fillColor(themeColor)
         .font("Helvetica-Bold")
         .text(pass.confirmationCode, 90, 215);

      // Access Validity details
      doc.fillColor("#1e293b")
         .font("Helvetica-Bold")
         .fontSize(13)
         .text("ACCESS SCOPE", 30, 240);

      doc.lineWidth(1)
         .moveTo(30, 255)
         .lineTo(doc.page.width - 30, 255)
         .stroke("#cbd5e1");

      const titleName = pass.targetType === "bundle" ? `Bundle: ${target.name}` : `Event: ${target.name}`;
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor("#0f172a")
         .text(titleName, 30, 265);

      if (pass.targetType === "event") {
        // Event session / date
        const eventDate = target.dateTime ? moment(target.dateTime).tz("Asia/Karachi").format("ddd, MMM D, YYYY [at] h:mm A") : "TBA";
        doc.font("Helvetica")
           .fillColor("#64748b")
           .text(`Date: ${eventDate}`, 30, 280)
           .text(`Venue: ${target.venueId?.name || "TBA"}`, 30, 295);
      } else {
        // Bundle details
        doc.font("Helvetica")
           .fillColor("#64748b")
           .text(`Includes entry to ${eventsList.length} events:`, 30, 280);

        let currentY = 295;
        eventsList.slice(0, 3).forEach((ev, idx) => {
          const evDate = ev.dateTime ? moment(ev.dateTime).tz("Asia/Karachi").format("MMM D, h:mm A") : "TBA";
          doc.fontSize(9)
             .fillColor("#334155")
             .text(`• ${ev.name} (${evDate})`, 35, currentY);
          currentY += 13;
        });

        if (eventsList.length > 3) {
          doc.fontSize(9)
             .fillColor("#64748b")
             .text(`• and ${eventsList.length - 3} more events...`, 35, currentY);
        }
      }

      // Add QR Code at the bottom right
      if (pass.qrCodeUrl && pass.qrCodeUrl.startsWith("data:image/")) {
        const base64Data = pass.qrCodeUrl.split(",")[1];
        if (base64Data) {
          const qrBuffer = Buffer.from(base64Data, "base64");
          doc.image(qrBuffer, doc.page.width - 130, doc.page.height - 150, { width: 100 });
        }
      }

      // Add print disclaimer
      doc.fillColor("#94a3b8")
         .fontSize(8)
         .font("Helvetica-Oblique")
         .text("Powered by StagePass. Show this QR code at the entrance for verification.", 30, doc.page.height - 42, { align: "left" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePassPDF };
