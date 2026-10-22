-- Revisi wizard: kolom keberangkatan dikembalikan.
--
-- Kolom ini pernah dihapus di 20261009041827 (keputusan D-04: "cukup waktu
-- beli dan waktu tiba"). Kini keberangkatan dicatat lagi karena alat perlu
-- titik awal perjalanan sekaligus suhu cool box sebelum berangkat.
--
-- Kedua kolom sengaja NULLABLE:
-- - baris lama tidak direkayasa (tidak diisi nilai karangan);
-- - CHECK di bawah lolos untuk NULL (three-valued logic), sehingga data
--   historis tetap valid dan ekspor CSV hanya mengosongkan selnya;
-- - kewajiban mengisi ditegakkan di lapisan API untuk batch baru.
ALTER TABLE "collection_batches" ADD COLUMN "departed_at_utc" TIMESTAMPTZ(3);
ALTER TABLE "collection_batches" ADD COLUMN "cooler_temp_departure_c" DECIMAL(5,2);

-- Urutan perjalanan: berangkat < beli. Batas beli < tiba sudah dijaga oleh
-- constraint collection_batches_arrival_after_purchase.
ALTER TABLE "collection_batches"
  ADD CONSTRAINT "collection_batches_departure_before_purchase"
  CHECK ("departed_at_utc" < "procured_at_utc");

-- Rentang suhu cool box diperlebar dari 0..4 menjadi -10..10 derajat Celsius
-- (revisi pembimbing: es dapat menurunkan suhu di bawah 0 dan kotak bisa
-- sempat menghangat di atas 4 saat perjalanan). Constraint lama menyebut
-- kolom market/lab; diganti agar ketiga titik ukur memakai batas yang sama.
ALTER TABLE "collection_batches" DROP CONSTRAINT "collection_batches_cooler_range";
ALTER TABLE "collection_batches"
  ADD CONSTRAINT "collection_batches_cooler_range"
  CHECK (
    "cooler_temp_departure_c" BETWEEN -10 AND 10
    AND "cooler_temp_market_c" BETWEEN -10 AND 10
    AND "cooler_temp_lab_c" BETWEEN -10 AND 10
  );
