const crypto = require("crypto");

/**
 * Generate a secure random token for email invitations.
 * Returns a URL-safe hex string.
 */
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Create an invitation URL that the recipient can click to accept.
 * Uses the frontend URL from env (or localhost:5173 fallback).
 */
const createInvitationUrl = (orgSlug, token) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${frontendUrl}/o/${orgSlug}/accept-invite?token=${token}`;
};

module.exports = { generateInvitationToken, createInvitationUrl };