import axios from "axios";

const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,  // 🔴 IMPORTANT: Send session cookie with every request
});

// Attaches "Authorization: Bearer <token>" to every request automatically,
// if a token exists in localStorage. Individual pages never need to think
// about auth headers manually — this interceptor handles it for all of them.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Inject any unlocked event and bundle access codes from sessionStorage
  try {
    const savedCodes = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
    const ids = new Set();

    const matches = config.url.match(/[0-9a-fA-F]{24}/g);
    if (matches && matches.length > 0) {
      matches.forEach((id) => ids.add(id));
    }

    if (typeof window !== "undefined" && window.location) {
      const pageMatches = window.location.href.match(/[0-9a-fA-F]{24}/g);
      if (pageMatches && pageMatches.length > 0) {
        pageMatches.forEach((id) => ids.add(id));
      }
    }

    ids.forEach((id) => {
      if (savedCodes[id]) {
        config.headers["x-event-access-code"] = savedCodes[id];
        config.headers["x-bundle-access-code"] = savedCodes[id];
      }
    });

    // Also populate post checkout request body automatically
    if (
      config.method === "post" &&
      config.url.includes("/checkout") &&
      config.data &&
      typeof config.data === "object"
    ) {
      ids.forEach((id) => {
        if (savedCodes[id]) {
          config.data.bundleAccessCode = savedCodes[id];
          config.data.eventAccessCode = savedCodes[id];
        }
      });
      config.data.eventAccessCodes = savedCodes;
    }
  } catch (e) {
    console.error("Error attaching access codes", e);
  }

  return config;
});

export default apiClient;
