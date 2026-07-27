require("dotenv").config();
const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/User");

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing from backend/.env");

  const prompt = readline.createInterface({ input, output });
  try {
    const name = (await prompt.question("Super Admin name: ")).trim();
    const email = (await prompt.question("Super Admin email: ")).trim().toLowerCase();
    const password = await prompt.question("Super Admin password: ");

    if (!name || !email || !password) throw new Error("Name, email, and password are all required");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");

    await mongoose.connect(process.env.MONGO_URI);
    const existing = await User.findOne({ email });
    if (existing && existing.platformRole !== "super_admin") {
      throw new Error("A normal user already uses this email. Choose a new admin email; this script will not promote it automatically.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (existing) {
      existing.name = name;
      existing.passwordHash = passwordHash;
      existing.platformRole = "super_admin";
      existing.requiresPasswordSetup = false;
      await existing.save();
      console.log("Super Admin credentials updated successfully.");
    } else {
      await User.create({ name, email, passwordHash, platformRole: "super_admin" });
      console.log("Super Admin created successfully.");
    }
  } finally {
    prompt.close();
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(`Unable to create Super Admin: ${error.message}`);
  process.exit(1);
});
