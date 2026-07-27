const authService = require("../services/auth.service");

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
    return res.status(201).json(result);
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
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const googleSignIn = async (req, res) => {
  try {
    if (!req.body?.credential) return res.status(400).json({ message: "Google credential is required" });
    const result = await authService.signInWithGoogle(req.body.credential);
    return res.status(200).json(result);
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
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
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
};
