const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { generateToken } = require("../utils/jwt");
const { sendPasswordResetOTP } = require("../config/email");

/**
 * Auth Service — all business logic for signup/login lives here.
 * Controllers stay "thin": they just read req/res and delegate here.
 */

const SALT_ROUNDS = 10;
const googleClient = new OAuth2Client();

const toAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  hasPassword: Boolean(user.passwordHash),
  requiresPasswordSetup: Boolean(user.requiresPasswordSetup),
});

const signup = async ({ name, email, password }) => {
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    const error = new Error("An account with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    name,
    email,
    passwordHash,
  });

  const token = generateToken(user._id);

  return {
    token,
    user: toAuthUser(user),
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user._id);

  return {
    token,
    user: toAuthUser(user),
  };
};

const signInWithGoogle = async (credential) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    const error = new Error("Google sign-in is not configured on the server");
    error.statusCode = 503;
    throw error;
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    const error = new Error("Google sign-in could not be verified");
    error.statusCode = 401;
    throw error;
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    const error = new Error("Please use a Google account with a verified email address");
    error.statusCode = 400;
    throw error;
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ googleId: payload.sub });

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      if (user.googleId && user.googleId !== payload.sub) {
        const error = new Error("This email is already linked to another Google account");
        error.statusCode = 409;
        throw error;
      }
      user.googleId = payload.sub;
      await user.save();
    } else {
      user = await User.create({
        name: payload.name || email.split("@")[0],
        email,
        googleId: payload.sub,
        requiresPasswordSetup: true,
      });
    }
  }

  return { token: generateToken(user._id), user: toAuthUser(user) };
};

const updateProfile = async (userId, { name }) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  user.name = name.trim();
  await user.save();

  return {
    user: toAuthUser(user),
  };
};

const updatePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.passwordHash && !currentPassword) {
    const error = new Error("Current password is required");
    error.statusCode = 400;
    throw error;
  }

  const isMatch = !user.passwordHash || await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Incorrect current password");
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.requiresPasswordSetup = false;
  await user.save();

  return { message: "Password updated successfully", user: toAuthUser(user) };
};

const generatePasswordResetOTP = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const error = new Error("No account found with this email");
    error.statusCode = 404;
    throw error;
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  user.otpCode = otpCode;
  user.otpExpiresAt = otpExpiresAt;
  await user.save();

  try {
    await sendPasswordResetOTP(user.email, otpCode);
  } catch (emailErr) {
    console.error("Failed to send OTP email:", emailErr.message);
    const error = new Error("Failed to send verification email. Please check your SMTP settings.");
    error.statusCode = 500;
    throw error;
  }

  return { message: "Verification code sent to your email" };
};

const resetPasswordWithOTP = async ({ email, otpCode, newPassword }) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.otpCode || user.otpCode !== otpCode) {
    const error = new Error("Invalid verification code");
    error.statusCode = 400;
    throw error;
  }

  if (new Date() > user.otpExpiresAt) {
    const error = new Error("Verification code has expired");
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.otpCode = null;
  user.otpExpiresAt = null;
  await user.save();

  const token = generateToken(user._id);

  return {
    token,
    user: toAuthUser(user),
    message: "Password reset successful",
  };
};

module.exports = {
  signup,
  login,
  signInWithGoogle,
  updateProfile,
  updatePassword,
  generatePasswordResetOTP,
  resetPasswordWithOTP,
};
