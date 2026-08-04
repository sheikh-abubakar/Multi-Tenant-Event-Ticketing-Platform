require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const Booking = require("./src/models/Booking");
const Organization = require("./src/models/Organization");
const Event = require("./src/models/Event");

const main = async () => {
  await connectDB();
  
  const orgs = await Organization.find().lean();
  const stats = [];
  
  for (const org of orgs) {
    const eventsCount = await Event.countDocuments({ organizationId: org._id });
    const bookings = await Booking.find({ organizationId: org._id, status: "confirmed" }).lean();
    
    let revenue = 0;
    let ticketsSold = 0;
    
    bookings.forEach((b) => {
      revenue += b.totalAmount;
      const qty = b.items.reduce((sum, item) => sum + item.quantity, 0);
      ticketsSold += qty;
    });
    
    stats.push({
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      events: eventsCount,
      confirmedBookings: bookings.length,
      revenue,
      ticketsSold
    });
  }
  
  console.log("\n=== REAL DATABASE STATS FOR ALL ORGS ===");
  console.table(stats);
  
  await mongoose.disconnect();
  process.exit(0);
};

main();
