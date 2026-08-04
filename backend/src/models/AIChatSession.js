const mongoose = require("mongoose");

const aiChatSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    default: "New Audit Chat",
  },
  messages: [
    {
      role: {
        type: String,
        enum: ["user", "assistant", "system", "tool"],
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      name: {
        type: String,
      },
      tool_call_id: {
        type: String,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update updatedAt pre-save
aiChatSessionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("AIChatSession", aiChatSessionSchema);
