const Organization = require("../models/Organization");

/**
 * Turns "Coke Studio Events" into "coke-studio-events".
 * If that slug is already taken, appends -2, -3, etc. until unique.
 */
const slugify = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, "");   // trim leading/trailing hyphens
};

const generateUniqueSlug = async (name) => {
  const base = slugify(name);
  let slug = base;
  let counter = 2;

  // Keep checking DB until we find a slug nobody else is using.
  while (await Organization.findOne({ slug })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  return slug;
};

module.exports = { slugify, generateUniqueSlug };
