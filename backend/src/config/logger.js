const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");

const isProduction = process.env.NODE_ENV === "production";
const logDirectory = path.resolve(__dirname, "../../logs");
const redact = winston.format((info) => {
  const sensitive = /password|token|authorization|cookie|secret|api[_-]?key|otp|accesscode/i;
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : clean(item)]));
    return value;
  };
  Object.assign(info, clean(info));
  return info;
});

const fileFormat = winston.format.combine(winston.format.timestamp(), redact(), winston.format.json());
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "HH:mm:ss" }),
    redact(),
    winston.format.printf(({ timestamp, level, message, method, url, status, durationMs, requestId, error, ip, userAgent, contentLength, ...meta }) => {
      if (message === "HTTP request") {
        const request = `${String(method).padEnd(7)} ${String(status).padEnd(3)} ${String(Math.round(durationMs)).padStart(4)}ms  ${url}`;
        return [
          `${timestamp} ${level} ${request}`,
          `  requestId: ${requestId}`,
          `  client:    ${ip || "unknown"}`,
          `  response:  ${contentLength || "0"} bytes`,
          `  userAgent: ${userAgent || "unknown"}`,
        ].join("\n");
      }
      const context = error ? ` — ${error}` : "";
      const extra = Object.entries(meta).filter(([key]) => !["legacy", "stack", "details"].includes(key));
      const trace = [requestId && `requestId: ${requestId}`, method && `method: ${method}`, url && `url: ${url}`, ip && `client: ${ip}`].filter(Boolean);
      return `${timestamp} ${level}: ${message}${context}${trace.length ? `\n  ${trace.join("\n  ")}` : ""}${extra.length ? ` ${JSON.stringify(Object.fromEntries(extra))}` : ""}`;
    }),
  );

const transports = [
  new winston.transports.Console({ format: consoleFormat }),
  new winston.transports.DailyRotateFile({ filename: path.join(logDirectory, "combined-%DATE%.log"), datePattern: "YYYY-MM-DD", maxSize: "20m", maxFiles: "14d", format: fileFormat }),
  new winston.transports.DailyRotateFile({ level: "error", filename: path.join(logDirectory, "error-%DATE%.log"), datePattern: "YYYY-MM-DD", maxSize: "20m", maxFiles: "14d", format: fileFormat }),
];

const logger = winston.createLogger({ level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"), format: fileFormat, transports, exitOnError: false });

const legacyLog = (level, args) => {
  const [first, ...rest] = args;
  const error = rest.find((item) => item instanceof Error) || (first instanceof Error ? first : null);
  logger.log(level, error ? error.message : String(first), { legacy: true, ...(error ? { stack: error.stack } : {}), ...(rest.length ? { details: rest.filter((item) => item !== error).map((item) => typeof item === "string" ? item : JSON.stringify(item)) } : {}) });
};

module.exports = { logger, legacyLog, logDirectory };
