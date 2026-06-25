/**
 * =====================================================================
 *  Vercel Serverless Function — Invisible Tracking Pixel
 *  ไฟล์: api/pixel.js
 *
 *  URL บน Vercel: https://your-project.vercel.app/pixel
 *  (rewrite จาก vercel.json)
 *
 *  Query params:
 *    user_id       — LINE userId ของผู้รับ (required)
 *    content_id    — รหัสเนื้อหา (optional)
 *    campaign_name — ชื่อแคมเปญ (optional)
 *    sender_id     — รหัสผู้ส่ง/broadcast (optional)
 * =====================================================================
 */

"use strict";

const https = require("https");

// ─── Supabase Config (ชุดเดิมจาก index.html) ───────────────────────────────
const SUPABASE_PROJECT_ID = "knkcassjktpolmpdfqfb";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtua2Nhc3Nqa3Rwb2xtcGRmcWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjQxMDAsImV4cCI6MjA5Nzg0MDEwMH0." +
  "SGUaY4AiCV70Wj4UdxZP3pf7RHFT-E1HBGFPXFkCLvg";

// ─── 1×1 Transparent GIF ────────────────────────────────────────────────────
const TRANSPARENT_GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const TRANSPARENT_GIF_BUF = Buffer.from(TRANSPARENT_GIF_B64, "base64");

// ─── Insert ข้อมูลไป Supabase ───────────────────────────────────────────────
function insertImpression(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const reqOptions = {
      hostname: `${SUPABASE_PROJECT_ID}.supabase.co`,
      path: "/rest/v1/flex_impressions",
      method: "POST",
      headers: {
        "apikey":         SUPABASE_ANON_KEY,
        "Authorization":  `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Prefer":         "return=minimal"
      }
    };

    const req = https.request(reqOptions, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, status: res.statusCode, body: raw });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Supabase timeout")));
    req.write(body);
    req.end();
  });
}

// ─── Vercel Serverless Handler ────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS — อนุญาต LINE server โหลดรูป
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // รับเฉพาะ GET
  if (req.method !== "GET") {
    return res.status(405).end("Method Not Allowed");
  }

  // แกะ query params (Vercel parse ให้อัตโนมัติใน req.query)
  const userId       = (req.query.user_id       || "").trim();
  const contentId    = (req.query.content_id    || "unknown").trim();
  const campaignName = (req.query.campaign_name || "").trim();
  const senderId     = (req.query.sender_id     || "").trim();

  // บันทึก Impression ลง Supabase (fire-and-forget)
  if (userId) {
    insertImpression({
      user_id:       userId,
      content_id:    contentId,
      campaign_name: campaignName,
      sender_id:     senderId
    })
      .then((result) => {
        if (!result.ok) {
          console.warn(`[pixel] Supabase error ${result.status}:`, result.body);
        } else {
          console.log(`[pixel] ✅ ${userId} | ${contentId} | ${campaignName}`);
        }
      })
      .catch((err) => console.error("[pixel] Supabase failed:", err.message));
  } else {
    console.warn("[pixel] ⚠️  Request without user_id");
  }

  // ส่ง 1×1 Transparent GIF กลับทันที — ไม่รอ Supabase
  res.setHeader("Content-Type",   "image/gif");
  res.setHeader("Content-Length", TRANSPARENT_GIF_BUF.length);
  res.setHeader("Cache-Control",  "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma",         "no-cache");
  res.setHeader("Expires",        "0");
  res.setHeader("X-Pixel-Status", userId ? "tracked" : "skipped");

  return res.status(200).end(TRANSPARENT_GIF_BUF);
};
