const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Venue = require("../models/Venue");
const User = require("../models/User");

/**
 * Helper to calculate straight-line distance in KM using the Haversine formula
 */
const getDistanceKM = (lat1, lon1, lat2, lon2) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return Infinity;
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return Infinity;

  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

/**
 * Helper to calculate actual road/driving distance using OSRM (Open Source Routing Machine)
 */
const getDrivingDistanceKM = async (lat1, lon1, lat2, lon2) => {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;

  try {
    // OSRM coordinates are in longitude,latitude order
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "StagePassEventPlatform/1.0 (projectdemo0900@gmail.com)"
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        // distance is returned in meters, convert to km
        return data.routes[0].distance / 1000;
      }
    }
  } catch (error) {
    console.error("OSRM driving distance lookup failed. Falling back to straight-line distance:", error.message);
  }

  // Fallback to straight-line distance if OSRM fails
  const fallbackDist = getDistanceKM(lat1, lon1, lat2, lon2);
  return fallbackDist === Infinity ? null : fallbackDist;
};

/**
 * Helper to calculate event starting price (for seatmap and flat ticket types)
 */
const getEventStartingPrice = (event) => {
  let minPrice = Infinity;
  
  if (event.purchaseMode === "seatmap") {
    if (event.selectedSeatMap && Array.isArray(event.selectedSeatMap.blocks)) {
      event.selectedSeatMap.blocks.forEach(block => {
        if (block.price !== undefined && block.price < minPrice) {
          minPrice = block.price;
        }
      });
    }
  } else {
    if (event.ticketTypes && Array.isArray(event.ticketTypes)) {
      event.ticketTypes.forEach(tt => {
        if (tt.price !== undefined && tt.price < minPrice) {
          minPrice = tt.price;
        }
      });
    }
  }
  
  return minPrice === Infinity ? 0 : minPrice;
};

/**
 * Helper to calculate remaining tickets
 */
const getRemainingTickets = (event) => {
  let remainingTickets = 0;
  if (event.purchaseMode === "seatmap") {
    if (event.selectedSeatMap && Array.isArray(event.selectedSeatMap.blocks) && event.selectedSeatMap.blocks.length > 0) {
      event.selectedSeatMap.blocks.forEach((block) => {
        block.seats?.forEach((seat) => {
          if (seat.status === "available") {
            remainingTickets++;
          }
        });
      });
    } else {
      // Fallback: If seatmap is not seeded/configured yet, default to venue capacity
      remainingTickets = event.venueId?.capacity || 0;
    }
  } else {
    remainingTickets = event.ticketTypes?.reduce(
      (sum, tt) => sum + (tt.quantityTotal - tt.quantityBooked),
      0
    ) || 0;
  }
  return remainingTickets;
};

/**
 * Helper to calculate booked tickets (popularity indicator)
 */
const getTicketsBooked = (event) => {
  let booked = 0;
  if (event.purchaseMode === "seatmap") {
    if (event.selectedSeatMap && event.selectedSeatMap.blocks) {
      event.selectedSeatMap.blocks.forEach((block) => {
        block.seats?.forEach((seat) => {
          if (seat.status === "sold" || seat.status === "checkout-held") {
            booked++;
          }
        });
      });
    }
  } else {
    booked = event.ticketTypes?.reduce(
      (sum, tt) => sum + tt.quantityBooked,
      0
    ) || 0;
  }
  return booked;
};

/**
 * Unified multi-factor event recommendation controller that sections responses using optimized driving distances.
 */
