-- Revisi pembimbing putaran 2 butir 1: membedakan kelompok dingin dalam
-- chamber (wadah berisi chamber) vs langsung di kulkas (plain fridge).
--
-- Backfill jujur: baris COLD lama yang chamber_id-nya kosong berarti udang
-- memang diletakkan langsung di kulkas, diisi PLAIN_FRIDGE. Baris lain
-- (termasuk ROOM_TEMP) mendapat default CHAMBER tanpa perubahan makna.
CREATE TYPE "ColdStorageMode" AS ENUM ('CHAMBER', 'PLAIN_FRIDGE');

ALTER TABLE "sample_groups"
  ADD COLUMN "cold_storage_mode" "ColdStorageMode" NOT NULL DEFAULT 'CHAMBER';

UPDATE "sample_groups"
  SET "cold_storage_mode" = 'PLAIN_FRIDGE'
  WHERE "storage_condition" = 'COLD' AND "chamber_id" IS NULL;

-- Aturan ke depan (Prisma tidak mendukung CHECK lintas-field, mengikuti pola
-- 20260930_init): PLAIN_FRIDGE wajib tanpa chamber.
--
-- SESENGAJA TANPA CHECK "COLD+CHAMBER wajib chamber": grup dingin dibuat di
-- wizard tanpa chamber lalu ditautkan ke chamber saat sesi dibuat, jadi
-- chamber_id kosong adalah keadaan sah antara wizard dan penugasan. Aturan
-- "sesi butuh chamber" ditegakkan di lapisan API saat sesi dibuat/dijalankan.
ALTER TABLE "sample_groups"
  ADD CONSTRAINT "sample_groups_plain_fridge_no_chamber"
  CHECK ("cold_storage_mode" <> 'PLAIN_FRIDGE' OR "chamber_id" IS NULL);
