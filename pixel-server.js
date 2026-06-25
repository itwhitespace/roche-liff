/**
 * =====================================================================
 *  Roche LIFF — Invisible Tracking Pixel Server
 *  ไฟล์: pixel-server.js
 *
 *  รัน:  node pixel-server.js
 *  Port: 3000 (หรือกำหนดผ่าน ENV: PORT=xxxx)
 *
 *  Endpoint:
 *    GET /pixel?user_id=Uxxxxxxxx&content_id=...&campaign_name=...
 *    → คืน 1×1 Transparent GIF
 *    → บันทึกข้อมูลลง Database ตาราง flex_impressions
 *
 *  ไม่ต้องติดตั้ง package เพิ่มเติม — ใช้ Node.js built-in เท่านั้น
 * =====================================================================
 */

"use strict";

const http  = require("http");
const https = require("https");
const path  = require("path");
const fs    = require("fs");

// ─── Database Config (ชุดเดิมจาก index.html) ───────────────────────────────
const DATABASE_PROJECT_ID = "knkcassjktpolmpdfqfb";
const DATABASE_BASE_URL   = `https://${DATABASE_PROJECT_ID}.supabase.co`;
const DATABASE_ANON_KEY   =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtua2Nhc3Nqa3Rwb2xtcGRmcWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjQxMDAsImV4cCI6MjA5Nzg0MDEwMH0." +
  "SGUaY4AiCV70Wj4UdxZP3pf7RHFT-E1HBGFPXFkCLvg";

// ─── 1×1 Transparent GIF (Base64 → Buffer) ──────────────────────────────────
// GIF89a พิกเซลโปร่งใส มาตรฐาน ขนาด 35 bytes
const TRANSPARENT_GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const TRANSPARENT_GIF_BUF = Buffer.from(TRANSPARENT_GIF_B64, "base64");

// ─── ส่งข้อมูลไป Database (Node built-in https) ─────────────────────────────
function insertImpression(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const reqOptions = {
      hostname: `${DATABASE_PROJECT_ID}.supabase.co`,
      path: "/rest/v1/flex_impressions",
      method: "POST",
      headers: {
        "apikey":        DATABASE_ANON_KEY,
        "Authorization": `Bearer ${DATABASE_ANON_KEY}`,
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Prefer":        "return=minimal"
      }
    };

    const req = https.request(reqOptions, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode });
        } else {
          resolve({ ok: false, status: res.statusCode, body: raw });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(4000, () => {
      req.destroy(new Error("Database request timeout"));
    });
    req.write(body);
    req.end();
  });
}

// ─── ส่งไฟล์ Static (HTML, CSS, JS) ─────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".json": "application/json"
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not Found");
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = new URL(req.url, `http://localhost`);
  const pathname = parsed.pathname;
  const query    = Object.fromEntries(parsed.searchParams);

  // ── CORS headers (สำหรับ LINE เรียกจาก domain อื่น) ──
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  // ── Preflight ──
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // ── Endpoint: GET /pixel ───────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/pixel") {

    // แกะค่า query params
    const userId       = (query.user_id       || "").trim();
    const contentId    = (query.content_id    || "unknown").trim();
    const campaignName = (query.campaign_name || "").trim();
    const senderId     = (query.sender_id     || "").trim();

    // บันทึกข้อมูลลง Database (Fire-and-forget — ไม่ block การส่งภาพกลับ)
    if (userId) {
      const payload = {
        user_id:       userId,
        content_id:    contentId,
        campaign_name: campaignName,
        sender_id:     senderId
        // created_at ถูกตั้งค่า DEFAULT now() ใน Database schema อัตโนมัติ
      };

      insertImpression(payload)
        .then((result) => {
          if (!result.ok) {
            console.warn(`[pixel] Database error ${result.status}:`, result.body);
          } else {
            console.log(`[pixel] ✅ Impression logged — user_id: ${userId} | content_id: ${contentId}`);
          }
        })
        .catch((err) => {
          console.error("[pixel] Database request failed:", err.message);
        });
    } else {
      console.warn("[pixel] ⚠️  Request received without user_id");
    }

    // คืนรูป 1×1 Transparent GIF ทันที (ไม่รอ Database)
    res.writeHead(200, {
      "Content-Type":    "image/gif",
      "Content-Length":  TRANSPARENT_GIF_BUF.length,
      "Cache-Control":   "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma":          "no-cache",
      "Expires":         "0",
      "X-Pixel-Status":  userId ? "tracked" : "skipped"
    });
    return res.end(TRANSPARENT_GIF_BUF);
  }

  // ── Endpoint: GET /health ─────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
  }

  // ── Static Files: /index.html, /register.html, ฯลฯ ─────────────────────
  const staticBase = __dirname;
  let filePath = path.join(staticBase, pathname === "/" ? "index.html" : pathname);

  // ป้องกัน Path Traversal Attack
  if (!filePath.startsWith(staticBase)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }

  return serveStatic(res, filePath);
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("=================================================");
  console.log(`  🔎 Roche Tracking Pixel Server is running`);
  console.log(`  📡 http://localhost:${PORT}`);
  console.log(`  🖼️  Pixel endpoint: http://localhost:${PORT}/pixel?user_id=Uxxxxx&content_id=xxx`);
  console.log(`  ❤️  Health check:   http://localhost:${PORT}/health`);
  console.log("=================================================");
});
