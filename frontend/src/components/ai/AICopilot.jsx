import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../api/client";
import "./AICopilot.css";

const SUGGESTIONS = [
  "What events are coming up?",
  "How do I request a refund?",
  "How to create an account?",
  "Forgot my password?",
];

export default function AICopilot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize with greeting
  useEffect(() => {
    const greetingName = user ? user.name : "there";
    setMessages([
      {
        role: "assistant",
        content: `Hey ${greetingName}! 👋 Welcome to StagePass. I am your AI Copilot. How can I help you today? You can ask me about upcoming events, refunds, account settings, or use the quick links below!`,
      },
    ]);
  }, [user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    if (!textToSend) setInput(""); // Clear typing input

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Send message history formatted for OpenAI/Groq API (excluding system prompt helper)
      const payload = {
        messages: newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      const res = await apiClient.post("/ai/chat", payload);
      const aiReply = res.data?.response?.content || "Sorry, I encountered an issue processing your request. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant", content: aiReply }]);
    } catch (err) {
      console.error("[Copilot] Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble connecting to the server. Please check your connection or verify that the Groq API key is set.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSendMessage();
  };

  return (
    <div className="ai-copilot-container">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          className="ai-copilot-toggle-btn animate-pulse"
          onClick={() => setIsOpen(true)}
          title="Open AI Assistant"
        >
          <Sparkles size={20} className="ai-sparkles-icon" />
          <span className="ai-toggle-text">StagePass AI</span>
        </button>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="ai-copilot-window glass-panel">
          {/* Header */}
          <div className="ai-copilot-header">
            <div className="ai-header-title">
              <Sparkles size={16} className="ai-header-sparkles" />
              <span>STAGEPASS Copilot</span>
              <span className="ai-status-indicator"></span>
            </div>
            <button className="ai-close-btn" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {/* Message History Area */}
          <div className="ai-copilot-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`ai-message-bubble ${msg.role}`}>
                <div className="ai-message-content">{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="ai-message-bubble assistant loading">
                <div className="ai-typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Chips */}
          <div className="ai-copilot-suggestions">
            {SUGGESTIONS.map((sug, index) => (
              <button
                key={index}
                className="ai-suggestion-chip"
                onClick={() => handleSendMessage(sug)}
                disabled={loading}
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Text Input Footer */}
          <div className="ai-copilot-input-area">
            <input
              type="text"
              placeholder="Ask anything (Urdu or English)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading}
              className="ai-chat-input"
            />
            <button
              className="ai-send-btn"
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || loading}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
