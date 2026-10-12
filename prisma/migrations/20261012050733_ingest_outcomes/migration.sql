-- CreateTable
CREATE TABLE "ingest_outcomes" (
    "id" UUID NOT NULL,
    "mqtt_device_id" VARCHAR(64) NOT NULL,
    "outcome" VARCHAR(48) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ingest_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingest_outcomes_window_start_idx" ON "ingest_outcomes"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_outcomes_mqtt_device_id_outcome_window_start_key" ON "ingest_outcomes"("mqtt_device_id", "outcome", "window_start");
