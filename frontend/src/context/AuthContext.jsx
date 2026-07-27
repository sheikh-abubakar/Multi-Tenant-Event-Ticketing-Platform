import { createContext, useContext, useState } from "react";
import apiClient from "../api/client";

/**
 * AuthContext holds the GLOBAL identity — token + user — exactly
 * mirroring the backend concept: a User is not tied to any single
 * organization. Which organization/role is "active" is a separate,
 * per-page concern (handled by reading :orgSlug from the URL and
 * calling /whoami), not something stored here.
 */
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  const persistSession = (newToken, newUser) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const signup = async ({ name, email, password }) => {
    const { data } = await apiClient.post("/auth/signup", { name, email, password });
    persistSession(data.token, data.user);
    return data;
  };

  const login = async ({ email, password }) => {
    const { data } = await apiClient.post("/auth/login", { email, password });
    persistSession(data.token, data.user);
    return data;
  };

  const loginWithGoogle = async (credential) => {
    const { data } = await apiClient.post("/auth/google", { credential });
    persistSession(data.token, data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  const updateUser = (newUser) => {
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, signup, login, loginWithGoogle, logout, updateUser, persistSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
