const mongoose = require("mongoose");

/**
 * TicketType is NOT a separate collection/model — it's embedded
 * directly inside Event. Why: ticket types (General/VIP) have no
 * meaning outside their parent event, they're always read/written
 * together with the event, and there's no seat-map complexity here
 * (flat price + quantity only, per the requirements). Embedding
 * keeps this simple and avoids an unnecessary extra collection.
 */
const ticketTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantityTotal: {
    type: Number,
    required: true,
    min: 0,
  },
  // How many of this ticket type have been booked so far.
  // quantityTotal - quantityBooked = tickets still available.
  // Defaults to 0 — starts empty, gets incremented during checkout
  // (Week 2, Day 4-5).
  quantityBooked: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const eventSessionSchema = new mongoose.Schema({
  dateTime: {
    type: Date,
    required: true,
  },
  selectedSeatMap: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
});

const eventSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    dateTime: {
      type: Date,
      required: true,
    },
    bannerImageUrl: {
      type: String,
      default: null,
    },
    ticketTypes: {
      type: [ticketTypeSchema],
      default: [],
    },
    // Existing events without this field are legacy ticket events. All new
    // events use the seat-map checkout path.
    purchaseMode: {
      type: String,
      enum: ["legacy-ticket", "seatmap"],
      default: "seatmap",
      index: true,
    },
    // Event-specific copy of a venue template. Seats hold the live inventory
    // status (available, organizer-held, checkout-held, sold).
    selectedSeatMap: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sessions: {
      type: [eventSessionSchema],
      default: [],
    },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Karachi",
    },
    accessCode: {
      type: String,
      default: null,
      trim: true,
    },
    privateCodeExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// COMPOUND index: every event list query filters by organizationId
// AND sorts by dateTime ascending (soonest event first) — see
// event.service.js listEvents(). Same reasoning as Venue's index:
// one compound index serves both the filter and the sort together.
eventSchema.index({ organizationId: 1, dateTime: 1 });

module.exports = mongoose.model("Event", eventSchema);
