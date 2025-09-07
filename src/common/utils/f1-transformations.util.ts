/**
 * Utility class for F1 data transformations
 * Contains all shared transformation logic used across multiple services
 */
export class F1TransformationsUtil {
  /**
   * DRS (Drag Reduction System) value mappings
   * Based on OpenF1 API documentation
   */
  private static readonly DRS_MAPPING = {
    0: { enabled: false, available: false },   // DRS not available
    1: { enabled: false, available: false },   // DRS not available (alternative)
    8: { enabled: false, available: true },    // DRS available but not enabled
    10: { enabled: true, available: true },    // DRS enabled and available
    12: { enabled: true, available: true },    // DRS enabled and available (alternative)
    14: { enabled: true, available: true },    // DRS enabled and available (alternative)
  } as const;

  /**
   * Segment value mappings for mini-sector analysis
   * These values represent different types of sector performance
   */
  private static readonly SEGMENT_MAPPING = {
    0: { color: 'none', meaning: 'not available', performance: 'neutral' },
    2048: { color: 'yellow', meaning: 'yellow sector', performance: 'neutral' },
    2049: { color: 'green', meaning: 'green sector', performance: 'best' },
    2051: { color: 'purple', meaning: 'purple sector', performance: 'personal_best' },
    2064: { color: 'pit', meaning: 'pitlane', performance: 'pit' },
  } as const;

  /**
   * Pit lane segment value - used to detect pit lane activity
   */
  public static readonly PIT_SEGMENT_VALUE = 2064;

  /**
   * Transform DRS value to enabled/available state
   * @param drsValue - Raw DRS value from OpenF1 API
   * @returns Object with enabled and available boolean states
   */
  static transformDRS(drsValue: number | null): { enabled: boolean; available: boolean } {
    if (drsValue === null || drsValue === undefined) {
      return { enabled: false, available: false };
    }
    
    return this.DRS_MAPPING[drsValue] || { enabled: false, available: false };
  }

  /**
   * Transform segment array to meaningful segment information
   * @param segments - Array of segment values
   * @returns Array of transformed segment objects
   */
  static transformSegments(segments: number[] | null): TransformedSegment[] {
    if (!segments || !Array.isArray(segments)) {
      return [];
    }

    return segments.map(segment => ({
      value: segment,
      ...this.SEGMENT_MAPPING[segment] || { 
        color: 'unknown', 
        meaning: 'unknown segment', 
        performance: 'neutral' 
      },
    }));
  }

  /**
   * Detect if any segment indicates pit lane activity
   * @param segments - Array of segment values (can be from multiple sectors)
   * @returns True if pit lane activity detected
   */
  static detectPitLane(...segmentArrays: (number[] | null)[]): boolean {
    const allSegments = segmentArrays
      .filter(segments => segments !== null && Array.isArray(segments))
      .flat() as number[];
    
    return allSegments.includes(this.PIT_SEGMENT_VALUE);
  }

  /**
   * Analyze sectors to detect pit out lap
   * Pit out laps typically have specific segment patterns
   * @param sector1 - Sector 1 segments
   * @param sector2 - Sector 2 segments  
   * @param sector3 - Sector 3 segments
   * @returns True if this appears to be a pit out lap
   */
  static detectPitOutLap(
    sector1: number[] | null, 
    sector2: number[] | null, 
    sector3: number[] | null
  ): boolean {
    // Pit out laps often have pit segments in sector 1 or early sectors
    return this.detectPitLane(sector1) || 
           (this.detectPitLane(sector2) && !this.detectPitLane(sector3));
  }

  /**
   * Determine overall sector performance based on segments
   * @param segments - Segment array for a sector
   * @returns Best performance type found in the sector
   */
  static analyzeSectorPerformance(segments: number[] | null): SectorPerformance {
    if (!segments || !Array.isArray(segments)) {
      return 'neutral';
    }

    const transformedSegments = this.transformSegments(segments);
    
    // Priority order: personal_best > best > neutral > pit
    if (transformedSegments.some(s => s.performance === 'personal_best')) {
      return 'personal_best';
    }
    if (transformedSegments.some(s => s.performance === 'best')) {
      return 'best';
    }
    if (transformedSegments.some(s => s.performance === 'pit')) {
      return 'pit';
    }
    
    return 'neutral';
  }

