import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Download, FileText, BarChart2, ShieldAlert, Plus, MessageSquare, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import "./PlatformAIAssistant.css";

const ADMIN_SUGGESTIONS = [
  "Show me general platform statistics",
  "Compare gross revenue between organizations",
  "Generate Platform Revenue PDF Report",
];

// Custom Premium Markdown Parser component
const MarkdownRenderer = ({ text }) => {
  if (!text) return null;

  const lines = text.split("\n");
  const parsedElements = [];
  let inList = false;
  let inTable = false;
  let listItems = [];
  let tableRows = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      parsedElements.push(
        <ul key={`ul-${key}`} className="markdown-list">
          {listItems.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  const flushTable = (key) => {
    if (tableRows.length > 0) {
      const headers = tableRows[0];
      const rows = tableRows.slice(1);
      parsedElements.push(
        <div key={`table-${key}`} className="markdown-table-wrapper">
          <table className="markdown-table">
            <thead>
              <tr>
                {headers.map((h, idx) => (
                  <th key={idx}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
    inTable = false;
  };

  // Helper to parse inline bolding **text**
  const parseInlineStyles = (txt) => {
    const parts = txt.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Handle Tables
    if (line.startsWith("|")) {
      flushList(i);
      inTable = true;
      if (line.includes("---") || line.includes("-|")) {
        continue;
      }
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      tableRows.push(cols.map((c) => parseInlineStyles(c)));
      continue;
    } else {
      flushTable(i);
    }

    // Handle Bullet Lists
    if (line.startsWith("* ") || line.startsWith("- ")) {
      inList = true;
      listItems.push(parseInlineStyles(line.slice(2)));
      continue;
    } else {
      flushList(i);
    }

    // Handle Headers / Headings
    if (line.startsWith("### ")) {
      parsedElements.push(<h3 key={i} className="markdown-h3">{parseInlineStyles(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      parsedElements.push(<h2 key={i} className="markdown-h2">{parseInlineStyles(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      parsedElements.push(<h1 key={i} className="markdown-h1">{parseInlineStyles(line.slice(2))}</h1>);
    } else if (line) {
      parsedElements.push(<p key={i} className="markdown-paragraph">{parseInlineStyles(line)}</p>);
    }
  }

  flushList(lines.length);
  flushTable(lines.length);

  return <div className="markdown-parsed-container">{parsedElements}</div>;
};

export default function PlatformAIAssistant() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // Load chat list on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const loadSessions = async (selectFirst = true) => {
    try {
      setSessionsLoading(true);
      const res = await apiClient.get("/ai/sessions");
      const list = res.data?.data || [];
      setSessions(list);

      if (selectFirst && list.length > 0) {
        loadSessionMessages(list[0]._id);
      } else if (list.length === 0) {
        // Create initial session if none exist
        handleCreateSession();
      }
    } catch (err) {
      console.error("[Admin AI] Failed to load chat list:", err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSessionMessages = async (sessionId) => {
    try {
      setActiveSessionId(sessionId);
      setMessages([]);
      setLoading(true);
      const res = await apiClient.get(`/ai/sessions/${sessionId}`);
      setMessages(res.data?.data?.messages || []);
    } catch (err) {
      console.error("[Admin AI] Failed to load session messages:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    try {
      setLoading(true);
      const res = await apiClient.post("/ai/sessions");
      const newSession = res.data?.data;
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession._id);
      setMessages(newSession.messages || []);
    } catch (err) {
      console.error("[Admin AI] Failed to create new session:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation(); // Stop selection trigger
    if (!confirm("Are you sure you want to delete this chat session?")) return;

    try {
      await apiClient.delete(`/ai/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
      
      // If we deleted the active one, load the next remaining one
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s._id !== sessionId);
        if (remaining.length > 0) {
          loadSessionMessages(remaining[0]._id);
        } else {
          handleCreateSession();
        }
      }
    } catch (err) {
      console.error("[Admin AI] Failed to delete session:", err);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || loading || !activeSessionId) return;

    if (!textToSend) setInput("");

    // optimistic user append
    const updatedUserMsg = [...messages, { role: "user", content: text }];
    setMessages(updatedUserMsg);
    setLoading(true);

    try {
      const res = await apiClient.post(`/ai/sessions/${activeSessionId}/message`, { content: text });
      const aiReply = res.data?.response?.content || "No response content received.";
      const modelUsed = res.data?.modelUsed || "unknown";
      
      setMessages((prev) => [...prev, { role: "assistant", content: aiReply, modelUsed }]);
      
      // Refresh list to pull updated titles/timestamps
      loadSessions(false);
    } catch (err) {
      console.error("[Admin AI] Request failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Failed to communicate with the Groq AI service. Verify that the server is active and the GROQ_API_KEY is configured in your backend .env.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to render customized S3 download cards if response text contains PDF links
  const renderMessageContent = (msg) => {
    const pdfRegex = /(https?:\/\/[^\s]+?\.pdf)/g;
    const hasPdf = pdfRegex.test(msg.content);

    if (hasPdf && msg.role === "assistant") {
      const parts = msg.content.split(pdfRegex);
      const urls = msg.content.match(pdfRegex) || [];
      let urlIdx = 0;

      return (
        <div className="ai-formatted-content">
          {parts.map((part, i) => {
            if (pdfRegex.test(part) || (urls[urlIdx] && part === urls[urlIdx])) {
              const downloadUrl = urls[urlIdx++];
              return (
                <div key={i} className="ai-download-card">
                  <div className="ai-card-icon">
                    <FileText size={28} className="ai-icon-gold" />
                  </div>
                  <div className="ai-card-info">
                    <span className="ai-card-filename">StagePass_Intel_Report.pdf</span>
                    <span className="ai-card-filesize">Executive Programmatic Format</span>
                  </div>
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ai-card-download-btn btn btn-primary"
                  >
                    <Download size={14} /> Download PDF
                  </a>
                </div>
              );
            }
            return <MarkdownRenderer key={i} text={part} />;
          })}
        </div>
      );
    }

    return <MarkdownRenderer text={msg.content} />;
  };

  return (
    <div className="admin-assistant-workspace">
      {/* Dynamic Left Column - ChatGPT-Style Recent Chats list */}
      <div className="admin-assistant-sidebar glass-panel">
        <button className="new-chat-btn" onClick={handleCreateSession} disabled={loading}>
          <Plus size={16} />
          <span>New Chat</span>
        </button>

        <hr className="sidebar-divider" />

        <h2 className="recent-chats-title">Recent Chats</h2>

        <div className="chats-list-scrollarea">
          {sessionsLoading && sessions.length === 0 ? (
            <div className="chats-loading-kicker">Loading chats...</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session._id}
                onClick={() => loadSessionMessages(session._id)}
                className={`chat-session-item ${activeSessionId === session._id ? "is-active" : ""}`}
              >
                <MessageSquare size={14} className="icon-gold" />
                <span className="chat-session-title">{session.title}</span>
                <button
                  className="delete-session-btn"
                  onClick={(e) => handleDeleteSession(e, session._id)}
                  title="Delete chat"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Right Column - Widescreen Chat Area */}
      <div className="admin-assistant-chat-panel glass-panel">
        <div className="chat-panel-header">
          <div className="chat-header-title">
            <Sparkles size={18} className="icon-gold animate-pulse" />
            <h1>EXECUTIVE STAGEPASS AGENT</h1>
            <span className="active-glow-indicator"></span>
          </div>
          <span className="api-badge">Groq AI</span>
        </div>

        {/* Chat Messages */}
        <div className="chat-messages-container">
          {messages.map((msg, index) => (
            <div key={index} className={`chat-message-row ${msg.role}`}>
              <div className={`chat-avatar-icon ${msg.role}`}>
                {msg.role === "user" ? "A" : <Sparkles size={14} />}
              </div>
              <div className="chat-bubble-container">
                <span className="chat-sender-name">
                  {msg.role === "user" ? "Super Admin" : "StagePass Copilot"}
                </span>
                <div className="chat-message-bubble">{renderMessageContent(msg)}</div>
                {msg.role === "assistant" && msg.modelUsed && (
                  <span className="model-used-badge" title={`Responded by: ${msg.modelUsed}`}>
                    ⚡ {msg.modelUsed.split("/").pop()}
                  </span>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-message-row assistant">
              <div className="chat-avatar-icon assistant">
                <Sparkles size={14} />
              </div>
              <div className="chat-bubble-container">
                <span className="chat-sender-name">StagePass Copilot</span>
                <div className="chat-message-bubble loading">
                  <div className="chat-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions Bar */}
        <div className="chat-suggestions-bar">
          {ADMIN_SUGGESTIONS.map((sug, idx) => (
            <button
              key={idx}
              className="chat-suggestion-chip"
              onClick={() => handleSendMessage(sug)}
              disabled={loading}
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Input Footer */}
        <div className="chat-input-container">
          <textarea
            placeholder="Type your audit command or report query (e.g. Compare tickets revenue)..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={loading}
            rows={1}
            className="chat-workspace-input"
          />
          <button
            className="chat-workspace-send-btn"
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || loading}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