const getRecommendations = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    // 1. Fetch user doc & booking profile
    const userDoc = await User.findById(userId).lean();
    console.log("DEBUG recommendations call:", {
      email: userDoc?.email,
      city: userDoc?.city,
      address: userDoc?.address,
      latitude: userDoc?.latitude,
      longitude: userDoc?.longitude
    });

    const confirmedBookings = await Booking.find({ userId, status: "confirmed" })
      .populate("eventId")
      .lean();

    const hasHistory = confirmedBookings.length > 0;
    const hasLocationCoords = userDoc && (userDoc.latitude !== null && userDoc.longitude !== null);

    // Compile user preferences
    const venueCounts = {};
    const venueSpend = {};
    let totalSpend = 0;
    let totalBookings = 0;

    // Track events the user has already booked to exclude them
    const userBookedEventIds = new Set();

    confirmedBookings.forEach((booking) => {
      if (booking.eventId) {
        userBookedEventIds.add(booking.eventId._id.toString());
        if (booking.eventId.venueId) {
          const venueIdStr = booking.eventId.venueId.toString();
          venueCounts[venueIdStr] = (venueCounts[venueIdStr] || 0) + 1;
          venueSpend[venueIdStr] = (venueSpend[venueIdStr] || 0) + booking.totalAmount;
        }
      }
      totalSpend += booking.totalAmount;
      totalBookings += 1;
    });

    const averagePrice = totalBookings > 0 ? totalSpend / totalBookings : 0;

    // Compile category interests scores
    const categoryScores = {};
    const favoriteCategoryIds = new Set();
    if (userDoc && userDoc.categoryInterests) {
      userDoc.categoryInterests.forEach(item => {
        if (item.categoryId) {
          const score = item.score || 0;
          categoryScores[item.categoryId.toString()] = score;
          if (score >= 5) {
            favoriteCategoryIds.add(item.categoryId.toString());
          }
        }
      });
    }

    // 2. Fetch all upcoming public events
    const allUpcomingEvents = await Event.find({
      $or: [
        { dateTime: { $gte: now } },
        { "sessions.dateTime": { $gte: now } }
      ]
    })
      .populate("venueId")
      .populate({
        path: "organizationId",
        match: { isDeleted: { $ne: true } },
        select: "name slug",
      })
      .lean();

    // Filter out events whose organization was soft-deleted
    const validEvents = allUpcomingEvents.filter((event) => event.organizationId !== null);

    // Arrays for sections
    const affinityEvents = [];  // Venue-affinity picks (user's past venues) - shown first
    const interestEvents = [];  // Category-affinity picks (user's favorite categories) - shown second
    const nearbyEvents = [];
    const localEvents = [];
    const globalEvents = [];

    // Helper set to avoid duplication across sections
    const addedEventIds = new Set();

    // 3. Process, score and section each event (run in parallel)
    const processedEvents = await Promise.all(validEvents.map(async (event) => {
      const venueIdStr = event.venueId?._id?.toString() || event.venueId?.toString();
      const startingPrice = getEventStartingPrice(event);
      const remainingTickets = getRemainingTickets(event);
      const ticketsBooked = getTicketsBooked(event);

      // Rule: Exclude already booked events
      if (userBookedEventIds.has(event._id.toString())) {
        return null;
      }

      // Rule: Exclude sold-out events
      if (remainingTickets <= 0) {
        return null;
      }

      // --- Multi-Factor Scoring Engine ---
      let venueCountScore = 0;
      let venueSpendScore = 0;
      let priceMatchScore = 0;
      let popularityScore = 0;

      // A. Venue Affinity (15 points per past booking at this venue)
      if (hasHistory && venueIdStr) {
        venueCountScore = (venueCounts[venueIdStr] || 0) * 15;
        venueSpendScore = (venueSpend[venueIdStr] || 0) * 0.05;

        // B. Price Match (Up to 30 points if event price matches user's avg spend power)
        const priceDiff = Math.abs(startingPrice - averagePrice);
        priceMatchScore = Math.max(0, 30 - priceDiff * 0.5);
      }

      // C. Event Popularity (2 points per booked ticket/seat, max 50 points)
      popularityScore = Math.min(50, ticketsBooked * 2);

      // D. Category Affinity Score (Capped at 25 bonus points)
      let categoryAffinityScore = 0;
      if (event.categories && event.categories.length > 0) {
        event.categories.forEach(catId => {
          const catIdStr = catId.toString();
          if (categoryScores[catIdStr]) {
            categoryAffinityScore += categoryScores[catIdStr] * 5;
          }
        });
        categoryAffinityScore = Math.min(25, categoryAffinityScore);
      }

      const totalScore = venueCountScore + venueSpendScore + priceMatchScore + popularityScore + categoryAffinityScore;

      // Calculate Driving/Road Distance (Optimized to skip OSRM calls for far-away locations)
      let distanceKM = null;
      if (userDoc && event.venueId) {
        const venueLat = event.venueId.latitude;
        const venueLng = event.venueId.longitude;

        if (userDoc.latitude !== null && userDoc.longitude !== null && venueLat !== null && venueLng !== null) {
          // Calculate straight-line distance first (takes 0ms)
          const straightLineDist = getDistanceKM(userDoc.latitude, userDoc.longitude, venueLat, venueLng);
          
          if (straightLineDist <= 15) {
            // ONLY query OSRM driving route API for close proximity candidates
            distanceKM = await getDrivingDistanceKM(userDoc.latitude, userDoc.longitude, venueLat, venueLng);
          } else {
            // Far venues skip OSRM entirely (saving network calls)
            distanceKM = straightLineDist;
          }
        }
      }

      // Select correct date (first upcoming session if multiple exist)
      let displayDateTime = event.dateTime;
      if (event.sessions && event.sessions.length > 0) {
        const upcoming = event.sessions.filter(s => new Date(s.dateTime) >= now)
                                       .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
        if (upcoming.length > 0) {
          displayDateTime = upcoming[0].dateTime;
        }
      }

      return {
        _id: event._id,
        name: event.name,
        description: event.description,
        dateTime: displayDateTime,
        bannerImageUrl: event.bannerImageUrl,
        purchaseMode: event.purchaseMode,
        ticketTypes: event.ticketTypes,
        venueId: event.venueId,
        categories: event.categories,
        organizationId: event.organizationId,
        organizationSlug: event.organizationId?.slug,
        startingPrice,
        remainingTickets,
        ticketsBooked,
        score: totalScore,
        distanceKM: distanceKM !== null ? Math.round(distanceKM * 10) / 10 : null,
      };
    }));

    // Filter out null events (already booked or sold out)
    const filteredEvents = processedEvents.filter(e => e !== null);

    // 3b. Populate Affinity Section FIRST (events at venues the user has previously booked)
    // This section has priority — its IDs are added to addedEventIds so they won't duplicate below.
    if (hasHistory) {
      filteredEvents.forEach((event) => {
        const venueIdStr = event.venueId?._id?.toString() || event.venueId?.toString();
        // Check if user has ever booked at this venue
        if (venueIdStr && venueCounts[venueIdStr] > 0) {
          affinityEvents.push(event);
          addedEventIds.add(event._id.toString());
        }
      });
      // Sort by score descending (most-visited venue's events first)
      affinityEvents.sort((a, b) => b.score - a.score);
    }

    // 3c. Populate Interest Section SECOND (events matching user's favorite categories score >= 5)
    // This section is based on personal category interests and overrides popularity filter constraints.
    filteredEvents.forEach((event) => {
      if (!addedEventIds.has(event._id.toString()) && event.categories && event.categories.length > 0) {
        const matchesFavorite = event.categories.some(catId => favoriteCategoryIds.has(catId.toString()));
        if (matchesFavorite) {
          interestEvents.push(event);
          addedEventIds.add(event._id.toString());
        }
      }
    });
    // Sort interest events by score descending (most relevant first)
    interestEvents.sort((a, b) => b.score - a.score);

    // 4. Populate Proximity Section (Strictly within 15 km driving distance, not already in affinity)
    filteredEvents.forEach((event) => {
      if (!addedEventIds.has(event._id.toString()) && event.distanceKM !== null && event.distanceKM <= 15) {
        nearbyEvents.push(event);
        addedEventIds.add(event._id.toString());
      }
    });
    // Sort nearby events by distance ascending (closest driving route first)
    nearbyEvents.sort((a, b) => a.distanceKM - b.distanceKM);

    // 5. Populate Local City Section (Same City, excluding duplicates)
    // Rule: Strict Popularity Cutoff - Must have at least 1 ticket booking to show up.
    if (userDoc && userDoc.city) {
      const userCityLower = userDoc.city.toLowerCase().trim();
      filteredEvents.forEach((event) => {
        const eventCityLower = event.venueId?.city?.toLowerCase()?.trim() || "";
        if (eventCityLower === userCityLower && !addedEventIds.has(event._id.toString())) {
          if (event.ticketsBooked >= 1) {
            localEvents.push(event);
            addedEventIds.add(event._id.toString());
          }
        }
      });
      // Sort local events by tickets booked (popularity) descending
      localEvents.sort((a, b) => b.ticketsBooked - a.ticketsBooked);
    }

    // 6. Populate Global Section (Other cities)
    // Rule: Strict Popularity Cutoff - Must have at least 3 ticket bookings to qualify.
    filteredEvents.forEach((event) => {
      if (!addedEventIds.has(event._id.toString())) {
        if (event.ticketsBooked >= 3) {
          globalEvents.push(event);
          addedEventIds.add(event._id.toString());
        }
      }
    });
    // Sort global events by tickets booked descending
    globalEvents.sort((a, b) => b.ticketsBooked - a.ticketsBooked);

    // Compile list of top favorite venues to pass to frontend header
    const favoriteVenues = Object.keys(venueCounts).map((key) => ({
      _id: key,
      count: venueCounts[key],
    })).sort((a, b) => b.count - a.count);

    return res.json({
      type: (hasHistory || hasLocationCoords) ? "personalized" : "fallback",
      favoriteVenues: hasHistory ? favoriteVenues : undefined,
      userCity: userDoc ? userDoc.city : null,
      affinityEvents,
      interestEvents,
      nearbyEvents,
      localEvents,
      globalEvents
    });
  } catch (error) {
    console.error("Failed to fetch recommendations:", error);
    return res.status(500).json({ message: "Failed to get recommendations" });
  }
};

module.exports = {
  getRecommendations,
};
