-- CreateTable
CREATE TABLE "openf1_sessions" (
    "session_key" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "date_end" TIMESTAMP(3),
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_sessions_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "openf1_laps" (
    "session_key" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_laps_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "openf1_intervals" (
    "session_key" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_intervals_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "openf1_drivers" (
    "session_key" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_drivers_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "openf1_stints" (
    "session_key" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_stints_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "openf1_race_control" (
    "session_key" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_race_control_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "openf1_location" (
    "session_key" INTEGER NOT NULL,
    "driver_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openf1_location_pkey" PRIMARY KEY ("session_key","driver_number")
);

-- CreateTable
CREATE TABLE "driver_timings_cache" (
    "session_key" INTEGER NOT NULL,
    "frames" JSONB NOT NULL,
    "logic_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_timings_cache_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "race_flags_cache" (
    "session_key" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "logic_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "race_flags_cache_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "positions_cache" (
    "session_key" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "logic_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_cache_pkey" PRIMARY KEY ("session_key")
);

-- CreateTable
CREATE TABLE "race_start_cache" (
    "session_key" INTEGER NOT NULL,
    "race_start_ms" BIGINT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "race_start_cache_pkey" PRIMARY KEY ("session_key")
);
