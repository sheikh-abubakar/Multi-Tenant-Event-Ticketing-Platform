const authService = require("../services/auth.service");
const { notifyPlatformAdmin } = require("../services/notification.service");

/**
 * Controllers stay thin: validate presence of fields, call the service,
 * shape the HTTP response. No business logic here.
 */

const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    const result = await authService.signup({ name, email, password });
    await notifyPlatformAdmin({ type: "platform.user.signup", title: "New user registered", message: `${result.user?.name || name} registered with email signup.`, link: "/platform-admin/activity", metadata: { userId: String(result.user?._id || result.user?.id || ""), email } });
    
    // Clear any previous anonymous/stale session data
    req.session.regenerate((err) => {
      if (err) console.error("Session regeneration failed on signup:", err);
      return res.status(201).json(result);
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const result = await authService.login({ email, password });
    
    // Destroy previous session (along with any other user's cart) and create fresh session
    req.session.regenerate((err) => {
      if (err) console.error("Session regeneration failed on login:", err);
      return res.status(200).json(result);
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const googleSignIn = async (req, res) => {
  try {
    if (!req.body?.credential) return res.status(400).json({ message: "Google credential is required" });
    const result = await authService.signInWithGoogle(req.body.credential);
    if (result.isNewUser || result.newUser) await notifyPlatformAdmin({ type: "platform.user.google-signup", title: "New user registered", message: `${result.user?.name || result.user?.email || "A user"} registered with Google.`, link: "/platform-admin/activity", metadata: { userId: String(result.user?._id || result.user?.id || ""), email: result.user?.email } });
    
    // Destroy previous session and create fresh session
    req.session.regenerate((err) => {
      if (err) console.error("Session regeneration failed on Google sign-in:", err);
      return res.status(200).json(result);
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};


const updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const result = await authService.updateProfile(req.user._id, { name });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
    }

    const result = await authService.updatePassword(req.user._id, { currentPassword, newPassword });
    await notifyPlatformAdmin({ type: "platform.user.password-changed", title: "Password changed", message: `${req.user.name || req.user.email} changed their password.`, link: "/platform-admin/activity", metadata: { userId: String(req.user._id), email: req.user.email } });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    const result = await authService.generatePasswordResetOTP(email);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otpCode, newPassword } = req.body;
    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({ message: "email, otpCode and newPassword are required" });
    }

    const result = await authService.resetPasswordWithOTP({ email, otpCode, newPassword });
    await notifyPlatformAdmin({ type: "platform.user.password-reset", title: "Password reset completed", message: `${result.user?.name || email} completed a password reset.`, link: "/platform-admin/activity", metadata: { userId: String(result.user?.id || ""), email } });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Logout session destruction failed:", err);
          return res.status(500).json({ message: "Logout failed" });
        }
        res.clearCookie("stagepass.sid");
        return res.status(200).json({ message: "Logged out successfully" });
      });
    } else {
      return res.status(200).json({ message: "Logged out successfully" });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  signup,
  login,
  googleSignIn,
  updateProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  logout,
};
