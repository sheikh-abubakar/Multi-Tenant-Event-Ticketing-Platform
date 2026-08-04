const PDFDocument = require("pdfkit");
const https = require("https");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../config/s3");

/**
 * Downloads a chart image buffer from QuickChart API
 */
const fetchChartImage = (chartConfig) => {
  return new Promise((resolve, reject) => {
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    const url = `https://quickchart.io/chart?c=${encodedConfig}&w=500&h=300`;

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to get chart image from QuickChart: status ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", (err) => reject(err));
  });
};

/**
 * Uploads a compiled PDF buffer to AWS S3 bucket
 */
const uploadPdfToS3 = async (buffer) => {
  const bucketName = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  const baseUrl = process.env.S3_PUBLIC_BASE_URL || `https://${bucketName}.s3.${region}.amazonaws.com`;
  
  if (!bucketName || !process.env.AWS_ACCESS_KEY_ID) {
    throw new Error("AWS S3 is not configured in environment variables.");
  }

  const key = `event-banners/${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: "application/pdf",
    CacheControl: "public, max-age=604800", // 1 week cache
  }));

  return `${baseUrl.replace(/\/$/, "")}/${key}`;
};

/**
 * Compiles visual PDF and uploads to S3
 */
const generatePlatformReport = async (metrics) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          const s3Url = await uploadPdfToS3(pdfBuffer);
          resolve(s3Url);
        } catch (err) {
          reject(err);
        }
      });

      // ── DRAWING THE PDF LAYOUT ─────────────────────────────────────
      
      // Header Banner
      doc.rect(0, 0, 612, 100).fill("#14162b");
      doc.fillColor("#c99a3c").fontSize(22).font("Helvetica-Bold").text("STAGEPASS", 50, 30);
      doc.fillColor("#ffffff").fontSize(12).font("Helvetica").text("PLATFORM EXECUTIVE INTEL REPORT", 50, 58);
      doc.fillColor("#aeb0c4").fontSize(9).text(`Generated: ${new Date().toLocaleDateString()} @ ${new Date().toLocaleTimeString()}`, 380, 58);
      
      // Draw Gold Divider line
      doc.strokeColor("#c99a3c").lineWidth(3).moveTo(50, 115).lineTo(545, 115).stroke();

      // Stats Section Title
      doc.fillColor("#14162b").fontSize(14).font("Helvetica-Bold").text("1. Overall Platform Performance", 50, 130);

      // Draw Key Performance Indicator grid (KPI boxes)
      const kpis = [
        { label: "Gross Platform Revenue", value: `$${metrics.grossRevenue.toFixed(2)}` },
        { label: "Total Ticket Bookings", value: String(metrics.totalBookings) },
        { label: "Active Organizations", value: String(metrics.activeOrgs) },
        { label: "Active Event Listings", value: String(metrics.activeEvents) },
      ];

      let kpiX = 50;
      let kpiY = 160;
      kpis.forEach((kpi, idx) => {
        if (idx === 2) {
          kpiX = 50;
          kpiY = 230;
        }
        // KPI background card
        doc.rect(kpiX, kpiY, 235, 55).fill("#fbfbfb").stroke("#e2e4f0");
        doc.fillColor("#5d6075").fontSize(8).font("Helvetica").text(kpi.label, kpiX + 15, kpiY + 12);
        doc.fillColor("#14162b").fontSize(15).font("Helvetica-Bold").text(kpi.value, kpiX + 15, kpiY + 28);
        
        kpiX += 260;
      });

      // 2. Chart Section
      doc.fillColor("#14162b").fontSize(14).font("Helvetica-Bold").text("2. Organization Ticket Sales Share", 50, 310);
      
      // Setup Chart Configuration for QuickChart
      const orgNames = metrics.topPerformers.map(p => p.name);
      const orgSales = metrics.topPerformers.map(p => p.ticketsSold);

      const chartConfig = {
        type: "bar",
        data: {
          labels: orgNames.length ? orgNames : ["No Active Organizations"],
          datasets: [{
            label: "Tickets Sold",
            data: orgSales.length ? orgSales : [0],
            backgroundColor: ["#c99a3c", "#4f46e5", "#06b6d4", "#ec4899", "#8b5cf6"],
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          title: {
            display: true,
            text: "Sales Count by Organization"
          },
          legend: { display: false },
          scales: {
            yAxes: [{ ticks: { beginAtZero: true } }]
          }
        }
      };

      try {
        const chartBuffer = await fetchChartImage(chartConfig);
        doc.image(chartBuffer, 50, 340, { width: 495 });
      } catch (chartErr) {
        console.error("[PDF Report] QuickChart embedding failed:", chartErr.message);
        doc.fillColor("#ef4444").fontSize(10).text("Visual chart could not be loaded.", 50, 350);
      }

      // Add page brake for table list
      doc.addPage();
      
      // 3. Organization Performance Table
      doc.fillColor("#14162b").fontSize(14).font("Helvetica-Bold").text("3. Organization Performance Audit Log", 50, 50);

      // Header Row for Table
      let tableY = 80;
      doc.rect(50, tableY, 495, 25).fill("#14162b");
      doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
      doc.text("Organization Name", 60, tableY + 8);
      doc.text("Events Count", 260, tableY + 8);
      doc.text("Tickets Sold", 360, tableY + 8);
      doc.text("Total Revenue ($)", 450, tableY + 8);

      // Draw rows
      doc.font("Helvetica").fontSize(9).fillColor("#14162b");
      metrics.topPerformers.forEach((perf) => {
        tableY += 25;
        // Alt background colors
        doc.rect(50, tableY, 495, 25).fill(tableY % 50 === 0 ? "#fbfbfb" : "#ffffff");
        
        doc.text(perf.name, 60, tableY + 8);
        doc.text(String(perf.eventsCount), 260, tableY + 8);
        doc.text(String(perf.ticketsSold), 360, tableY + 8);
        doc.text(`$${perf.revenue.toFixed(2)}`, 450, tableY + 8);
      });

      // Footer
      doc.fontSize(8).fillColor("#aeb0c4").text("CONFIDENTIAL - STAGEPASS INTERNAL PLATFORM REPORT", 50, 750, { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Compiles comparison PDF report between target organizations and uploads to S3
 */
const generateComparisonReport = async (comparison) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          const s3Url = await uploadPdfToS3(pdfBuffer);
          resolve(s3Url);
        } catch (err) {
          reject(err);
        }
      });

      // Header Banner
      doc.rect(0, 0, 612, 100).fill("#14162b");
      doc.fillColor("#c99a3c").fontSize(22).font("Helvetica-Bold").text("STAGEPASS", 50, 30);
      doc.fillColor("#ffffff").fontSize(12).font("Helvetica").text("TENANT COMPARATIVE METRICS REPORT", 50, 58);
      doc.fillColor("#aeb0c4").fontSize(9).text(`Generated: ${new Date().toLocaleDateString()}`, 380, 58);
      
      doc.strokeColor("#c99a3c").lineWidth(3).moveTo(50, 115).lineTo(545, 115).stroke();

      doc.fillColor("#14162b").fontSize(14).font("Helvetica-Bold").text("1. Revenue Comparison Chart", 50, 130);

      // Chart configuration for comparison
      const tenantNames = comparison.map(t => t.name);
      const tenantRevenues = comparison.map(t => t.revenue);

      const chartConfig = {
        type: "bar",
        data: {
          labels: tenantNames,
          datasets: [{
            label: "Revenue ($)",
            data: tenantRevenues,
            backgroundColor: ["#4f46e5", "#ec4899", "#06b6d4"],
            borderWidth: 1
          }]
        },
        options: {
          legend: { display: false },
          scales: {
            yAxes: [{ ticks: { beginAtZero: true } }]
          }
        }
      };

      try {
        const chartBuffer = await fetchChartImage(chartConfig);
        doc.image(chartBuffer, 50, 160, { width: 495 });
      } catch (err) {
        console.error("[PDF Comparison] QuickChart embedding failed:", err.message);
        doc.fillColor("#ef4444").fontSize(10).text("Chart failed to render.", 50, 180);
      }

      // Detailed Comparison Table
      doc.fillColor("#14162b").fontSize(14).font("Helvetica-Bold").text("2. Comparative Performance Metrics", 50, 480);
      
      let tableY = 510;
      doc.rect(50, tableY, 495, 25).fill("#14162b");
      doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
      doc.text("Organization Name", 60, tableY + 8);
      doc.text("Total Sales ($)", 250, tableY + 8);
      doc.text("Tickets Sold", 350, tableY + 8);
      doc.text("Refund Rate (%)", 440, tableY + 8);

      doc.font("Helvetica").fontSize(9).fillColor("#14162b");
      comparison.forEach((t) => {
        tableY += 25;
        doc.rect(50, tableY, 495, 25).fill(tableY % 50 === 0 ? "#fbfbfb" : "#ffffff");
        
        doc.text(t.name, 60, tableY + 8);
        doc.text(`$${t.revenue.toFixed(2)}`, 250, tableY + 8);
        doc.text(String(t.ticketsSold), 350, tableY + 8);
        doc.text(`${(t.refundRate || 0).toFixed(1)}%`, 440, tableY + 8);
      });

      doc.fontSize(8).fillColor("#aeb0c4").text("STAGEPASS PLATFORM ADMINISTRATIVE INTEL DIVISION", 50, 750, { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generatePlatformReport,
  generateComparisonReport,
};
