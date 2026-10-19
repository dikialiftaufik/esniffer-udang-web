-- Revisi pembimbing putaran 2 butir 6: supermarket sebagai pilihan
-- jenis sumber udang. ADD VALUE bersifat mundur-sinkron; klien lama
-- yang tidak mengirim nilai ini tidak terpengaruh.
ALTER TYPE "CollectionSourceType" ADD VALUE IF NOT EXISTS 'SUPERMARKET';
