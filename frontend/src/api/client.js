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
  return config;
});

export default apiClient;
