/**
 * F1 Global Tour Backend Constants
 * Centralized constants for F1 data processing, caching, and analysis
 */
export const F1_CONSTANTS = {
  /**
   * Cache TTL values in seconds
   * Different data types have different update frequencies
   */
  CACHE_TTL: {
    SESSIONS: 3600, // 1 hour - Sessions rarely change once created
    DRIVERS: 1800, // 30 minutes - Driver info is stable during sessions
    LAPS: 900, // 15 minutes - Lap data is historical, less frequent updates
    TELEMETRY: 600, // 10 minutes - Car data, moderate update frequency
    INTERVALS: 300, // 5 minutes - Real-time intervals, frequent updates
    RACE_CONTROL: 1800, // 30 minutes - Race control messages, moderate updates
    STINTS: 1800, // 30 minutes - Stint data, less frequent updates
  },

  /**
   * OpenF1 API specific values and mappings
   */
  OPENF1: {
    PIT_SEGMENT_VALUE: 2064,
    BASE_URL: 'https://api.openf1.org/v1',

    /**
     * DRS (Drag Reduction System) state mappings
     */
    DRS_STATES: {
      NOT_AVAILABLE: [0, 1],
      AVAILABLE_DISABLED: [8],
      AVAILABLE_ENABLED: [10, 12, 14],
    },

    /**
     * Segment color mappings for mini-sector analysis
     */
    SEGMENT_COLORS: {
      NONE: 0,
      YELLOW: 2048,
      GREEN: 2049,
      PURPLE: 2051,
      PIT: 2064,
    },
  },

  /**
   * Performance analysis thresholds and ranges
   */
  PERFORMANCE: {
    /**
     * Speed ranges for telemetry analysis (km/h)
     */
    SPEED_RANGES: [
      { min: 0, max: 100, label: '0-100 km/h', category: 'low_speed' },
      { min: 100, max: 200, label: '100-200 km/h', category: 'medium_speed' },
      { min: 200, max: 300, label: '200-300 km/h', category: 'high_speed' },
      { min: 300, max: 400, label: '300+ km/h', category: 'very_high_speed' },
    ] as const,

    /**
     * Gear analysis constants
     */
    GEAR_ANALYSIS: {
      MIN_GEAR: 1,
      MAX_GEAR: 8,
      NEUTRAL: 0,
    },

    /**
     * Lap time analysis thresholds (seconds)
     */
    LAP_TIME: {
      CONSISTENCY_THRESHOLD: 2.0, // Standard deviation threshold for consistency
      DEGRADATION_THRESHOLD: 0.5, // Minimum degradation to consider significant (per lap)
      OUTLIER_THRESHOLD: 5.0, // Lap times beyond this are considered outliers
    },

    /**
     * Pit stop analysis constants
     */
    PIT_STOPS: {
      WINDOW_SIZE: 5, // Lap window for identifying pit windows
      MIN_CARS_FOR_WINDOW: 2, // Minimum cars pitting to identify a pit window
      STRATEGIC_SEPARATION: 5, // Laps separation for strategic vs reactive stops
      CLOSE_SEPARATION: 2, // Laps separation for close/reactive stops
    },

    /**
     * Tire degradation analysis
     */
    TIRE_DEGRADATION: {
      BASE_DEGRADATION_RATE: 0.1, // Base degradation per lap
      AGE_MULTIPLIER: 0.05, // Additional degradation per lap of tire age
      COMPOUND_MODIFIERS: {
        SOFT: 1.3, // Soft compounds degrade faster
        MEDIUM: 1.0, // Medium compounds baseline
        HARD: 0.8, // Hard compounds degrade slower
      },
    },
  },

  /**
   * Data validation and limits
   */
  VALIDATION: {
    /**
     * Maximum reasonable values for data validation
     */
    MAX_VALUES: {
      SPEED: 400, // km/h
      RPM: 20000, // Engine RPM
      THROTTLE: 100, // Percentage
      LAP_TIME: 300, // Seconds (5 minutes)
      SESSION_LAPS: 100, // Maximum laps in a session
    },

    /**
     * Minimum required data points for analysis
     */
    MIN_DATA_POINTS: {
      STATISTICS: 3, // Minimum data points for statistical analysis
      TREND_ANALYSIS: 5, // Minimum points for trend analysis
      CONSISTENCY_ANALYSIS: 10, // Minimum laps for consistency analysis
    },
  },

  /**
   * Race control and flag analysis
   */
  RACE_CONTROL: {
    /**
     * Flag keywords for message classification
     */
    FLAG_KEYWORDS: [
      'YELLOW FLAG',
      'RED FLAG',
      'GREEN FLAG',
      'CHEQUERED FLAG',
      'BLUE FLAG',
      'BLACK FLAG',
      'WHITE FLAG',
      'TRACK CLEAR',
    ] as const,

    /**
     * Incident keywords for message classification
     */
    INCIDENT_KEYWORDS: [
      'INCIDENT',
      'COLLISION',
      'SPIN',
      'OFF TRACK',
      'CRASH',
      'CONTACT',
      'DEBRIS',
      'ACCIDENT',
    ] as const,

    /**
     * Safety car keywords
     */
    SAFETY_CAR_KEYWORDS: [
      'SAFETY CAR',
      'VIRTUAL SAFETY CAR',
      'VSC',
      'SC DEPLOYED',
      'SC IN',
      'VSC DEPLOYED',
      'VSC ENDING',
    ] as const,

    /**
     * Penalty keywords
     */
    PENALTY_KEYWORDS: [
      'PENALTY',
      'INVESTIGATION',
      'REPRIMAND',
      'GRID PENALTY',
      'TIME PENALTY',
      'STOP GO',
      'DRIVE THROUGH',
      'DISQUALIFIED',
    ] as const,

    /**
     * DRS keywords
     */
    DRS_KEYWORDS: [
      'DRS',
      'DRAG REDUCTION SYSTEM',
      'DRS ENABLED',
      'DRS DISABLED',
    ] as const,
  },

  /**
   * Logging and debugging configuration
   */
  LOGGING: {
    /**
     * Log levels for different operations
     */
    LEVELS: {
      API_CALLS: 'debug',
      DATA_TRANSFORMATION: 'debug',
      CACHE_OPERATIONS: 'debug',
      ERROR_HANDLING: 'error',
      PERFORMANCE_METRICS: 'log',
    },

    /**
     * Context identifiers for structured logging
     */
    CONTEXTS: {
      SESSIONS: 'SessionsService',
      DRIVERS: 'DriversService',
      LAPS: 'LapsService',
      INTERVALS: 'IntervalsService',
      CAR_DATA: 'CarDataService',
      RACE_CONTROL: 'RaceControlService',
      STINTS: 'StintsService',
      CACHE: 'CacheService',
      OPENF1_CLIENT: 'OpenF1ClientService',
    },
  },

  /**
   * API response configuration
   */
  API: {
    /**
     * Default pagination limits
     */
    PAGINATION: {
      DEFAULT_LIMIT: 50,
      MAX_LIMIT: 1000,
      DEFAULT_OFFSET: 0,
    },

    /**
     * Request timeout values (milliseconds)
     */
    TIMEOUTS: {
      OPENF1_API: 30000, // 30 seconds for OpenF1 API calls
      CACHE_OPERATION: 5000, // 5 seconds for cache operations
      DATABASE_QUERY: 10000, // 10 seconds for database queries
    },

    /**
     * Rate limiting configuration
     */
    RATE_LIMITS: {
      OPENF1_API: {
        REQUESTS_PER_MINUTE: 100,
        BURST_LIMIT: 10,
      },
      CLIENT_API: {
        REQUESTS_PER_MINUTE: 1000,
        BURST_LIMIT: 50,
      },
    },
  },

  /**
   * Circuit and track specific constants
   */
  CIRCUITS: {
    /**
     * Track length approximations for lap time validation
     */
    TYPICAL_LAP_TIMES: {
      MIN: 60, // Shortest lap time in seconds
      MAX: 120, // Longest lap time in seconds (excluding outliers)
      AVERAGE: 90, // Typical F1 lap time
    },

    /**
     * DRS zone typical characteristics
     */
    DRS_ZONES: {
      TYPICAL_COUNT: 2, // Most circuits have 2 DRS zones
      MIN_ACTIVATION_TIME: 1, // Minimum DRS activation time (seconds)
      MAX_ACTIVATION_TIME: 15, // Maximum DRS activation time (seconds)
    },
  },
} as const;

