const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const SECRET = process.env.JWT_SECRET || "stagepass_default_qr_secret_key_32_chars!";

// Generate a consistent 32-byte key from our application secret
const getEncryptionKey = () => {
  return crypto.createHash("sha256").update(SECRET).digest();
};

/**
 * Encrypt a JSON payload into a secure hex string containing IV and Ciphertext.
 * @param {Object} payload 
 * @returns {string}
 */
const encryptPayload = (payload) => {
  try {
    const text = JSON.stringify(payload);
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    // Return iv:ciphertext
    return `${iv.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption failed:", error.message);
    throw new Error("Failed to secure QR payload");
  }
};

/**
 * Decrypt a secure hex string back into the original JSON payload.
 * @param {string} encryptedText 
 * @returns {Object}
 */
const decryptPayload = (encryptedText) => {
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted format");
    }
    
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error.message);
    throw new Error("Failed to verify secure QR payload");
  }
};

module.exports = {
  encryptPayload,
  decryptPayload,
};
