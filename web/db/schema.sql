-- Minimal schema for SQL caching + future expansion

CREATE TABLE IF NOT EXISTS kv_cache (
  k VARCHAR(191) NOT NULL PRIMARY KEY,
  v LONGTEXT NOT NULL,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: snapshots table for structured storage if you expand beyond KV
CREATE TABLE IF NOT EXISTS snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  site_id VARCHAR(64) NOT NULL,
  source ENUM('gsc','ga4') NOT NULL,
  range_key VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  ver VARCHAR(16) NOT NULL,
  payload LONGTEXT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_snap (site_id, source, range_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

