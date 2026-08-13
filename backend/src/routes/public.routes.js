const express = require("express");
const publicController = require("../controllers/public.controller");
const { sendBookingConfirmation } = require("../config/email");

const router = express.Router();

// Public endpoints — no authentication required
router.get("/events", publicController.getAllPublicEvents);
router.get("/events/public/:eventId", publicController.getPublicEventById);
router.get("/bundles", publicController.getAllPublicBundles);
router.get("/organizations/public", publicController.getAllOrganizations);

// Route for testing the updated Booking Confirmation template layout locally
router.get("/test-booking-email", async (req, res) => {
  try {
    const targetEmail = req.query.email || "projectdemo0900@gmail.com";
    const mockBooking = {
      _id: "60d5ec4b8f1b2c001f8b4567",
      buyerName: "Muhammad Abubakar Javaid",
      buyerEmail: targetEmail,
      confirmationCode: "SP-TEST-9999",
      totalAmount: 1500,
      items: [
        { ticketTypeName: "Early Bird VIP", quantity: 2, lineTotal: 1000 },
        { ticketTypeName: "General Admission", quantity: 1, lineTotal: 500 }
      ]
    };
    const mockEvent = {
      name: "Mock Local Test Concert 🎸",
      dateTime: new Date(),
      timezone: "Asia/Karachi",
      venueId: {
        name: "StagePass Arena",
        address: "123 Main Boulevard, Gulberg III",
        city: "Lahore"
      }
    };
    
    await sendBookingConfirmation(mockBooking, mockEvent, "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=test", "mock-org");
    res.json({ message: `Successfully sent booking confirmation email to ${targetEmail}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

