import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { LapsQueryParams } from '../../common/interfaces/query-params.interface';

@Injectable()
export class LapsService {
  private readonly logger = new Logger(LapsService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  async getSessionLaps(sessionKey: number, lapNumber?: number) {
    try {
      const params: LapsQueryParams = {
        session_key: sessionKey,
        ...(lapNumber && { lap_number: lapNumber }),
      };

      this.logger.debug(`Fetching laps for session ${sessionKey}`);
      const laps = await this.cachedOpenf1Client.fetchLaps(params);

      const transformedLaps = laps.map((lap) => this.transformLapData(lap));

      this.logger.log(
        `Retrieved ${transformedLaps.length} laps for session ${sessionKey}`,
      );
      return transformedLaps;
    } catch (error) {
      this.logger.error(`Error fetching session laps:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch session laps',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getSpecificLap(sessionKey: number, lapNumber: number) {
    try {
      const params: LapsQueryParams = {
        session_key: sessionKey,
        lap_number: lapNumber,
      };

      this.logger.debug(`Fetching lap ${lapNumber} for session ${sessionKey}`);
      const laps = await this.cachedOpenf1Client.fetchLaps(params);

      if (laps.length === 0) {
        throw new HttpException(
          `Lap ${lapNumber} not found in session ${sessionKey}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const transformedLaps = laps.map((lap) => this.transformLapData(lap));

      // Group by driver for specific lap comparison
      const lapByDriver = transformedLaps.reduce(
        (acc, lap) => {
          acc[lap.driverNumber] = lap;
          return acc;
        },
        {} as Record<number, any>,
      );

      return {
        lapNumber,
        sessionKey,
        drivers: lapByDriver,
        totalDrivers: Object.keys(lapByDriver).length,
      };
    } catch (error) {
      this.logger.error(`Error fetching specific lap:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch specific lap',
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

      const transformedLaps = laps.map((lap) => this.transformLapData(lap));

      // Add progressive data for driver analysis
      const progressiveLaps = this.addProgressiveAnalysis(transformedLaps);

      this.logger.log(
        `Retrieved ${progressiveLaps.length} laps for driver ${driverNumber}`,
      );
      return progressiveLaps;
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

  async getFastestLaps(sessionKey: number, limit: number = 10) {
    try {
      this.logger.debug(`Fetching fastest laps for session ${sessionKey}`);
      const allLaps = await this.getSessionLaps(sessionKey);

      // Filter out DNF laps and sort by lap time
      const completedLaps = allLaps
        .filter((lap) => !lap.isDNF && lap.lapTime)
        .sort((a, b) => a.lapTime - b.lapTime)
        .slice(0, limit);

      // Add ranking information
      const rankedLaps = completedLaps.map((lap, index) => ({
        ...lap,
        position: index + 1,
        gapToFirst: index === 0 ? 0 : lap.lapTime - completedLaps[0].lapTime,
      }));

      this.logger.log(`Retrieved ${rankedLaps.length} fastest laps`);
      return rankedLaps;
    } catch (error) {
      this.logger.error(`Error fetching fastest laps:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch fastest laps',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getLapAnalysis(sessionKey: number) {
    try {
      this.logger.debug(`Performing lap analysis for session ${sessionKey}`);
      const allLaps = await this.getSessionLaps(sessionKey);

      const completedLaps = allLaps.filter((lap) => !lap.isDNF && lap.lapTime);
      const totalLaps = allLaps.length;

      // Overall statistics
      const lapTimes = completedLaps.map((lap) => lap.lapTime);
      const fastestLap = Math.min(...lapTimes);
      const averageLapTime =
        lapTimes.reduce((sum, time) => sum + time, 0) / lapTimes.length;

      // Driver statistics
      const driverStats = this.calculateDriverStats(allLaps);

      // Lap progression analysis
      const lapProgression = this.analyzeLapProgression(allLaps);

      const analysis = {
        sessionKey,
        overview: {
          totalLaps,
          completedLaps: completedLaps.length,
          dnfLaps: totalLaps - completedLaps.length,
          fastestLapTime: fastestLap,
          averageLapTime,
        },
        driverStats,
        lapProgression,
        generatedAt: new Date().toISOString(),
      };

      this.logger.log(`Completed lap analysis for session ${sessionKey}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Error performing lap analysis:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to perform lap analysis',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private transformLapData(lap: any) {
    return {
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
      isPitLane: this.detectPitLane(
        lap.segments_sector_1,
        lap.segments_sector_2,
        lap.segments_sector_3,
      ),
      segments: {
        sector1: this.transformSegments(lap.segments_sector_1 || []),
        sector2: this.transformSegments(lap.segments_sector_2 || []),
        sector3: this.transformSegments(lap.segments_sector_3 || []),
      },
      timestamp: lap.date_start,
      driverNumber: lap.driver_number,
      sessionKey: lap.session_key,
      meetingKey: lap.meeting_key,
    };
  }

  private transformSegments(segments: number[]) {
    const SEGMENT_MAPPING = {
      0: { color: 'none', meaning: 'not available' },
      2048: { color: 'yellow', meaning: 'yellow sector' },
      2049: { color: 'green', meaning: 'green sector' },
      2051: { color: 'purple', meaning: 'purple sector' },
      2064: { color: 'pit', meaning: 'pitlane' },
    };

    return segments.map((segment) => ({
      value: segment,
      ...(SEGMENT_MAPPING[segment] || { color: 'unknown', meaning: 'unknown' }),
    }));
  }

  private detectPitLane(
    sector1: number[],
    sector2: number[],
    sector3: number[],
  ) {
    const allSegments = [
      ...(sector1 || []),
      ...(sector2 || []),
      ...(sector3 || []),
    ];
    return allSegments.includes(2064);
  }

  private addProgressiveAnalysis(laps: any[]) {
    return laps.map((lap, index) => {
      const previousLaps = laps.slice(0, index);
      const completedPreviousLaps = previousLaps.filter(
        (l) => !l.isDNF && l.lapTime,
      );

      let bestLapSoFar: number | null = null;
      let averageLapSoFar: number | null = null;

      if (completedPreviousLaps.length > 0) {
        const lapTimes = completedPreviousLaps
          .map((l) => l.lapTime)
          .filter((time): time is number => time !== null);
        if (lapTimes.length > 0) {
          bestLapSoFar = Math.min(...lapTimes);
          averageLapSoFar =
            lapTimes.reduce((sum, time) => sum + time, 0) / lapTimes.length;
        }
      }

      return {
        ...lap,
        progressive: {
          bestLapSoFar,
          averageLapSoFar,
          isPersonalBest:
            lap.lapTime && bestLapSoFar ? lap.lapTime <= bestLapSoFar : false,
          completedLapsCount: completedPreviousLaps.length,
        },
      };
    });
  }

  private calculateDriverStats(laps: any[]) {
    const driverMap = new Map();

    laps.forEach((lap) => {
      const driverNumber = lap.driverNumber;
      if (!driverMap.has(driverNumber)) {
        driverMap.set(driverNumber, {
          driverNumber,
          totalLaps: 0,
          completedLaps: 0,
          dnfLaps: 0,
          bestLapTime: null,
          averageLapTime: null,
          lapTimes: [],
        });
      }

      const driver = driverMap.get(driverNumber);
      driver.totalLaps++;

      if (lap.isDNF) {
        driver.dnfLaps++;
      } else if (lap.lapTime) {
        driver.completedLaps++;
        driver.lapTimes.push(lap.lapTime);
      }
    });

    // Calculate statistics for each driver
    const driverStats = Array.from(driverMap.values()).map((driver) => {
      if (driver.lapTimes.length > 0) {
        driver.bestLapTime = Math.min(...driver.lapTimes);
        driver.averageLapTime =
          driver.lapTimes.reduce((sum, time) => sum + time, 0) /
          driver.lapTimes.length;
      }
      delete driver.lapTimes; // Remove raw lap times from response
      return driver;
    });

    return driverStats.sort((a, b) => a.driverNumber - b.driverNumber);
  }

  private analyzeLapProgression(laps: any[]) {
    const lapNumbers = [...new Set(laps.map((lap) => lap.lapNumber))].sort(
      (a, b) => a - b,
    );

    return lapNumbers.map((lapNumber) => {
      const lapsInThisNumber = laps.filter(
        (lap) => lap.lapNumber === lapNumber,
      );
      const completedLaps = lapsInThisNumber.filter(
        (lap) => !lap.isDNF && lap.lapTime,
      );

      if (completedLaps.length === 0) {
        return {
          lapNumber,
          fastestTime: null,
          averageTime: null,
          completedDrivers: 0,
          totalDrivers: lapsInThisNumber.length,
        };
      }

      const lapTimes = completedLaps.map((lap) => lap.lapTime);

      return {
        lapNumber,
        fastestTime: Math.min(...lapTimes),
        averageTime:
          lapTimes.reduce((sum, time) => sum + time, 0) / lapTimes.length,
        completedDrivers: completedLaps.length,
        totalDrivers: lapsInThisNumber.length,
      };
    });
  }
}
