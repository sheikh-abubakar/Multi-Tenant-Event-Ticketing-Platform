const groq = require("../config/groq");
const Event = require("../models/Event");
const Venue = require("../models/Venue");
const Organization = require("../models/Organization");
const Booking = require("../models/Booking");
const AIChatSession = require("../models/AIChatSession");
const pdfReportService = require("../services/pdfReport.service");
const platformAdminService = require("../services/platformAdmin.service");
const User = require("../models/User");

/**
 * Builds the system prompt based on user state
 */
function getSystemPrompt(req) {
  const userName = req.user ? req.user.name : null;
  const isSuperAdmin = req.user && req.user.platformRole === "super_admin";
  
  let roleInstructions = "";
  if (isSuperAdmin) {
    roleInstructions = `
      You are the Super Admin Command Center Assistant. You have full system-level administrative authorization.
      You MUST ALWAYS execute the database tools ('getOrganizations', 'getOrganizationTeam', 'getUpcomingEvents', 'getVenues', 'getPlatformMetrics', 'getOrganizationAnalytics', 'getTicketValidationStats', 'getReferralStats', 'getPlatformUsers') to retrieve live database facts before answering any questions about organizations, owners, teams, venues, events, users, check-ins, or referral statistics.
      CRITICAL: Never guess, make up, or hallucinate names, owners, venues, capacities, validation percentages, check-in ratios, referral earnings, or statistics. If you don't know the owners, check-in validation rates, referral discounts, user counts, capacities, or events of an organization, you MUST call the corresponding tool first. Do NOT make up any details — you must read them strictly from the tool responses. Do NOT ask the user for permission to use tools — execute them automatically!
      Address the administrator professionally as "Hey ${userName}!" and help them audit the tenant ecosystem.
    `;
  } else if (userName) {
    roleInstructions = `
      The user is logged in. Their name is ${userName}. Greet them politely by name (e.g. "Hey ${userName}!").
      You help them find upcoming events, check ticket policies, account creation steps, or request refunds.
    `;
  } else {
    roleInstructions = `
      The user is a Guest/Visitor. Greet them welcomingly.
      Guide them with account creation, event listings, checkout help, and refund information.
    `;
  }

  return `
    You are the StagePass AI Copilot, a premium, friendly, and expert administrative assistant for the StagePass Event Ticketing Platform.
    
    ${roleInstructions}
    
    You understand and respond in English, Urdu, Roman Urdu, or Hindi naturally, depending on the language the user speaks.
    Keep your responses clear, structured, and polite. Use markdown tables, bold values, and bullets where helpful.
    If you output a report, guide them on how they can download the PDF format.

    STRICT SCOPE GUARDRAILS (CRITICAL):
    - You MUST ONLY answer queries related to the StagePass Event Ticketing Platform (events, ticket purchasing, account setup, logins, password reset, refunds, organizations, statistics, venues, or commands within the admin workspace).
    - Under NO circumstances are you allowed to answer general knowledge questions, math problems (e.g. 2+2), programming questions, history, science, pop culture, recipes, or other general topics unrelated to StagePass.
    - If a user asks about anything outside of StagePass (e.g. "Who is Einstein?", "2+2", "capital of France", or requests code/explanations on general topics), you MUST politely refuse to answer. You should reply: "I'm sorry, I am authorized only to assist with StagePass Platform commands and support. I cannot answer queries outside the scope of the platform." or a similar polite denial in the user's language (Urdu/Hindi).

    Follow these support guidelines:
    1. **Account Creation:** Click the "Sign Up" button in the top navigation bar.
    2. **Forgot Password:** Go to the Login page and click "Forgot Password" to receive an OTP reset code.
    3. **Ticket Purchase:** Buy tickets directly on the event page. Support guest or logged-in checkouts.
    4. **Refunds:** Request refunds from the User Dashboard. Refund options (wallet or card) depend on the event organizer's policy.
    5. **Database Audits:** You must ALWAYS execute the database tools ('getOrganizations', 'getOrganizationTeam', 'getOrganizationAnalytics', etc.) first to retrieve real facts before answering any queries about organizations, owners, teams, venues, events, or statistics. Never guess or hallucinate names, metrics, or relationships. You MUST NEVER trust your own text history for database facts if a query is made. You must ALWAYS execute the database tools and use ONLY the JSON data returned by the tool in the current or most recent execution. If your text history disagrees with the tool results, you must discard the text history and report ONLY the tool results.
    6. **No URL Hallucinations (CRITICAL):** Never make up, guess, or write down fake URLs for reports or downloads. You must ALWAYS invoke the 'generatePlatformReport' tool to get the real S3/CloudFront URL. If you have not called the tool, call it first before giving the user a download link.
    7. **Organization Counts (CRITICAL):** When reporting the number of organizations, you MUST ALWAYS read the 'totalOrganizations', 'activeOrganizations', and 'suspendedOrganizations' fields returned directly by the 'getOrganizations' tool. NEVER manually count the 'organizations' array yourself — that will give wrong answers. When asked how many orgs exist, say "There are X total organizations: Y active and Z suspended." Always mention suspended orgs even if Z is 0.
    8. **Ticket Entry & Validations:** When asked about validation rates, door checks, or how many tickets are verified, call the 'getTicketValidationStats' tool. Show the total confirmed bookings, checked-in count, pending count, and percentage rate in a formatted grid table.
    9. **Referral Marketing Rewards:** When asked about referral analytics, discounts earned, or codes shared, call the 'getReferralStats' tool. Present a summary of total generated rewards, claimed rewards, discount volume, and display the Top Referrers Leaderboard in a clean markdown table.
  `.trim();
}

