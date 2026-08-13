import apiClient from "../api/client";

// Generate or retrieve a persistent client-side guest cart identifier
export const getCartId = () => {
  let cartId = localStorage.getItem("stagepass_cart_id");
  if (!cartId) {
    cartId = `cart-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`;
    localStorage.setItem("stagepass_cart_id", cartId);
  }
  return cartId;
};

// Local storage helpers
export const getLocalCart = () => {
  try {
    const raw = localStorage.getItem("stagepass_cart");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to parse local cart:", e);
    return [];
  }
};

export const setLocalCart = (items) => {
  localStorage.setItem("stagepass_cart", JSON.stringify(items));
  // Dispatch custom event to notify components (like Header) to update counts instantly
  window.dispatchEvent(new Event("cart-updated"));
};

export const claimGuestCart = async () => {
  const guestCartId = localStorage.getItem("stagepass_cart_id");
  const localItems = getLocalCart();
  if (!guestCartId && !localItems.length) return [];

  const res = await apiClient.post("/cart-sync/claim", { guestCartId });
  const items = res.data?.cart?.items || [];
  setLocalCart(items);
  return items;
};

export const resetCartForNewGuest = () => {
  localStorage.removeItem("stagepass_cart");
  localStorage.removeItem("stagepass_cart_id");
  window.dispatchEvent(new Event("cart-updated"));
};

// Sync local storage with backend DB
export const syncCartWithBackend = async () => {
  const items = getLocalCart();
  const cartId = getCartId();
  const token = localStorage.getItem("token"); // Auth token check

  if (!token) return;

  try {
    const res = await apiClient.post(
      "/cart-sync/sync",
      { items },
      { headers: { "X-Cart-Id": cartId } }
    );
    if (res.data?.cart?.items) {
      setLocalCart(res.data.cart.items);
    }
  } catch (err) {
    console.error("Cart sync with backend failed:", err.message);
  }
};

// Load cart from backend
export const fetchCart = async () => {
  const cartId = getCartId();
  const token = localStorage.getItem("token");

  if (!token) {
    return getLocalCart();
  }

  try {
    const res = await apiClient.get("/cart-sync", {
      headers: { "X-Cart-Id": cartId },
    });
    if (res.data?.cart?.items) {
      setLocalCart(res.data.cart.items);
      return res.data.cart.items;
    }
  } catch (err) {
    console.error("Failed to fetch cart:", err.message);
  }
  return getLocalCart();
};

// Server seat locking API calls
export const serverLockSeat = async (seatData) => {
  const cartId = getCartId();
  try {
    const res = await apiClient.post("/cart-sync/lock", seatData, {
      headers: { "X-Cart-Id": cartId },
    });
    if (res.data?.cart?.items) {
      setLocalCart(res.data.cart.items);
    }
    return res.data;
  } catch (err) {
    console.error("Seat lock failed:", err.message);
    throw err;
  }
};

export const serverUnlockSeat = async (seatData) => {
  const cartId = getCartId();
  try {
    const res = await apiClient.post("/cart-sync/unlock", seatData, {
      headers: { "X-Cart-Id": cartId },
    });
    if (res.data?.cart?.items) {
      setLocalCart(res.data.cart.items);
    }
    return res.data;
  } catch (err) {
    console.error("Seat unlock failed:", err.message);
    throw err;
  }
};

export const serverClearCart = async () => {
  const cartId = getCartId();
  try {
    const res = await apiClient.delete("/cart-sync", {
      headers: { "X-Cart-Id": cartId },
    });
    setLocalCart([]);
    return res.data;
  } catch (err) {
    console.error("Cart clear failed:", err.message);
    throw err;
  }
};
