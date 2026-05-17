// backend/middleware/rateLimiter.js
// 5 renders per IP per day — resets at midnight
// Admin reset: GET /api/admin/reset?ip=x.x.x.x&key=YOUR_SECRET

const DAILY_LIMIT = 5;
const ADMIN_KEY   = process.env.ADMIN_KEY || 'aootra-admin-2026'; // change in .env

// In-memory store: { "ip": { count: 3, date: "2026-05-17" } }
const store = {};

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "2026-05-17"
}

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ── Middleware: attach to render route ───────────────────────────────────────
function renderLimiter(req, res, next) {
  const ip    = getIP(req);
  const today = todayStr();

  if (!store[ip] || store[ip].date !== today) {
    store[ip] = { count: 0, date: today };
  }

  if (store[ip].count >= DAILY_LIMIT) {
    return res.status(429).json({
      error:     'Daily render limit reached',
      message:   `You have used all ${DAILY_LIMIT} free renders for today. Come back tomorrow!`,
      remaining: 0,
      resetAt:   'midnight'
    });
  }

  store[ip].count++;
  res.setHeader('X-Renders-Remaining', DAILY_LIMIT - store[ip].count);
  next();
}

// ── Admin routes ─────────────────────────────────────────────────────────────
function adminRoutes(req, res) {
  // All admin routes require ?key=ADMIN_KEY
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }

  const { action, ip } = req.query;

  // GET /api/admin?key=x&action=list  — see all IPs and counts
  if (action === 'list') {
    const today = todayStr();
    const active = Object.entries(store)
      .filter(([, v]) => v.date === today)
      .map(([k, v]) => ({ ip: k, count: v.count, remaining: DAILY_LIMIT - v.count }));
    return res.json({ today, limit: DAILY_LIMIT, active });
  }

  // GET /api/admin?key=x&action=reset&ip=x.x.x.x  — reset one IP
  if (action === 'reset') {
    if (!ip) return res.status(400).json({ error: 'ip param required' });
    store[ip] = { count: 0, date: todayStr() };
    return res.json({ ok: true, message: `Reset ${ip} — 5 renders restored` });
  }

  // GET /api/admin?key=x&action=reset-all  — reset everyone
  if (action === 'reset-all') {
    Object.keys(store).forEach(k => delete store[k]);
    return res.json({ ok: true, message: 'All limits cleared' });
  }

  // GET /api/admin?key=x&action=block&ip=x.x.x.x  — hard block an IP
  if (action === 'block') {
    if (!ip) return res.status(400).json({ error: 'ip param required' });
    store[ip] = { count: 9999, date: todayStr() };
    return res.json({ ok: true, message: `${ip} blocked for today` });
  }

  return res.status(400).json({ error: 'Unknown action. Use: list, reset, reset-all, block' });
}

module.exports = { renderLimiter, adminRoutes };