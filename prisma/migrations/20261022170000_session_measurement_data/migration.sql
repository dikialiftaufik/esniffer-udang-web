-- Revisi tabel riwayat dinamis halaman detail batch:
-- setiap tahap (sesi observasi H0, H6, …) punya baris sendiri di tabel
-- riwayat, lengkap dengan suhu udang, berat total udang, dan foto yang
-- dipasangkan lewat modal pra-sesi.
--
-- Suhu/berat sengaja NULLABLE dan tidak berisi nilai karangan: baris sebelum
-- revisi tampil "—" (jujur), kewajiban mengisi tetap di lapisan API/frontend.
-- Kolom grup (lab_temp_c, lab_weight_after_g) tetap dipakai wizard langkah 3.
ALTER TABLE "measurement_sessions" ADD COLUMN "shrimp_temp_c" DECIMAL(5,2);
ALTER TABLE "measurement_sessions" ADD COLUMN "shrimp_weight_g" DECIMAL(8,2);

ALTER TABLE "measurement_sessions"
  ADD CONSTRAINT "measurement_sessions_shrimp_range"
  CHECK (
    "shrimp_temp_c" BETWEEN -2 AND 30
    AND "shrimp_weight_g" > 0
    AND "shrimp_weight_g" <= 2000
  );

-- Foto per tahap: menempel ke satu sesi observasi. ON DELETE SET NULL agar
-- foto tetap milik batch bila sesi dihapus (pola sama dengan group_id).
ALTER TABLE "batch_photos" ADD COLUMN "session_id" VARCHAR(32);
ALTER TABLE "batch_photos"
  ADD CONSTRAINT "batch_photos_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "measurement_sessions"("session_id")
  ON DELETE SET NULL;
CREATE INDEX "batch_photos_session_id_idx" ON "batch_photos"("session_id");
