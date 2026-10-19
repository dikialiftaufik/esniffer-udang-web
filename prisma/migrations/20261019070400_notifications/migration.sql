-- Revisi pembimbing putaran 2 butir 9: tabel notifikasi lonceng header.
--
-- Idempotensi "satu sesi hanya satu notifikasi stabil" ditegakkan UNIQUE
-- (session_id, kind): Postgres memperlakukan NULL sebagai saling berbeda,
-- sehingga notifikasi tanpa sesi (jenis lain ke depannya) tetap boleh
-- berulang — perilaku partial index tanpa SQL tambahan.
CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "batch_id" VARCHAR(16),
  "session_id" VARCHAR(32),
  "kind" VARCHAR(40) NOT NULL,
  "message" VARCHAR(200) NOT NULL,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notifications_session_id_kind_key" ON "notifications"("session_id", "kind");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "collection_batches"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "measurement_sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;
