-- Revisi pembimbing putaran 2 butir 2: foto bisa menempel ke grup tertentu
-- (foto dokumentasi per grup di step pengelompokan). NULL = foto batch
-- (pengadaan), perilaku lama tidak berubah.
--
-- ON DELETE SET NULL: bila sebuah grup dihapus, fotonya tidak ikut hilang
-- melainkan kembali menjadi foto batch biasa.
ALTER TABLE "batch_photos" ADD COLUMN "group_id" VARCHAR(24);

ALTER TABLE "batch_photos"
  ADD CONSTRAINT "batch_photos_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "sample_groups"("group_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "batch_photos_batch_id_group_id_idx" ON "batch_photos"("batch_id", "group_id");
