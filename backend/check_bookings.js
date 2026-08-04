require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const Booking = require("./src/models/Booking");
const Organization = require("./src/models/Organization");
const Event = require("./src/models/Event");

const main = async () => {
  await connectDB();
  
  const org = await Organization.findOne({ name: /H&S studio/i });
  if (!org) {
    console.log("Org not found");
    process.exit(1);
  }
  
  console.log(`Found Org: ${org.name} (${org._id})`);
  
  const events = await Event.find({ organizationId: org._id }).lean();
  console.log(`Events count: ${events.length}`);
  events.forEach(e => {
    console.log(`  - Event: ${e.name} (${e._id})`);
  });

  const bookings = await Booking.find({ organizationId: org._id, status: "confirmed" }).lean();
  console.log(`Confirmed bookings count: ${bookings.length}`);
  
  let totalRevenue = 0;
  let totalTickets = 0;
  
  bookings.forEach((b, idx) => {
    const qty = b.items.reduce((sum, item) => sum + item.quantity, 0);
    totalRevenue += b.totalAmount;
    totalTickets += qty;
    console.log(`    Booking ${idx + 1}: ID ${b._id}, Total: $${b.totalAmount}, Tickets: ${qty}`);
  });
  
  console.log(`\nAggregated Stats:`);
  console.log(`  Revenue: $${totalRevenue}`);
  console.log(`  Tickets Sold: ${totalTickets}`);
  
  await mongoose.disconnect();
  process.exit(0);
};

main();
