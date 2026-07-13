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

module.exports = { signup, login };