/**
 * Type definitions for F1 constants
 */
export type F1ConstantsType = typeof F1_CONSTANTS;
export type CacheTTLKeys = keyof typeof F1_CONSTANTS.CACHE_TTL;
export type SpeedCategory =
  (typeof F1_CONSTANTS.PERFORMANCE.SPEED_RANGES)[number]['category'];
export type LogContext =
  (typeof F1_CONSTANTS.LOGGING.CONTEXTS)[keyof typeof F1_CONSTANTS.LOGGING.CONTEXTS];

/**
 * Helper functions for working with constants
 */
export class F1ConstantsHelper {
  /**
   * Get cache TTL for a specific data type
   */
  static getCacheTTL(dataType: CacheTTLKeys): number {
    return F1_CONSTANTS.CACHE_TTL[dataType];
  }

  /**
   * Categorize speed based on predefined ranges
   */
  static categorizeSpeed(speed: number): SpeedCategory {
    const range = F1_CONSTANTS.PERFORMANCE.SPEED_RANGES.find(
      (r) => speed >= r.min && speed < r.max,
    );
    return range ? range.category : 'very_high_speed';
  }

  /**
   * Check if a value is within reasonable limits for validation
   */
  static isValidSpeed(speed: number): boolean {
    return speed >= 0 && speed <= F1_CONSTANTS.VALIDATION.MAX_VALUES.SPEED;
  }

  static isValidRPM(rpm: number): boolean {
    return rpm >= 0 && rpm <= F1_CONSTANTS.VALIDATION.MAX_VALUES.RPM;
  }

  static isValidLapTime(lapTime: number): boolean {
    return (
      lapTime > 0 && lapTime <= F1_CONSTANTS.VALIDATION.MAX_VALUES.LAP_TIME
    );
  }

  /**
   * Check if we have sufficient data points for analysis
   */
  static hasSufficientDataForStatistics(dataPoints: number): boolean {
    return dataPoints >= F1_CONSTANTS.VALIDATION.MIN_DATA_POINTS.STATISTICS;
  }

  static hasSufficientDataForTrends(dataPoints: number): boolean {
    return dataPoints >= F1_CONSTANTS.VALIDATION.MIN_DATA_POINTS.TREND_ANALYSIS;
  }

  static hasSufficientDataForConsistency(dataPoints: number): boolean {
    return (
      dataPoints >= F1_CONSTANTS.VALIDATION.MIN_DATA_POINTS.CONSISTENCY_ANALYSIS
    );
  }
}
