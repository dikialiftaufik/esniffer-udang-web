-- Revisi pembimbing putaran 2 butir 7: suhu cool box dipecah menjadi dua
-- titik pengukuran, di pasar dan di lab (bukan lagi rentang min-max).
-- Kolom di-rename; makna data lama (min → saat di pasar, max → saat di lab)
-- adalah asumsi migrasi terbaik yang tersedia dan dicatat di panduan.
-- CHECK collection_batches_cooler_range ikut rename otomatis (referensi by
-- attnum), jadi batas 0-4 °C tetap berlaku pada kedua kolom baru.
ALTER TABLE "collection_batches" RENAME COLUMN "cooler_temp_min_c" TO "cooler_temp_market_c";
ALTER TABLE "collection_batches" RENAME COLUMN "cooler_temp_max_c" TO "cooler_temp_lab_c";
