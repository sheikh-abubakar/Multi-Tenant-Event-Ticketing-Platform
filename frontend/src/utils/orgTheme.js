// A small set of poster-style gradients — thematically each
// organization's card reads like its own show poster. The same org
// always gets the same gradient (hashed from its slug), so it stays
// visually recognizable across visits, not random every render.
const GRADIENTS = [
  ["#7C3AED", "#DB2777"], // violet -> pink
  ["#0D9488", "#22C55E"], // teal -> green
  ["#EA580C", "#F59E0B"], // burnt orange -> amber
  ["#2563EB", "#4F46E5"], // blue -> indigo
  ["#DC2626", "#F43F5E"], // red -> rose
  ["#0891B2", "#6366F1"], // cyan -> indigo
];

export const gradientForOrg = (slug) => {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const [from, to] = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
};
