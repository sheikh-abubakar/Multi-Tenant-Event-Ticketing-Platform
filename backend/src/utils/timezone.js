const moment = require("moment-timezone");

/**
 * Timezone Utility
 * 
 * Provides helper functions for timezone-related operations:
 * - Get timezone offset
 * - Convert local time to UTC
 * - Get UTC offset string (e.g., "+05:00")
 * - Validate timezone
 */

/**
 * Timezone display names with UTC offsets
 */
const TIMEZONE_DISPLAY = {
  "Asia/Karachi": { label: "Pakistan Standard Time", offset: "+05:00", flag: "🇵🇰" },
  "Asia/Dubai": { label: "Gulf Standard Time", offset: "+04:00", flag: "🇦🇪" },
  "Asia/Kolkata": { label: "India Standard Time", offset: "+05:30", flag: "🇮🇳" },
  "Asia/Riyadh": { label: "Arabian Standard Time", offset: "+03:00", flag: "🇸🇦" },
  "Asia/Dhaka": { label: "Bangladesh Standard Time", offset: "+06:00", flag: "🇧🇩" },
  "Asia/Kabul": { label: "Afghanistan Time", offset: "+04:30", flag: "🇦🇫" },
  "Asia/Tehran": { label: "Iran Standard Time", offset: "+03:30", flag: "🇮🇷" },
  "Asia/Baghdad": { label: "Arabia Standard Time", offset: "+03:00", flag: "🇮🇶" },
  "Asia/Singapore": { label: "Singapore Time", offset: "+08:00", flag: "🇸🇬" },
  "Asia/Shanghai": { label: "China Standard Time", offset: "+08:00", flag: "🇨🇳" },
  "Asia/Tokyo": { label: "Japan Standard Time", offset: "+09:00", flag: "🇯🇵" },
  "Asia/Seoul": { label: "Korea Standard Time", offset: "+09:00", flag: "🇰🇷" },
  "America/New_York": { label: "Eastern Time", offset: "-05:00", flag: "🇺🇸" },
  "America/Chicago": { label: "Central Time", offset: "-06:00", flag: "🇺🇸" },
  "America/Denver": { label: "Mountain Time", offset: "-07:00", flag: "🇺🇸" },
  "America/Los_Angeles": { label: "Pacific Time", offset: "-08:00", flag: "🇺🇸" },
  "America/Toronto": { label: "Eastern Time", offset: "-05:00", flag: "🇨🇦" },
  "America/Vancouver": { label: "Pacific Time", offset: "-08:00", flag: "🇨🇦" },
  "America/Sao_Paulo": { label: "Brasília Time", offset: "-03:00", flag: "🇧🇷" },
  "America/Mexico_City": { label: "Central Time", offset: "-06:00", flag: "🇲🇽" },
  "Europe/London": { label: "Greenwich Mean Time", offset: "+00:00", flag: "🇬🇧" },
  "Europe/Berlin": { label: "Central European Time", offset: "+01:00", flag: "🇩🇪" },
  "Europe/Moscow": { label: "Moscow Time", offset: "+03:00", flag: "🇷🇺" },
  "Europe/Istanbul": { label: "Turkey Time", offset: "+03:00", flag: "🇹🇷" },
  "Australia/Sydney": { label: "Australian Eastern Time", offset: "+10:00", flag: "🇦🇺" },
  "Australia/Perth": { label: "Australian Western Time", offset: "+08:00", flag: "🇦🇺" },
  "Pacific/Auckland": { label: "New Zealand Time", offset: "+12:00", flag: "🇳🇿" },
  "Africa/Cairo": { label: "Eastern European Time", offset: "+02:00", flag: "🇪🇬" },
  "Africa/Lagos": { label: "West Africa Time", offset: "+01:00", flag: "🇳🇬" },
  "Africa/Johannesburg": { label: "South Africa Standard Time", offset: "+02:00", flag: "🇿🇦" },
  "UTC": { label: "Coordinated Universal Time", offset: "+00:00", flag: "🌐" },
};

/**
 * Get UTC offset string for a timezone (e.g., "Asia/Karachi" → "+05:00")
 * Uses moment-timezone for accuracy including DST
 */
const getUTCOffset = (timezone) => {
  if (!timezone || !moment.tz.zone(timezone)) {
    return "+00:00";
  }
  
  const offsetMinutes = moment.tz(timezone).utcOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/**
 * Get the current UTC offset in minutes for a timezone
 * (e.g., "Asia/Karachi" → 300 for +05:00)
 */
const getUTCOffsetMinutes = (timezone) => {
  if (!timezone || !moment.tz.zone(timezone)) {
    return 0;
  }
  return moment.tz(timezone).utcOffset();
};

/**
 * Convert a local date/time to UTC Date
 * 
 * @param {Date|string} localDate - The local date/time
 * @param {string} timezone - IANA timezone (e.g., "Asia/Karachi")
 * @returns {Date} UTC date
 */
const convertToUTC = (localDate, timezone) => {
  const m = moment.tz(localDate, timezone);
  return m.utc().toDate();
};

/**
 * Format a date for Google Calendar (YYYYMMDDTHHMMSSZ in UTC)
 */
const formatForGoogleCalendar = (date, timezone) => {
  const utcDate = convertToUTC(date, timezone);
  return moment(utcDate).format("YYYYMMDDTHHmmss") + "Z";
};

/**
 * Format a date for iCalendar (.ics) format (YYYYMMDDTHHMMSSZ in UTC)
 */
const formatForICal = (date, timezone) => {
  const utcDate = convertToUTC(date, timezone);
  return moment(utcDate).format("YYYYMMDDTHHmmss") + "Z";
};

/**
 * Get all timezone options for dropdown/select components
 * Returns sorted array of { value, label, offset, flag }
 */
const getTimezoneOptions = () => {
  return Object.entries(TIMEZONE_DISPLAY)
    .map(([value, info]) => ({
      value,
      label: `${info.flag} (UTC${info.offset}) ${info.label} — ${value.split("/").pop().replace(/_/g, " ")}`,
      offset: info.offset,
      flag: info.flag,
    }))
    .sort((a, b) => {
      // Sort by offset first, then by label
      const offsetA = parseInt(a.offset);
      const offsetB = parseInt(b.offset);
      if (offsetA !== offsetB) return offsetB - offsetA;
      return a.label.localeCompare(b.label);
    });
};

/**
 * Validate if a timezone is valid
 */
const isValidTimezone = (timezone) => {
  return moment.tz.zone(timezone) !== null;
};

module.exports = {
  TIMEZONE_DISPLAY,
  getUTCOffset,
  getUTCOffsetMinutes,
  convertToUTC,
  formatForGoogleCalendar,
  formatForICal,
  getTimezoneOptions,
  isValidTimezone,
};