/**
 * Declares the function calling tool definitions based on user authorization
 */
function getAvailableTools(req) {
  const tools = [
    {
      type: "function",
      function: {
        name: "getUpcomingEvents",
        description: "Fetch a list of all upcoming events, dates, ticket pricing, and venues. Can be optionally filtered by organization name or slug.",
        parameters: {
          type: "object",
          properties: {
            organizationName: {
              type: "string",
              description: "Optional name or slug of organization to filter events by (e.g. 'H&S Org' or 'hs-org').",
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getVenues",
        description: "Fetch a list of all venues, optionally filtered by organization name or slug.",
        parameters: {
          type: "object",
          properties: {
            organizationName: {
              type: "string",
              description: "Optional name or slug of organization to filter venues by (e.g. 'H&S' or 'punjabians').",
            },
          },
        },
      },
    },
  ];

  // Add Super Admin tools
  if (req.user && req.user.platformRole === "super_admin") {
    tools.push({
      type: "function",
      function: {
        name: "getPlatformMetrics",
        description: "Get global statistics including total gross revenue, bookings volume, active tenants, and top performing organizations.",
        parameters: { type: "object", properties: {} },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "compareOrganizationsAndEvents",
        description: "Fetch comparative analytics between multiple organizations. Compares sales volume, revenue, and active event listings.",
        parameters: {
          type: "object",
          properties: {
            organizationNames: {
              type: "array",
              items: { type: "string" },
              description: "Array of organization names or slugs to contrast",
            },
          },
          required: ["organizationNames"],
        },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "generatePlatformReport",
        description: "Generate a visual PDF report of current platform metrics or comparison stats, upload it to S3, and return the download URL.",
        parameters: {
          type: "object",
          properties: {
            reportType: {
              type: "string",
              enum: ["global", "comparison"],
              description: "Type of PDF to generate: either global overview or comparative metrics",
            },
            organizationNames: {
              type: "array",
              items: { type: "string" },
              description: "Required if reportType is 'comparison'. Names of organizations to include.",
            },
          },
          required: ["reportType"],
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "getOrganizationTeam",
        description: "Fetch a list of all members (owners, admins, staff) of a specific organization, along with their names, emails, and roles.",
        parameters: {
          type: "object",
          properties: {
            organizationName: {
              type: "string",
              description: "Name or slug of the organization to retrieve the team for.",
            },
          },
          required: ["organizationName"],
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "setOrganizationSuspension",
        description: "Suspend or reactivate an organization. CRITICAL: You must ask the user for confirmation in the chat first. Do not call this tool unless confirmedByUser is true.",
        parameters: {
          type: "object",
          properties: {
            organizationName: {
              type: "string",
              description: "Name or slug of the organization to suspend/reactivate",
            },
            suspended: {
              type: "boolean",
              description: "True to suspend, false to reactivate",
            },
            reason: {
              type: "string",
              description: "Required reason for suspension or reactivation",
            },
            confirmedByUser: {
              type: "boolean",
              description: "Set to true only if the user has explicitly confirmed 'Yes' in the conversation history.",
            },
          },
          required: ["organizationName", "suspended", "reason", "confirmedByUser"],
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "getOrganizations",
        description: "Fetch a list of all organizations on the platform, including their names, slugs, suspension status, and owner details (name and email). Useful to audit owners or resolve which organizations belong to a specific user.",
        parameters: { type: "object", properties: {} },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "getOrganizationAnalytics",
        description: "Fetch comprehensive analytics overview for a specific organization, including total bookings, ticket sales revenue, refund fee share (10%), net revenue, tickets sold, events count, venues count, refunds count, and refunded dollar amount.",
        parameters: {
          type: "object",
          properties: {
            organizationName: {
              type: "string",
              description: "Name or slug of the organization to retrieve analytics for.",
            },
          },
          required: ["organizationName"],
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "getTicketValidationStats",
        description: "Fetch real-time ticket scanning, entry validation, and check-in stats for a specific organization or all events on the platform. Includes verified (checked-in) counts, unverified counts, and overall verification rates. Use this when the admin asks about entry stats, door checks, check-in validation, or verified tickets.",
        parameters: {
          type: "object",
          properties: {
            organizationName: {
              type: "string",
              description: "Optional. Filter by organization name or slug to get tenant-level entry stats.",
            },
          },
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "getReferralStats",
        description: "Fetch referral marketing and discount rewards program analytics. Returns total referral links generated, successful referred bookings, total discount amount claimed by buyers, and active referrer leaderboards. Use this when the admin asks about referrals, share and earn program, sharing codes, or marketing discounts.",
        parameters: { type: "object", properties: {} },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "getPlatformUsers",
        description: "Fetch the total number of registered users on the StagePass platform, broken down by role (buyer, organizer/owner, staff) and recent signups in the last 30 days. Use this whenever the admin asks about user count, total users, how many users, platform users, registered users, or user statistics.",
        parameters: { type: "object", properties: {} },
      },
    });
  }

  return tools;
}

/**
 * Gathers global stats metrics from MongoDB
 */
async function gatherGlobalMetrics() {
  const activeOrgs = await Organization.countDocuments({ isDeleted: { $ne: true } });
  const activeEvents = await Event.countDocuments({ dateTime: { $gte: new Date() } });
  
  // Aggregate bookings stats
  const bookingAgg = await Booking.aggregate([
    { $match: { status: "confirmed" } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        totalBookings: { $sum: 1 },
        totalTickets: { $sum: { $sum: "$items.quantity" } },
      },
    },
  ]);

  const grossRevenue = bookingAgg[0]?.totalRevenue || 0;
  const totalBookings = bookingAgg[0]?.totalBookings || 0;
  const totalTickets = bookingAgg[0]?.totalTickets || 0;

  // Fetch top organizations by revenue — single aggregation (no N+1 loop)
  const topPerformers = await Booking.aggregate([
    { $match: { status: "confirmed" } },
    { $group: { _id: "$organizationId", revenue: { $sum: "$totalAmount" }, ticketsSold: { $sum: { $sum: "$items.quantity" } } } },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "organizations",
        localField: "_id",
        foreignField: "_id",
        as: "org",
      },
    },
    { $unwind: "$org" },
    { $match: { "org.isDeleted": { $ne: true } } },
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "organizationId",
        as: "events",
      },
    },
    {
      $project: {
        _id: 0,
        id: "$_id",
        name: "$org.name",
        eventsCount: { $size: "$events" },
        revenue: 1,
        ticketsSold: 1,
      },
    },
  ]);

  return {
    grossRevenue,
    totalBookings,
    activeOrgs,
    activeEvents,
    topPerformers,
  };
}

/**
 * Gathers comparison metrics for specific organizations
 */
async function gatherComparisonMetrics(names) {
  const comparison = [];
  for (const name of names) {
    const org = await Organization.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, "i") } },
        { slug: { $regex: new RegExp(`^${name}$`, "i") } },
      ],
    });

    if (!org) continue;

    const ticketsCount = await Booking.aggregate([
      { $match: { organizationId: org._id, status: "confirmed" } },
      { $group: { _id: null, total: { $sum: { $sum: "$items.quantity" } } } }
    ]);

    const revenue = await Booking.aggregate([
      { $match: { organizationId: org._id, status: "confirmed" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);

    const totalBookings = await Booking.countDocuments({ organizationId: org._id, status: "confirmed" });
    const refundedBookings = await Booking.countDocuments({ organizationId: org._id, status: "refunded" });
    const refundRate = totalBookings > 0 ? (refundedBookings / (totalBookings + refundedBookings)) * 100 : 0;

    comparison.push({
      name: org.name,
      revenue: revenue[0]?.total || 0,
      ticketsSold: ticketsCount[0]?.total || 0,
      refundRate,
    });
  }
  return comparison;
}

/**
 * Executes a tool function call
 */
async function executeTool(name, args, req) {
  try {
    // 🛡️ Strict Backend-Level Security Check
    const superAdminTools = [
      "getPlatformMetrics",
      "compareOrganizationsAndEvents",
      "generatePlatformReport",
      "getOrganizationTeam",
      "setOrganizationSuspension",
      "getOrganizations",
      "getOrganizationAnalytics",
      "getPlatformUsers",
      "getTicketValidationStats",
      "getReferralStats"
    ];

    if (superAdminTools.includes(name)) {
      if (!req || !req.user || req.user.platformRole !== "super_admin") {
        return {
          success: false,
          error: "Access Denied: You do not have the required Platform Super Admin authorization to execute this tool."
        };
      }
    }

    if (name === "getUpcomingEvents") {
      const { organizationName } = args;
      const now = new Date();
      let query = { dateTime: { $gte: now } };

      if (organizationName) {
        const cleanQuery = organizationName.trim().replace(/\b(org|organization|studio|events|club|group)\b/gi, "").trim();
        let org = await Organization.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } },
            { slug: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } }
          ]
        });

        if (!org && cleanQuery.length >= 2) {
          org = await Organization.findOne({
            $or: [
              { name: { $regex: new RegExp(cleanQuery, "i") } },
              { slug: { $regex: new RegExp(cleanQuery, "i") } }
            ]
          });
        }

        if (org) {
          query.organizationId = org._id;
        } else {
          return {
            success: true,
            events: [],
            message: `No events found. Organization "${organizationName}" does not exist in the database.`
          };
        }
      }

      const events = await Event.find(query)
        .select("name dateTime ticketTypes purchaseMode venueId organizationId timezone")
        .populate("venueId", "name city")
        .limit(6)
        .lean();

      // Resolve organization names for clarity
      const resolvedEvents = [];
      for (const e of events) {
        const orgObj = await Organization.findById(e.organizationId).select("name").lean();
        resolvedEvents.push({
          id: e._id.toString(),
          name: e.name,
          dateTime: e.dateTime,
          organizationName: orgObj ? orgObj.name : "Unknown Org",
          venueName: e.venueId ? e.venueId.name : "Online / Unknown",
          city: e.venueId ? e.venueId.city : "",
          ticketTypes: (e.ticketTypes || []).map((t) => ({
            name: t.name,
            price: t.price,
            available: Number(t.quantityTotal) - Number(t.quantityBooked || 0),
          })),
        });
      }

      return { success: true, events: resolvedEvents };
    }

    if (name === "getVenues") {
      const { organizationName } = args;
      let query = {};

      if (organizationName) {
        const cleanQuery = organizationName.trim().replace(/\b(org|organization|studio|events|club|group)\b/gi, "").trim();
        let org = await Organization.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } },
            { slug: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } }
          ]
        });

        if (!org && cleanQuery.length >= 2) {
          org = await Organization.findOne({
            $or: [
              { name: { $regex: new RegExp(cleanQuery, "i") } },
              { slug: { $regex: new RegExp(cleanQuery, "i") } }
            ]
          });
        }

        if (org) {
          query.organizationId = org._id;
        } else {
          return {
            success: true,
            venues: [],
            message: `No venues found. Organization "${organizationName}" does not exist in the database.`
          };
        }
      }

      const venues = await Venue.find(query).select("name address city country capacity").lean();
      return { success: true, venues };
    }

    if (name === "getPlatformMetrics") {
      const metrics = await gatherGlobalMetrics();
      return { success: true, metrics };
    }

    if (name === "getPlatformUsers") {
      const User = require("../models/User");
      const OrganizationMember = require("../models/OrganizationMember");

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [totalUsers, newSignups, orgMembersCount] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        OrganizationMember.distinct("userId"),
      ]);

      const organizers = orgMembersCount.length;
      const buyers = totalUsers - organizers;

      return {
        success: true,
        users: {
          totalUsers,
          organizers,
          buyers,
          newSignupsLast30Days: newSignups,
        },
      };
    }

    if (name === "getTicketValidationStats") {
      const { organizationName } = args;
      let matchQuery = { status: "confirmed" };

      if (organizationName) {
        const cleanQuery = organizationName.trim().replace(/\b(org|organization|studio|events|club|group)\b/gi, "").trim();
        let org = await Organization.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } },
            { slug: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } }
          ]
        });

        if (!org && cleanQuery.length >= 2) {
          org = await Organization.findOne({
            $or: [
              { name: { $regex: new RegExp(cleanQuery, "i") } },
              { slug: { $regex: new RegExp(cleanQuery, "i") } }
            ]
          });
        }

        if (org) {
          matchQuery.organizationId = org._id;
        } else {
          return { success: false, error: `Organization "${organizationName}" not found.` };
        }
      }

      // Aggregate ticket counts
      const stats = await Booking.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalConfirmedBookings: { $sum: 1 },
            totalTicketsSold: { $sum: { $sum: "$items.quantity" } },
            verifiedBookingsCount: { $sum: { $cond: [{ $eq: ["$verified", true] }, 1, 0] } },
          }
        }
      ]);

      const data = stats[0] || { totalConfirmedBookings: 0, totalTicketsSold: 0, verifiedBookingsCount: 0 };
      const unverifiedBookingsCount = data.totalConfirmedBookings - data.verifiedBookingsCount;
      const checkInRate = data.totalConfirmedBookings > 0 ? Math.round((data.verifiedBookingsCount / data.totalConfirmedBookings) * 100) : 0;

      return {
        success: true,
        organizationFiltered: organizationName || "All Platform",
        totalConfirmedBookings: data.totalConfirmedBookings,
        totalTicketsSold: data.totalTicketsSold,
        checkedInBookings: data.verifiedBookingsCount,
        pendingCheckInBookings: unverifiedBookingsCount,
        checkInRatePercent: checkInRate
      };
    }

    if (name === "getReferralStats") {
      const ReferralReward = require("../models/ReferralReward");
      const User = require("../models/User");

      // General counts
      const [totalRewards, usedRewards, availableRewards] = await Promise.all([
        ReferralReward.countDocuments(),
        ReferralReward.countDocuments({ status: "used" }),
        ReferralReward.countDocuments({ status: "available" })
      ]);

      // Total referral discount value applied to bookings
      const discountSum = await Booking.aggregate([
        { $match: { status: "confirmed", discountAmount: { $gt: 0 } } },
        { $group: { _id: null, totalSaved: { $sum: "$discountAmount" } } }
      ]);

      // Top referrer leaderboard
      const leaderboard = await ReferralReward.aggregate([
        { $group: { _id: "$referrerUserId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user"
          }
        },
        { $unwind: "$user" },
        {
          $project: {
            _id: 0,
            referrerName: "$user.name",
            referrerEmail: "$user.email",
            rewardsEarned: "$count"
          }
        }
      ]);

      return {
        success: true,
        summary: {
          totalReferralsGenerated: totalRewards,
          discountsClaimed: usedRewards,
          discountsAvailable: availableRewards,
          totalDiscountVolumeUSD: discountSum[0]?.totalSaved || 0
        },
        leaderboard
      };
    }

    if (name === "compareOrganizationsAndEvents") {
      const orgNames = args.organizationNames || [];
      const comparison = await gatherComparisonMetrics(orgNames);
      return { success: true, comparison };
    }

    if (name === "generatePlatformReport") {
      const { reportType, organizationNames } = args;
      if (reportType === "global") {
        const metrics = await gatherGlobalMetrics();
        const url = await pdfReportService.generatePlatformReport(metrics);
        return { success: true, reportType, url };
      }
      if (reportType === "comparison") {
        const orgNames = organizationNames || [];
        const comparison = await gatherComparisonMetrics(orgNames);
        const url = await pdfReportService.generateComparisonReport(comparison);
        return { success: true, reportType, url };
      }
    }

    if (name === "getOrganizationTeam") {
      const { organizationName } = args;
      const cleanQuery = organizationName.trim().replace(/\b(org|organization|studio|events|club|group)\b/gi, "").trim();
      let org = await Organization.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } },
          { slug: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } }
        ]
      });

      if (!org && cleanQuery.length >= 2) {
        org = await Organization.findOne({
          $or: [
            { name: { $regex: new RegExp(cleanQuery, "i") } },
            { slug: { $regex: new RegExp(cleanQuery, "i") } }
          ]
        });
      }

      if (!org) {
        return { success: false, error: `Organization "${organizationName}" not found.` };
      }

      const OrganizationMember = require("../models/OrganizationMember");
      const members = await OrganizationMember.find({ organizationId: org._id })
        .populate("userId", "name email")
        .lean();

      return {
        success: true,
        organizationName: org.name,
        members: members.map((m) => ({
          name: m.userId ? m.userId.name : "Unknown Name",
          email: m.userId ? m.userId.email : "Unknown Email",
          role: m.role,
          permissions: m.permissions,
        })),
      };
    }

    if (name === "setOrganizationSuspension") {
      const { organizationName, suspended, reason, confirmedByUser } = args;

      if (!confirmedByUser) {
        return {
          success: false,
          error: "Permission denied. You must explicitly ask the user to confirm 'Yes' in the chat before executing this tool."
        };
      }

      const cleanQuery = organizationName.trim().replace(/\b(org|organization|studio|events|club|group)\b/gi, "").trim();
      let org = await Organization.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } },
          { slug: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } }
        ]
      });

      if (!org && cleanQuery.length >= 2) {
        org = await Organization.findOne({
          $or: [
            { name: { $regex: new RegExp(cleanQuery, "i") } },
            { slug: { $regex: new RegExp(cleanQuery, "i") } }
          ]
        });
      }

      if (!org) {
        return { success: false, error: `Organization "${organizationName}" not found.` };
      }

      // Update organization status and log platform audit
      const updatedOrg = await platformAdminService.setOrganizationStatus({
        organizationId: org._id.toString(),
        suspended: Boolean(suspended),
        reason: reason || (suspended ? "Suspended by Super Admin Copilot Command" : "Reactivated by Super Admin Copilot Command"),
        actorUserId: req.user._id.toString(),
      });

      return {
        success: true,
        organizationName: updatedOrg.name,
        isSuspended: updatedOrg.isSuspended,
        suspendedAt: updatedOrg.suspendedAt,
        suspensionReason: updatedOrg.suspensionReason,
        message: `Organization "${updatedOrg.name}" has been successfully ${updatedOrg.isSuspended ? "suspended" : "reactivated"}.`
      };
    }

    if (name === "getOrganizations") {
      const orgs = await Organization.find({ isDeleted: { $ne: true } }).lean();
      const resolvedOrgs = [];
      const OrganizationMember = require("../models/OrganizationMember");

      for (const org of orgs) {
        const ownerMember = await OrganizationMember.findOne({ organizationId: org._id, role: "owner" })
          .populate("userId", "name email")
          .lean();

        resolvedOrgs.push({
          id: org._id.toString(),
          name: org.name,
          slug: org.slug,
          isSuspended: org.isSuspended || false,
          suspensionReason: org.suspensionReason || null,
          owner: ownerMember && ownerMember.userId ? {
            name: ownerMember.userId.name,
            email: ownerMember.userId.email
          } : null
        });
      }

      const totalOrganizations = resolvedOrgs.length;
      const suspendedOrganizations = resolvedOrgs.filter((o) => o.isSuspended).length;
      const activeOrganizations = totalOrganizations - suspendedOrganizations;

      return {
        success: true,
        // ⚠️ ALWAYS report these precomputed counts — do NOT manually count the list below.
        totalOrganizations,
        activeOrganizations,
        suspendedOrganizations,
        organizations: resolvedOrgs
      };
    }

    if (name === "getOrganizationAnalytics") {
      const { organizationName } = args;
      const cleanQuery = organizationName.trim().replace(/\b(org|organization|studio|events|club|group)\b/gi, "").trim();
      let org = await Organization.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } },
          { slug: { $regex: new RegExp(`^${organizationName.trim()}$`, "i") } }
        ]
      });

      if (!org && cleanQuery.length >= 2) {
        org = await Organization.findOne({
          $or: [
            { name: { $regex: new RegExp(cleanQuery, "i") } },
            { slug: { $regex: new RegExp(cleanQuery, "i") } }
          ]
        });
      }

      if (!org) {
        return { success: false, error: `Organization "${organizationName}" not found.` };
      }

      const analyticsService = require("../services/analytics.service");
      const data = await analyticsService.getOwnerAnalytics(org._id);

      return {
        success: true,
        organizationName: org.name,
        metrics: data.metrics,
        recentBookings: data.recentBookings,
        revenueByDay: data.revenueByDay
      };
    }

    return { success: false, error: "Tool not found" };
  } catch (err) {
    console.error(`[Groq Tool] Execution of ${name} failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Post a chat message with tool execution capability and model failover
 */
const chat = async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ message: "messages array is required" });
    }

    const primaryModel = process.env.GROQ_PRIMARY_MODEL || "llama-3.3-70b-versatile";
    const fallbackModel = process.env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";
    const fallbackModel2 = process.env.GROQ_FALLBACK_MODEL_2 || "gemma2-9b-it";

    let currentMessages = [
      { role: "system", content: getSystemPrompt(req) },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const response = await executeAgentLoop(req, currentMessages, primaryModel, fallbackModel, fallbackModel2);
    return res.json({ response });
  } catch (error) {
    console.error("[Groq AI] Chat controller error:", error);
    return res.status(500).json({ message: error.message || "An error occurred during chat processing" });
  }
};

/**
 * Dynamic Agent Loop execution with fallback routing
 */
async function executeAgentLoop(req, messageStack, primaryModel, fallbackModel, fallbackModel2 = null) {
  // Build model chain: primary → fallback1 → fallback2 (if provided)
  const modelChain = [primaryModel, fallbackModel, ...(fallbackModel2 ? [fallbackModel2] : [])].filter(Boolean);
  let activeModelIndex = 0;
  let activeModel = modelChain[0];
  let loopCount = 0;
  const maxLoops = 8;
  let finalMessage = null;
  let lastToolName = null;
  let consecutiveSameToolCount = 0;

  while (loopCount < maxLoops) {
    let chatResponse;
    try {
      console.log(`[Groq AI] Dispatching completion request (loop ${loopCount}) to model: ${activeModel}`);
      chatResponse = await groq.chat.completions.create({
        model: activeModel,
        messages: messageStack,
        tools: getAvailableTools(req),
        tool_choice: loopCount >= 6 ? "none" : "auto", // Force text response near limit
      });
    } catch (err) {
      if (activeModelIndex < modelChain.length - 1) {
        activeModelIndex++;
        activeModel = modelChain[activeModelIndex];
        console.warn(`[Groq AI] Model failed: ${err.message}. Retrying with: ${activeModel}`);
        continue;
      } else {
        // All models failed — return graceful message
        console.error(`[Groq AI] All models failed:`, err.message);
        return {
          role: "assistant",
          content: "I'm sorry, I'm temporarily unable to process your request due to a service limitation. The AI service may have hit its daily usage limit. Please try again in a few minutes or tomorrow."
        };
      }
    }

    const responseMessage = chatResponse.choices[0].message;
    messageStack.push(responseMessage);

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      console.log(`[Groq AI] Model requested tool call: ${toolName}`);

      // 🛡️ Infinite loop guard — same tool called 2x in a row = stuck
      if (toolName === lastToolName) {
        consecutiveSameToolCount++;
        if (consecutiveSameToolCount >= 2) {
          console.warn(`[Groq AI] Loop detected: '${toolName}' called ${consecutiveSameToolCount + 1} times in a row. Injecting stop instruction.`);
          messageStack.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ success: false, error: "Tool already executed. You MUST now stop calling tools and write your final text response to the user immediately." }),
          });
          loopCount++;
          continue;
        }
      } else {
        consecutiveSameToolCount = 0;
      }
      lastToolName = toolName;

      const toolResult = await executeTool(toolName, JSON.parse(toolCall.function.arguments || "{}"), req);

      messageStack.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: JSON.stringify(toolResult),
      });

      loopCount++;
    } else {
      finalMessage = responseMessage;
      break;
    }
  }

  // Graceful fallback instead of hard crash
  if (!finalMessage) {
    console.warn("[Groq AI] Max loops reached without final text response. Returning fallback.");
    return {
      role: "assistant",
      content: "I was unable to complete this request in the available steps. Please try rephrasing or breaking your query into smaller parts.",
      _modelUsed: activeModel,
    };
  }

  // Attach model info to the message for frontend display
  finalMessage._modelUsed = activeModel;
  return finalMessage;
}

// ── PERSISTENT CHAT HISTORY HANDLERS ─────────────────────────────────

/**
 * Gets all active chat sessions of the logged-in user
 */
const getSessions = async (req, res) => {
  try {
    const sessions = await AIChatSession.find({ userId: req.user._id })
      .select("title updatedAt")
      .sort({ updatedAt: -1 });
    return res.json({ data: sessions });
  } catch (err) {
    console.error("[Groq AI] getSessions failed:", err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Loads a specific chat session's messages
 */
const getSessionById = async (req, res) => {
  try {
    const session = await AIChatSession.findOne({ _id: req.params.sessionId, userId: req.user._id });
    if (!session) {
      return res.status(404).json({ message: "Chat session not found." });
    }
    return res.json({ data: session });
  } catch (err) {
    console.error("[Groq AI] getSessionById failed:", err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Starts a new chat session database log
 */
const createSession = async (req, res) => {
  try {
    const adminName = req.user ? req.user.name : "Admin";
    const initialWelcome = {
      role: "assistant",
      content: `Welcome back, ${adminName}. 🛡️ This is your StagePass Platform Command Center. I am authorized with system-level access to audit global transactions, query organization metrics, and compare tenant performance.\n\nWhat report can I compile for you today?`,
    };

    const session = new AIChatSession({
      userId: req.user._id,
      title: "New Audit Chat",
      messages: [initialWelcome],
    });

    await session.save();
    return res.status(201).json({ data: session });
  } catch (err) {
    console.error("[Groq AI] createSession failed:", err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Appends messages to an existing session log and calls the agent loop
 */
const addMessageToSession = async (req, res) => {
  try {
    const session = await AIChatSession.findOne({ _id: req.params.sessionId, userId: req.user._id });
    if (!session) {
      return res.status(404).json({ message: "Chat session not found." });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: "content string is required" });
    }

    // Append user message to database
    session.messages.push({ role: "user", content });

    // Format chat history for LLM context (exclude system prompt, which getSystemPrompt prepends)
    const currentMessages = [
      { role: "system", content: getSystemPrompt(req) },
      ...session.messages.map((m) => {
        const payload = { role: m.role, content: m.content };
        if (m.name) payload.name = m.name;
        if (m.tool_call_id) payload.tool_call_id = m.tool_call_id;
        return payload;
      }),
    ];

    const primaryModel = process.env.GROQ_PRIMARY_MODEL || "llama-3.3-70b-versatile";
    const fallbackModel = process.env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";
    const fallbackModel2 = process.env.GROQ_FALLBACK_MODEL_2 || "gemma2-9b-it";

    // Run agentic multi-turn loop
    const aiMessage = await executeAgentLoop(req, currentMessages, primaryModel, fallbackModel, fallbackModel2);

    // Save final AI reply to database
    session.messages.push({ role: "assistant", content: aiMessage.content });

    // Auto-update title if it's still default
    if (session.title === "New Audit Chat") {
      const cleanTitle = content.split(" ").slice(0, 4).join(" ") + "...";
      session.title = cleanTitle.length > 30 ? cleanTitle.slice(0, 28) + "..." : cleanTitle;
    }

    await session.save();
    return res.json({ response: aiMessage, modelUsed: aiMessage._modelUsed || primaryModel, session });
  } catch (err) {
    console.error("[Groq AI] addMessageToSession failed:", err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Deletes a chat session
 */
const deleteSession = async (req, res) => {
  try {
    const result = await AIChatSession.findOneAndDelete({ _id: req.params.sessionId, userId: req.user._id });
    if (!result) {
      return res.status(404).json({ message: "Chat session not found" });
    }
    return res.json({ message: "Session deleted successfully" });
  } catch (err) {
    console.error("[Groq AI] deleteSession failed:", err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  chat,
  getSessions,
  getSessionById,
  createSession,
  addMessageToSession,
  deleteSession,
};
