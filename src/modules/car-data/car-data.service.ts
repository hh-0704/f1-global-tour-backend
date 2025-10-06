import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { CarDataQueryParams } from '../../common/interfaces/query-params.interface';

@Injectable()
export class CarDataService {
  private readonly logger = new Logger(CarDataService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  async getDriverTelemetry(
    sessionKey: number,
    driverNumber: number,
    date?: string,
  ) {
    try {
      const params: CarDataQueryParams = {
        session_key: sessionKey,
        driver_number: driverNumber,
        ...(date && { date }),
      };

      this.logger.debug(
        `Fetching telemetry for driver ${driverNumber} in session ${sessionKey}`,
      );
      const carData = await this.cachedOpenf1Client.fetchCarData(params);

      const transformedData = carData.map((data) =>
        this.transformCarData(data),
      );

      this.logger.log(
        `Retrieved ${transformedData.length} telemetry points for driver ${driverNumber}`,
      );
      return {
        sessionKey,
        driverNumber,
        telemetryPoints: transformedData.length,
        data: transformedData,
        summary: this.generateTelemetrySummary(transformedData),
      };
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

  async getSessionTelemetry(
    sessionKey: number,
    date?: string,
    driverNumbers?: number[],
  ) {
    try {
      this.logger.debug(`Fetching session telemetry for session ${sessionKey}`);

      let allTelemetry: any[] = [];

      if (driverNumbers && driverNumbers.length > 0) {
        // Fetch telemetry for specific drivers
        for (const driverNumber of driverNumbers) {
          const driverTelemetry = await this.getDriverTelemetry(
            sessionKey,
            driverNumber,
            date,
          );
          allTelemetry.push(driverTelemetry);
        }
      } else {
        // Fetch all telemetry for the session - get data for all drivers
        // We need to fetch data without driver_number to get all drivers
        const lapsParams = { session_key: sessionKey };
        const lapsData = await this.cachedOpenf1Client.fetchLaps(lapsParams);

        // Get unique driver numbers from laps data
        const uniqueDrivers = [
          ...new Set(lapsData.map((lap) => lap.driver_number)),
        ];

        // Fetch telemetry for each driver
        for (const driverNumber of uniqueDrivers) {
          try {
            const driverTelemetry = await this.getDriverTelemetry(
              sessionKey,
              driverNumber,
              date,
            );
            allTelemetry.push(driverTelemetry);
          } catch (error) {
            this.logger.warn(
              `Could not fetch telemetry for driver ${driverNumber}: ${error.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Retrieved telemetry for ${allTelemetry.length} drivers in session ${sessionKey}`,
      );
      return {
        sessionKey,
        driversCount: allTelemetry.length,
        totalDataPoints: allTelemetry.reduce(
          (sum, driver) => sum + driver.telemetryPoints,
          0,
        ),
        drivers: allTelemetry,
      };
    } catch (error) {
      this.logger.error(`Error fetching session telemetry:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch session telemetry',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getSpeedAnalysis(sessionKey: number, driverNumber: number) {
    try {
      this.logger.debug(
        `Analyzing speed data for driver ${driverNumber} in session ${sessionKey}`,
      );

      const telemetryData = await this.getDriverTelemetry(
        sessionKey,
        driverNumber,
      );
      const speedData = telemetryData.data.filter(
        (point) => point.speed !== null,
      );

      if (speedData.length === 0) {
        throw new HttpException(
          `No speed data available for driver ${driverNumber}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const speeds = speedData.map((point) => point.speed);
      const analysis = {
        sessionKey,
        driverNumber,
        dataPoints: speedData.length,
        maxSpeed: Math.max(...speeds),
        minSpeed: Math.min(...speeds),
        averageSpeed:
          speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length,
        speedDistribution: this.calculateSpeedDistribution(speeds),
        topSpeeds: this.getTopSpeeds(speedData, 10),
        speedByTime: speedData.map((point) => ({
          timestamp: point.timestamp,
          speed: point.speed,
          rpm: point.rpm,
          gear: point.gear,
        })),
      };

      this.logger.log(`Generated speed analysis for driver ${driverNumber}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Error analyzing speed data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze speed data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getGearAnalysis(sessionKey: number, driverNumber: number) {
    try {
      this.logger.debug(
        `Analyzing gear usage for driver ${driverNumber} in session ${sessionKey}`,
      );

      const telemetryData = await this.getDriverTelemetry(
        sessionKey,
        driverNumber,
      );
      const gearData = telemetryData.data.filter(
        (point) => point.gear !== null,
      );

      if (gearData.length === 0) {
        throw new HttpException(
          `No gear data available for driver ${driverNumber}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const gearUsage = this.calculateGearUsage(gearData);
      const gearShifts = this.analyzeGearShifts(gearData);

      const analysis = {
        sessionKey,
        driverNumber,
        dataPoints: gearData.length,
        gearUsageDistribution: gearUsage,
        totalGearShifts: gearShifts.totalShifts,
        upshifts: gearShifts.upshifts,
        downshifts: gearShifts.downshifts,
        averageShiftsPerMinute: gearShifts.shiftsPerMinute,
        maxGear: Math.max(...gearData.map((point) => point.gear)),
        gearByTime: gearData.map((point) => ({
          timestamp: point.timestamp,
          gear: point.gear,
          speed: point.speed,
          rpm: point.rpm,
        })),
      };

      this.logger.log(`Generated gear analysis for driver ${driverNumber}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Error analyzing gear data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze gear data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDRSUsage(sessionKey: number, driverNumber: number) {
    try {
      this.logger.debug(
        `Analyzing DRS usage for driver ${driverNumber} in session ${sessionKey}`,
      );

      const telemetryData = await this.getDriverTelemetry(
        sessionKey,
        driverNumber,
      );
      const drsData = telemetryData.data.filter((point) => point.drs !== null);

      if (drsData.length === 0) {
        throw new HttpException(
          `No DRS data available for driver ${driverNumber}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const drsActivations = this.analyzeDRSActivations(drsData);
      const drsZones = this.identifyDRSZones(drsData);

      const analysis = {
        sessionKey,
        driverNumber,
        dataPoints: drsData.length,
        totalActivations: drsActivations.totalActivations,
        activationDuration: drsActivations.totalDuration,
        averageActivationTime: drsActivations.averageDuration,
        drsEfficiency: drsActivations.efficiency,
        drsZones: drsZones,
        drsTimeline: drsData
          .filter((point) => point.drs.enabled)
          .map((point) => ({
            timestamp: point.timestamp,
            speed: point.speed,
            duration: 0, // Duration would need to be calculated from data sequence
          })),
      };

      this.logger.log(`Generated DRS analysis for driver ${driverNumber}`);
      return analysis;
    } catch (error) {
      this.logger.error(`Error analyzing DRS data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze DRS data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDriverComparison(
    sessionKey: number,
    driver1: number,
    driver2: number,
    date?: string,
  ) {
    try {
      this.logger.debug(
        `Comparing drivers ${driver1} and ${driver2} in session ${sessionKey}`,
      );

      const [telemetry1, telemetry2] = await Promise.all([
        this.getDriverTelemetry(sessionKey, driver1, date),
        this.getDriverTelemetry(sessionKey, driver2, date),
      ]);

      const comparison = {
        sessionKey,
        drivers: {
          driver1: driver1,
          driver2: driver2,
        },
        dataComparison: {
          driver1Points: telemetry1.telemetryPoints,
          driver2Points: telemetry2.telemetryPoints,
        },
        speedComparison: this.compareDriverSpeeds(
          telemetry1.data,
          telemetry2.data,
        ),
        gearComparison: this.compareDriverGears(
          telemetry1.data,
          telemetry2.data,
        ),
        drsComparison: this.compareDriverDRS(telemetry1.data, telemetry2.data),
        performanceGaps: this.calculatePerformanceGaps(
          telemetry1.data,
          telemetry2.data,
        ),
      };

      this.logger.log(
        `Generated comparison between drivers ${driver1} and ${driver2}`,
      );
      return comparison;
    } catch (error) {
      this.logger.error(`Error comparing drivers:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to compare drivers',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private transformCarData(carData: any) {
    return {
      timestamp: carData.date,
      driverNumber: carData.driver_number,
      speed: carData.speed,
      rpm: carData.rpm,
      gear: carData.n_gear,
      throttle: carData.throttle,
      brake: carData.brake,
      drs: this.transformDRS(carData.drs),
      sessionKey: carData.session_key,
      meetingKey: carData.meeting_key,
    };
  }

  private transformDRS(drsValue: number): {
    enabled: boolean;
    available: boolean;
  } {
    const DRS_MAPPING = {
      0: { enabled: false, available: false },
      1: { enabled: false, available: false },
      8: { enabled: false, available: true },
      10: { enabled: true, available: true },
      12: { enabled: true, available: true },
      14: { enabled: true, available: true },
    };
    return DRS_MAPPING[drsValue] || { enabled: false, available: false };
  }

  private generateTelemetrySummary(data: any[]) {
    const validData = data.filter(
      (point) =>
        point.speed !== null && point.rpm !== null && point.gear !== null,
    );

    if (validData.length === 0) {
      return {
        dataPoints: data.length,
        validDataPoints: 0,
        coverage: 0,
      };
    }

    const speeds = validData.map((point) => point.speed);
    const rpms = validData.map((point) => point.rpm);
    const gears = validData.map((point) => point.gear);

    return {
      dataPoints: data.length,
      validDataPoints: validData.length,
      coverage: (validData.length / data.length) * 100,
      speed: {
        max: Math.max(...speeds),
        min: Math.min(...speeds),
        average: speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length,
      },
      rpm: {
        max: Math.max(...rpms),
        min: Math.min(...rpms),
        average: rpms.reduce((sum, rpm) => sum + rpm, 0) / rpms.length,
      },
      gear: {
        max: Math.max(...gears),
        min: Math.min(...gears),
        most_used: this.getMostUsedGear(gears),
      },
      drsUsage: this.calculateDRSUsageSummary(validData),
    };
  }

  private groupTelemetryByDriver(data: any[]) {
    return data.reduce(
      (groups, point) => {
        const driver = point.driverNumber;
        if (!groups[driver]) {
          groups[driver] = [];
        }
        groups[driver].push(point);
        return groups;
      },
      {} as Record<number, any[]>,
    );
  }

  private calculateSpeedDistribution(speeds: number[]) {
    const ranges = [
      { min: 0, max: 100, label: '0-100 km/h' },
      { min: 100, max: 200, label: '100-200 km/h' },
      { min: 200, max: 300, label: '200-300 km/h' },
      { min: 300, max: 400, label: '300+ km/h' },
    ];

    return ranges.map((range) => ({
      ...range,
      count: speeds.filter((speed) => speed >= range.min && speed < range.max)
        .length,
      percentage:
        (speeds.filter((speed) => speed >= range.min && speed < range.max)
          .length /
          speeds.length) *
        100,
    }));
  }

  private getTopSpeeds(speedData: any[], count: number) {
    return speedData
      .sort((a, b) => b.speed - a.speed)
      .slice(0, count)
      .map((point) => ({
        timestamp: point.timestamp,
        speed: point.speed,
        rpm: point.rpm,
        gear: point.gear,
      }));
  }

  private calculateGearUsage(gearData: any[]) {
    const gearCounts = gearData.reduce(
      (counts, point) => {
        const gear = point.gear;
        counts[gear] = (counts[gear] || 0) + 1;
        return counts;
      },
      {} as Record<number, number>,
    );

    const total = gearData.length;

    return Object.entries(gearCounts).map(([gear, count]) => ({
      gear: parseInt(gear),
      count: count as number,
      percentage: ((count as number) / total) * 100,
    }));
  }

  private analyzeGearShifts(gearData: any[]) {
    let totalShifts = 0;
    let upshifts = 0;
    let downshifts = 0;

    for (let i = 1; i < gearData.length; i++) {
      const currentGear = gearData[i].gear;
      const previousGear = gearData[i - 1].gear;

      if (currentGear !== previousGear) {
        totalShifts++;
        if (currentGear > previousGear) {
          upshifts++;
        } else {
          downshifts++;
        }
      }
    }

    const durationMinutes =
      gearData.length > 0
        ? (new Date(gearData[gearData.length - 1].timestamp).getTime() -
            new Date(gearData[0].timestamp).getTime()) /
          (1000 * 60)
        : 0;

    return {
      totalShifts,
      upshifts,
      downshifts,
      shiftsPerMinute: durationMinutes > 0 ? totalShifts / durationMinutes : 0,
    };
  }

  private analyzeDRSActivations(drsData: any[]) {
    let activations = 0;
    let totalDuration = 0;
    let currentActivationStart: Date | null = null;

    const activationDurations: number[] = [];

    for (const point of drsData) {
      if (point.drs.enabled && !currentActivationStart) {
        currentActivationStart = new Date(point.timestamp);
        activations++;
      } else if (!point.drs.enabled && currentActivationStart) {
        const duration =
          new Date(point.timestamp).getTime() -
          currentActivationStart.getTime();
        totalDuration += duration;
        activationDurations.push(duration);
        currentActivationStart = null;
      }
    }

    const averageDuration =
      activationDurations.length > 0
        ? activationDurations.reduce((sum, dur) => sum + dur, 0) /
          activationDurations.length
        : 0;

    const availableCount = drsData.filter(
      (point) => point.drs.available,
    ).length;
    const enabledCount = drsData.filter((point) => point.drs.enabled).length;
    const efficiency =
      availableCount > 0 ? (enabledCount / availableCount) * 100 : 0;

    return {
      totalActivations: activations,
      totalDuration: totalDuration,
      averageDuration: averageDuration,
      efficiency: efficiency,
    };
  }

  private identifyDRSZones(drsData: any[]) {
    // This is a simplified DRS zone identification
    // In a real implementation, you'd use track position data
    const zones: any[] = [];
    let currentZoneStart: number | null = null;

    for (let i = 0; i < drsData.length; i++) {
      const point = drsData[i];

      if (point.drs.available && currentZoneStart === null) {
        currentZoneStart = i;
      } else if (!point.drs.available && currentZoneStart !== null) {
        zones.push({
          start: currentZoneStart,
          end: i - 1,
          duration: i - currentZoneStart,
        });
        currentZoneStart = null;
      }
    }

    return zones;
  }

  private getMostUsedGear(gears: number[]) {
    const gearCounts = gears.reduce(
      (counts, gear) => {
        counts[gear] = (counts[gear] || 0) + 1;
        return counts;
      },
      {} as Record<number, number>,
    );

    return Object.entries(gearCounts).reduce(
      (most, [gear, count]) =>
        count > most.count ? { gear: parseInt(gear), count } : most,
      { gear: 0, count: 0 },
    );
  }

  private calculateDRSUsageSummary(data: any[]) {
    const drsData = data.filter((point) => point.drs);
    const availableCount = drsData.filter(
      (point) => point.drs.available,
    ).length;
    const enabledCount = drsData.filter((point) => point.drs.enabled).length;

    return {
      totalDataPoints: drsData.length,
      availablePoints: availableCount,
      enabledPoints: enabledCount,
      usageRate: availableCount > 0 ? (enabledCount / availableCount) * 100 : 0,
    };
  }

  private compareDriverSpeeds(driver1Data: any[], driver2Data: any[]) {
    const speeds1 = driver1Data
      .filter((p) => p.speed !== null)
      .map((p) => p.speed);
    const speeds2 = driver2Data
      .filter((p) => p.speed !== null)
      .map((p) => p.speed);

    if (speeds1.length === 0 || speeds2.length === 0) {
      return null;
    }

    return {
      driver1: {
        max: Math.max(...speeds1),
        average:
          speeds1.reduce((sum, speed) => sum + speed, 0) / speeds1.length,
      },
      driver2: {
        max: Math.max(...speeds2),
        average:
          speeds2.reduce((sum, speed) => sum + speed, 0) / speeds2.length,
      },
      advantage: {
        maxSpeed:
          Math.max(...speeds1) > Math.max(...speeds2) ? 'driver1' : 'driver2',
        averageSpeed:
          speeds1.reduce((sum, speed) => sum + speed, 0) / speeds1.length >
          speeds2.reduce((sum, speed) => sum + speed, 0) / speeds2.length
            ? 'driver1'
            : 'driver2',
      },
    };
  }

  private compareDriverGears(driver1Data: any[], driver2Data: any[]) {
    const gears1 = driver1Data
      .filter((p) => p.gear !== null)
      .map((p) => p.gear);
    const gears2 = driver2Data
      .filter((p) => p.gear !== null)
      .map((p) => p.gear);

    if (gears1.length === 0 || gears2.length === 0) {
      return null;
    }

    return {
      driver1: {
        maxGear: Math.max(...gears1),
        mostUsed: this.getMostUsedGear(gears1),
      },
      driver2: {
        maxGear: Math.max(...gears2),
        mostUsed: this.getMostUsedGear(gears2),
      },
    };
  }

  private compareDriverDRS(driver1Data: any[], driver2Data: any[]) {
    const drs1 = driver1Data.filter((p) => p.drs);
    const drs2 = driver2Data.filter((p) => p.drs);

    if (drs1.length === 0 || drs2.length === 0) {
      return null;
    }

    const usage1 = this.calculateDRSUsageSummary(drs1);
    const usage2 = this.calculateDRSUsageSummary(drs2);

    return {
      driver1: usage1,
      driver2: usage2,
      advantage: usage1.usageRate > usage2.usageRate ? 'driver1' : 'driver2',
    };
  }

  private calculatePerformanceGaps(driver1Data: any[], driver2Data: any[]) {
    // This is a simplified performance gap calculation
    // In reality, you'd need to align data by time or track position

    const speeds1 = driver1Data
      .filter((p) => p.speed !== null)
      .map((p) => p.speed);
    const speeds2 = driver2Data
      .filter((p) => p.speed !== null)
      .map((p) => p.speed);

    if (speeds1.length === 0 || speeds2.length === 0) {
      return null;
    }

    const avgSpeed1 =
      speeds1.reduce((sum, speed) => sum + speed, 0) / speeds1.length;
    const avgSpeed2 =
      speeds2.reduce((sum, speed) => sum + speed, 0) / speeds2.length;

    return {
      averageSpeedGap: Math.abs(avgSpeed1 - avgSpeed2),
      fasterDriver: avgSpeed1 > avgSpeed2 ? 'driver1' : 'driver2',
      gapPercentage:
        Math.abs((avgSpeed1 - avgSpeed2) / Math.max(avgSpeed1, avgSpeed2)) *
        100,
    };
  }
}
