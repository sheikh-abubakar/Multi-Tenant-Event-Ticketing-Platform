const crypto = require("crypto");
const morgan = require("morgan");
const { logger } = require("../config/logger");

const requestId = (req, res, next) => {
  req.requestId = req.get("x-request-id") || crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

const requestLogger = morgan((tokens, req, res) => JSON.stringify({
  requestId: req.requestId,
  method: tokens.method(req, res),
  url: tokens.url(req, res),
  status: Number(tokens.status(req, res)),
  durationMs: Number(tokens["response-time"](req, res)),
  contentLength: tokens.res(req, res, "content-length") || undefined,
  ip: req.ip,
  userAgent: req.get("user-agent"),
  userId: req.user?._id?.toString() || req.user?.id?.toString() || undefined,
  organizationId: req.organizationId?.toString() || undefined,
}), {
  stream: { write: (line) => {
    const entry = JSON.parse(line);
    logger.log(entry.status >= 500 ? "error" : entry.status >= 400 ? "warn" : "info", "HTTP request", entry);
  } },
});

module.exports = { requestId, requestLogger };
