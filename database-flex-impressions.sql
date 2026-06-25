-- =====================================================================
--  Database SQL: สร้างตาราง flex_impressions
--  รันใน Database Dashboard → SQL Editor
-- =====================================================================

-- สร้างตาราง
CREATE TABLE IF NOT EXISTS public.flex_impressions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       text        NOT NULL,
  content_id    text        DEFAULT 'unknown',
  campaign_name text        DEFAULT '',
  sender_id     text        DEFAULT '',
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Index สำหรับ query เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_flex_impressions_user_id
  ON public.flex_impressions (user_id);

CREATE INDEX IF NOT EXISTS idx_flex_impressions_content_id
  ON public.flex_impressions (content_id);

CREATE INDEX IF NOT EXISTS idx_flex_impressions_created_at
  ON public.flex_impressions (created_at DESC);

-- เปิด Row Level Security
ALTER TABLE public.flex_impressions ENABLE ROW LEVEL SECURITY;

-- Policy: อนุญาตให้ anon key INSERT ได้ (สำหรับ Pixel Server)
CREATE POLICY "Allow anon insert flex_impressions"
  ON public.flex_impressions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: อนุญาตให้ authenticated SELECT ได้ (สำหรับ Admin Dashboard)
CREATE POLICY "Allow authenticated select flex_impressions"
  ON public.flex_impressions
  FOR SELECT
  TO authenticated
  USING (true);

-- Comment
COMMENT ON TABLE public.flex_impressions IS
  'บันทึก Impression จาก LINE Flex Message Tracking Pixel — แต่ละแถวคือ 1 ครั้งที่ผู้ใช้เปิดอ่านข้อความ';