  /**
   * Transform complete lap data with all segment analysis
   * @param lapData - Raw lap data from OpenF1 API
   * @returns Transformed lap data with segment analysis
   */
  static transformLapData(lapData: any): TransformedLapData {
    const sector1Segments = this.transformSegments(lapData.segments_sector_1);
    const sector2Segments = this.transformSegments(lapData.segments_sector_2);
    const sector3Segments = this.transformSegments(lapData.segments_sector_3);

    const isPitLane = this.detectPitLane(
      lapData.segments_sector_1,
      lapData.segments_sector_2, 
      lapData.segments_sector_3
    );

    const isPitOutLap = this.detectPitOutLap(
      lapData.segments_sector_1,
      lapData.segments_sector_2,
      lapData.segments_sector_3
    );

    return {
      lapNumber: lapData.lap_number,
      lapTime: lapData.lap_duration ? this.convertTimeToSeconds(lapData.lap_duration) : null,
      sectors: {
        sector1: lapData.duration_sector_1,
        sector2: lapData.duration_sector_2,
        sector3: lapData.duration_sector_3,
      },
      speeds: {
        i1Speed: lapData.speed_i1,
        i2Speed: lapData.speed_i2,
        flSpeed: lapData.speed_fl,
        stSpeed: lapData.speed_st,
      },
      isPitOutLap,
      isDNF: !lapData.lap_duration,
      isPitLane,
      segments: {
        sector1: sector1Segments,
        sector2: sector2Segments,
        sector3: sector3Segments,
      },
      sectorPerformance: {
        sector1: this.analyzeSectorPerformance(lapData.segments_sector_1),
        sector2: this.analyzeSectorPerformance(lapData.segments_sector_2),
        sector3: this.analyzeSectorPerformance(lapData.segments_sector_3),
      },
      timestamp: lapData.date_start,
      driverNumber: lapData.driver_number,
      sessionKey: lapData.session_key,
      meetingKey: lapData.meeting_key,
    };
  }

  /**
   * Transform driver data with team information
   * @param driverData - Raw driver data from OpenF1 API
   * @returns Transformed driver data
   */
  static transformDriverData(driverData: any): TransformedDriver {
    return {
      number: driverData.driver_number,
      name: driverData.name_acronym,
      fullName: driverData.full_name,
      team: driverData.team_name,
      teamColor: driverData.team_colour,
      countryCode: driverData.country_code,
      headShotUrl: driverData.headshot_url,
      sessionKey: driverData.session_key,
      meetingKey: driverData.meeting_key,
    };
  }

  /**
   * Transform car telemetry data with DRS analysis
   * @param carData - Raw car data from OpenF1 API
   * @returns Transformed car data
   */
  static transformCarData(carData: any): TransformedCarData {
    return {
      timestamp: carData.date,
      driverNumber: carData.driver_number,
      speed: carData.speed,
      rpm: carData.rpm,
      gear: carData.n_gear,
      throttle: carData.throttle,
      brake: carData.brake,
      drs: {
        value: carData.drs,
        ...this.transformDRS(carData.drs),
      },
      sessionKey: carData.session_key,
      meetingKey: carData.meeting_key,
    };
  }

  /**
   * Convert time string to seconds (shared utility)
   * @param timeString - Time string in various formats
   * @returns Time in seconds or null if invalid
   */
  private static convertTimeToSeconds(timeString: string | null): number | null {
    if (!timeString || timeString === '0:00:00' || timeString.includes('null')) {
      return null;
    }

    try {
      const parts = timeString.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseFloat(parts[2]);
        return hours * 3600 + minutes * 60 + seconds;
      }
      
      return parseFloat(timeString) || null;
    } catch {
      return null;
    }
  }
}

// Type definitions for transformed data
export interface TransformedSegment {
  value: number;
  color: string;
  meaning: string;
  performance: SectorPerformance;
}

export type SectorPerformance = 'personal_best' | 'best' | 'neutral' | 'pit';

export interface TransformedLapData {
  lapNumber: number;
  lapTime: number | null;
  sectors: {
    sector1: number | null;
    sector2: number | null;
    sector3: number | null;
  };
  speeds: {
    i1Speed: number | null;
    i2Speed: number | null;
    flSpeed: number | null;
    stSpeed: number | null;
  };
  isPitOutLap: boolean;
  isDNF: boolean;
  isPitLane: boolean;
  segments: {
    sector1: TransformedSegment[];
    sector2: TransformedSegment[];
    sector3: TransformedSegment[];
  };
  sectorPerformance: {
    sector1: SectorPerformance;
    sector2: SectorPerformance;
    sector3: SectorPerformance;
  };
  timestamp: string;
  driverNumber: number;
  sessionKey: number;
  meetingKey: number;
}

export interface TransformedDriver {
  number: number;
  name: string;
  fullName: string;
  team: string;
  teamColor: string;
  countryCode: string;
  headShotUrl: string;
  sessionKey: number;
  meetingKey: number;
}

export interface TransformedCarData {
  timestamp: string;
  driverNumber: number;
  speed: number | null;
  rpm: number | null;
  gear: number | null;
  throttle: number | null;
  brake: boolean | null;
  drs: {
    value: number | null;
    enabled: boolean;
    available: boolean;
  };
  sessionKey: number;
  meetingKey: number;
}