import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import {
  DriversQueryParams,
  CarDataQueryParams,
  LapsQueryParams,
} from '../../common/interfaces/query-params.interface';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  async getSessionDrivers(sessionKey: number) {
    try {
      const params: DriversQueryParams = { session_key: sessionKey };

      this.logger.debug(`Fetching drivers for session ${sessionKey}`);
      const drivers = await this.cachedOpenf1Client.fetchDrivers(params);

      // Transform driver data for frontend
      const transformedDrivers = drivers.map((driver) => ({
        number: driver.driver_number,
        name: driver.name_acronym,
        fullName: driver.full_name,
        team: driver.team_name,
        teamColor: `#${driver.team_colour}`,
        sessionKey: driver.session_key,
        meetingKey: driver.meeting_key,
      }));

      this.logger.log(
        `Retrieved ${transformedDrivers.length} drivers for session ${sessionKey}`,
      );
      return transformedDrivers;
    } catch (error) {
      this.logger.error(`Error fetching session drivers:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch session drivers',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDriverTelemetry(
    sessionKey: number,
    driverNumber: number,
    dateStart?: string,
    dateEnd?: string,
  ) {
    try {
      const params: CarDataQueryParams = {
        session_key: sessionKey,
        driver_number: driverNumber,
        ...(dateStart && { date_start: dateStart }),
        ...(dateEnd && { date_end: dateEnd }),
      };

      this.logger.debug(
        `Fetching telemetry for driver ${driverNumber} in session ${sessionKey}`,
      );
      const carData = await this.cachedOpenf1Client.fetchCarData(params);

      // Transform telemetry data
      const transformedTelemetry = carData.map((data) => ({
        timestamp: data.date,
        speed: data.speed,
        throttle: data.throttle,
        brake: data.brake,
        gear: data.n_gear,
        drs: {
          value: data.drs,
          enabled: this.transformDRS(data.drs).enabled,
          available: this.transformDRS(data.drs).available,
        },
        driverNumber: data.driver_number,
        sessionKey: data.session_key,
      }));

      this.logger.log(
        `Retrieved ${transformedTelemetry.length} telemetry points for driver ${driverNumber}`,
      );
      return transformedTelemetry;
    } catch (error) {
      this.logger.error(`Error fetching driver telemetry:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch driver telemetry',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDriverLaps(
    sessionKey: number,
    driverNumber: number,
    lapNumber?: number,
  ) {
    try {
      const params: LapsQueryParams = {
        session_key: sessionKey,
        driver_number: driverNumber,
        ...(lapNumber && { lap_number: lapNumber }),
      };

      this.logger.debug(
        `Fetching laps for driver ${driverNumber} in session ${sessionKey}`,
      );
      const laps = await this.cachedOpenf1Client.fetchLaps(params);

      // Transform lap data
      const transformedLaps = laps.map((lap) => ({
        lapNumber: lap.lap_number,
        lapTime: lap.lap_duration,
        sectors: {
          sector1: lap.duration_sector_1,
          sector2: lap.duration_sector_2,
          sector3: lap.duration_sector_3,
        },
        speeds: {
          i1Speed: lap.i1_speed,
          i2Speed: lap.i2_speed,
        },
        isPitOutLap: lap.is_pit_out_lap,
        isDNF: lap.lap_duration === null,
        segments: {
          sector1: lap.segments_sector_1 || [],
          sector2: lap.segments_sector_2 || [],
          sector3: lap.segments_sector_3 || [],
        },
        timestamp: lap.date_start,
        driverNumber: lap.driver_number,
        sessionKey: lap.session_key,
      }));

      this.logger.log(
        `Retrieved ${transformedLaps.length} laps for driver ${driverNumber}`,
      );
      return transformedLaps;
    } catch (error) {
      this.logger.error(`Error fetching driver laps:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch driver laps',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDriverInfo(sessionKey: number, driverNumber: number) {
    try {
      // Get driver basic info
      const drivers = await this.getSessionDrivers(sessionKey);
      const driver = drivers.find((d) => d.number === driverNumber);

      if (!driver) {
        throw new HttpException(
          `Driver ${driverNumber} not found in session ${sessionKey}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Get driver's lap count and performance stats
      const laps = await this.getDriverLaps(sessionKey, driverNumber);
      const completedLaps = laps.filter((lap) => !lap.isDNF);

      const performanceStats = {
        totalLaps: laps.length,
        completedLaps: completedLaps.length,
        bestLapTime:
          completedLaps.length > 0
            ? Math.min(
                ...completedLaps
                  .map((lap) => lap.lapTime)
                  .filter((time): time is number => time !== null),
              )
            : null,
        averageLapTime:
          completedLaps.length > 0
            ? completedLaps.reduce((sum, lap) => sum + (lap.lapTime || 0), 0) /
              completedLaps.length
            : null,
      };

      return {
        ...driver,
        performance: performanceStats,
        sessionKey,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error fetching driver info:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch driver info',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private transformDRS(drsValue: number): {
    enabled: boolean;
    available: boolean;
  } {
    // DRS transformation logic based on OpenF1 documentation
    const DRS_MAPPING: Record<
      number,
      { enabled: boolean; available: boolean }
    > = {
      0: { enabled: false, available: false },
      1: { enabled: false, available: false },
      8: { enabled: false, available: true },
      10: { enabled: true, available: true },
      12: { enabled: true, available: true },
      14: { enabled: true, available: true },
    };

    return DRS_MAPPING[drsValue] || { enabled: false, available: false };
  }
}
