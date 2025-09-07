import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { StintsQueryParams, LapsQueryParams } from '../../common/interfaces/query-params.interface';

@Injectable()
export class StintsService {
  private readonly logger = new Logger(StintsService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  async getSessionStints(sessionKey: number) {
    try {
      const params: StintsQueryParams = {
        session_key: sessionKey,
      };

      this.logger.debug(`Fetching stints for session ${sessionKey}`);
      const stints = await this.cachedOpenf1Client.fetchStints(params);

      const transformedStints = stints.map(stint => this.transformStintData(stint));
      
      // Group by driver and sort
      const driverStints = this.groupStintsByDriver(transformedStints);

      this.logger.log(`Retrieved ${transformedStints.length} stints for ${Object.keys(driverStints).length} drivers`);
      return {
        sessionKey,
        totalStints: transformedStints.length,
        driversCount: Object.keys(driverStints).length,
        stints: transformedStints,
        driverStints,
        summary: this.generateSessionStintsSummary(transformedStints),
      };
    } catch (error) {
      this.logger.error(`Error fetching session stints:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch session stints',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDriverStints(sessionKey: number, driverNumber: number) {
    try {
      this.logger.debug(`Fetching stints for driver ${driverNumber} in session ${sessionKey}`);
      
      const sessionStints = await this.getSessionStints(sessionKey);
      const driverStints = sessionStints.stints.filter(stint => 
        stint.driverNumber === driverNumber
      );

      if (driverStints.length === 0) {
        throw new HttpException(
          `No stint data found for driver ${driverNumber} in session ${sessionKey}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Sort by stint number
      driverStints.sort((a, b) => a.stintNumber - b.stintNumber);

      // Calculate stint performance metrics
      const stintAnalysis = await this.analyzeDriverStints(sessionKey, driverNumber, driverStints);

      this.logger.log(`Retrieved ${driverStints.length} stints for driver ${driverNumber}`);
      return {
        sessionKey,
        driverNumber,
        totalStints: driverStints.length,
        stints: driverStints,
        analysis: stintAnalysis,
        tireStrategy: this.analyzeTireStrategy(driverStints),
      };
    } catch (error) {
      this.logger.error(`Error fetching driver stints:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch driver stints',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getTireStrategy(sessionKey: number) {
    try {
      this.logger.debug(`Analyzing tire strategy for session ${sessionKey}`);
      
      const sessionStints = await this.getSessionStints(sessionKey);
      const strategies = this.analyzeAllTireStrategies(sessionStints.stints);

      this.logger.log(`Analyzed tire strategies for ${Object.keys(strategies.driverStrategies).length} drivers`);
      return {
        sessionKey,
        strategies,
        compoundUsage: this.analyzeCompoundUsage(sessionStints.stints),
        strategyComparison: this.compareStrategies(strategies.driverStrategies),
      };
    } catch (error) {
      this.logger.error(`Error analyzing tire strategy:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze tire strategy',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getPitStops(sessionKey: number, driverNumber?: number) {
    try {
      this.logger.debug(`Analyzing pit stops for session ${sessionKey}${driverNumber ? ` and driver ${driverNumber}` : ''}`);
      
      const sessionStints = await this.getSessionStints(sessionKey);
      let stints = sessionStints.stints;

      if (driverNumber) {
        stints = stints.filter(stint => stint.driverNumber === driverNumber);
      }

      const pitStops = this.extractPitStops(stints);
      const pitStopAnalysis = this.analyzePitStops(pitStops);

      this.logger.log(`Found ${pitStops.length} pit stops`);
      return {
        sessionKey,
        driverNumber,
        totalPitStops: pitStops.length,
        pitStops,
        analysis: pitStopAnalysis,
        timing: this.analyzePitStopTiming(pitStops),
      };
    } catch (error) {
      this.logger.error(`Error analyzing pit stops:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze pit stops',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getTirePerformance(sessionKey: number, compound?: string) {
    try {
      this.logger.debug(`Analyzing tire performance for session ${sessionKey}${compound ? ` and compound ${compound}` : ''}`);
      
      const sessionStints = await this.getSessionStints(sessionKey);
      let stints = sessionStints.stints;

      if (compound) {
        stints = stints.filter(stint => stint.tireCompound === compound);
      }

      // Get lap data to analyze performance
      const performanceData = await this.analyzeTirePerformanceData(sessionKey, stints);

      this.logger.log(`Analyzed tire performance for ${stints.length} stints`);
      return {
        sessionKey,
        compound,
        totalStints: stints.length,
        performance: performanceData,
        degradationAnalysis: this.analyzeTireDegradationFromStints(stints),
        compoundComparison: compound ? null : this.compareCompoundPerformance(sessionStints.stints),
      };
    } catch (error) {
      this.logger.error(`Error analyzing tire performance:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze tire performance',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getStintComparison(sessionKey: number, driver1: number, driver2: number) {
    try {
      this.logger.debug(`Comparing stints between drivers ${driver1} and ${driver2} in session ${sessionKey}`);
      
      const [stints1, stints2] = await Promise.all([
        this.getDriverStints(sessionKey, driver1),
        this.getDriverStints(sessionKey, driver2),
      ]);

      const comparison = this.compareDriverStints(stints1, stints2);

      this.logger.log(`Generated stint comparison between drivers ${driver1} and ${driver2}`);
      return {
        sessionKey,
        drivers: { driver1, driver2 },
        comparison,
        strategyDifferences: this.compareDriverStrategies(stints1.tireStrategy, stints2.tireStrategy),
        performanceComparison: this.compareStintPerformance(stints1.stints, stints2.stints),
      };
    } catch (error) {
      this.logger.error(`Error comparing stints:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to compare stints',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getTireDegradation(sessionKey: number, driverNumber?: number) {
    try {
      this.logger.debug(`Analyzing tire degradation for session ${sessionKey}${driverNumber ? ` and driver ${driverNumber}` : ''}`);
      
      const sessionStints = await this.getSessionStints(sessionKey);
      let stints = sessionStints.stints;

      if (driverNumber) {
        stints = stints.filter(stint => stint.driverNumber === driverNumber);
      }

      // Get detailed lap times for degradation analysis
      const degradationData = await this.analyzeTireDegradationDetailed(sessionKey, stints);

      this.logger.log(`Analyzed tire degradation for ${stints.length} stints`);
      return {
        sessionKey,
        driverNumber,
        degradationData,
        summary: this.generateDegradationSummary(degradationData),
        compoundDegradation: this.analyzeCompoundDegradation(degradationData),
      };
    } catch (error) {
      this.logger.error(`Error analyzing tire degradation:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze tire degradation',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private transformStintData(stint: any) {
    return {
      driverNumber: stint.driver_number,
      stintNumber: stint.stint_number,
      lapStart: stint.lap_start,
      lapEnd: stint.lap_end,
      tireCompound: stint.compound,
      tireAge: stint.tyre_age_at_start,
      sessionKey: stint.session_key,
      meetingKey: stint.meeting_key,
      isNew: stint.tyre_age_at_start === 0,
      stintLength: stint.lap_end - stint.lap_start + 1,
    };
  }

  private groupStintsByDriver(stints: any[]) {
    return stints.reduce((groups, stint) => {
      const driver = stint.driverNumber;
      if (!groups[driver]) {
        groups[driver] = [];
      }
      groups[driver].push(stint);
      groups[driver].sort((a, b) => a.stintNumber - b.stintNumber);
      return groups;
    }, {} as Record<number, any[]>);
  }

  private generateSessionStintsSummary(stints: any[]) {
    const compounds = [...new Set(stints.map(s => s.tireCompound))];
    const driversCount = [...new Set(stints.map(s => s.driverNumber))].length;
    
    const compoundUsage = compounds.map(compound => ({
      compound,
      stintCount: stints.filter(s => s.tireCompound === compound).length,
      driversUsed: [...new Set(stints.filter(s => s.tireCompound === compound).map(s => s.driverNumber))].length,
    }));

    return {
      totalStints: stints.length,
      driversCount,
      compounds: compounds.length,
      compoundUsage,
      averageStintLength: stints.reduce((sum, stint) => sum + stint.stintLength, 0) / stints.length,
      longestStint: Math.max(...stints.map(s => s.stintLength)),
      shortestStint: Math.min(...stints.map(s => s.stintLength)),
    };
  }

  private async analyzeDriverStints(sessionKey: number, driverNumber: number, stints: any[]) {
    try {
      // Get lap data for this driver to analyze stint performance
      const lapsParams: LapsQueryParams = {
        session_key: sessionKey,
        driver_number: driverNumber,
      };
      
      const laps = await this.cachedOpenf1Client.fetchLaps(lapsParams);
      
      return this.calculateStintPerformanceMetrics(stints, laps);
    } catch (error) {
      this.logger.warn(`Could not fetch lap data for stint analysis: ${error.message}`);
      return this.calculateBasicStintMetrics(stints);
    }
  }

  private calculateStintPerformanceMetrics(stints: any[], laps: any[]) {
    return stints.map(stint => {
      const stintLaps = laps.filter(lap => 
        lap.lap_number >= stint.lapStart && lap.lap_number <= stint.lapEnd
      );

      const validLapTimes = stintLaps
        .map(lap => lap.lap_duration)
        .filter(time => time !== null)
        .map(time => this.convertTimeToSeconds(time));

      if (validLapTimes.length === 0) {
        return {
          ...stint,
          averageLapTime: null,
          fastestLap: null,
          slowestLap: null,
          consistency: null,
          degradation: null,
        };
      }

      const averageLapTime = validLapTimes.reduce((sum, time) => sum + time, 0) / validLapTimes.length;
      const fastestLap = Math.min(...validLapTimes);
      const slowestLap = Math.max(...validLapTimes);
      
      // Calculate consistency (standard deviation)
      const variance = validLapTimes.reduce((sum, time) => sum + Math.pow(time - averageLapTime, 2), 0) / validLapTimes.length;
      const consistency = Math.sqrt(variance);

      // Calculate degradation (difference between first and last few laps)
      const firstLaps = validLapTimes.slice(0, Math.min(3, Math.floor(validLapTimes.length / 3)));
      const lastLaps = validLapTimes.slice(-Math.min(3, Math.floor(validLapTimes.length / 3)));
      
      const firstAvg = firstLaps.reduce((sum, time) => sum + time, 0) / firstLaps.length;
      const lastAvg = lastLaps.reduce((sum, time) => sum + time, 0) / lastLaps.length;
      const degradation = lastAvg - firstAvg;

      return {
        ...stint,
        averageLapTime,
        fastestLap,
        slowestLap,
        consistency,
        degradation,
        lapData: stintLaps.length,
      };
    });
  }

  private calculateBasicStintMetrics(stints: any[]) {
    return stints.map(stint => ({
      ...stint,
      averageLapTime: null,
      fastestLap: null,
      slowestLap: null,
      consistency: null,
      degradation: null,
    }));
  }

  private convertTimeToSeconds(timeString: string): number {
    if (!timeString || timeString === '0:00:00' || timeString.includes('null')) {
      return 0;
    }

    const parts = timeString.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    
    return parseFloat(timeString) || 0;
  }

  private analyzeTireStrategy(stints: any[]) {
    const compounds = stints.map(stint => stint.tireCompound);
    const uniqueCompounds = [...new Set(compounds)];
    
    return {
      totalStints: stints.length,
      compounds: uniqueCompounds,
      strategy: compounds.join(' → '),
      compoundUsage: uniqueCompounds.map(compound => ({
        compound,
        stints: stints.filter(s => s.tireCompound === compound).length,
        totalLaps: stints
          .filter(s => s.tireCompound === compound)
          .reduce((sum, stint) => sum + stint.stintLength, 0),
      })),
    };
  }

  private analyzeAllTireStrategies(stints: any[]) {
    const driverStrategies = this.groupStintsByDriver(stints);
    
    const strategies = Object.entries(driverStrategies).reduce((result, [driverNumber, driverStints]) => {
      result[parseInt(driverNumber)] = this.analyzeTireStrategy(driverStints as any[]);
      return result;
    }, {} as Record<number, any>);

    return {
      driverStrategies: strategies,
      uniqueStrategies: this.identifyUniqueStrategies(strategies),
      mostCommonStrategy: this.findMostCommonStrategy(strategies),
    };
  }

  private identifyUniqueStrategies(strategies: Record<number, any>) {
    const strategyPatterns = new Map();
    
    Object.entries(strategies).forEach(([driverNumber, strategy]) => {
      const pattern = strategy.strategy;
      if (!strategyPatterns.has(pattern)) {
        strategyPatterns.set(pattern, []);
      }
      strategyPatterns.get(pattern).push(parseInt(driverNumber));
    });

    return Array.from(strategyPatterns.entries()).map(([pattern, drivers]) => ({
      strategy: pattern,
      drivers,
      count: drivers.length,
    }));
  }

  private findMostCommonStrategy(strategies: Record<number, any>) {
    const strategyCounts = {};
    
    Object.values(strategies).forEach((strategy: any) => {
      const pattern = strategy.strategy;
      strategyCounts[pattern] = (strategyCounts[pattern] || 0) + 1;
    });

    const mostCommon = Object.entries(strategyCounts).reduce((most, [pattern, count]) => 
      (count as number) > most.count ? { pattern, count: count as number } : most,
      { pattern: '', count: 0 }
    );

    return mostCommon;
  }

  private analyzeCompoundUsage(stints: any[]) {
    const compounds = [...new Set(stints.map(s => s.tireCompound))];
    
    return compounds.map(compound => {
      const compoundStints = stints.filter(s => s.tireCompound === compound);
      
      return {
        compound,
        totalStints: compoundStints.length,
        totalLaps: compoundStints.reduce((sum, stint) => sum + stint.stintLength, 0),
        averageStintLength: compoundStints.reduce((sum, stint) => sum + stint.stintLength, 0) / compoundStints.length,
        driversUsed: [...new Set(compoundStints.map(s => s.driverNumber))].length,
        longestStint: Math.max(...compoundStints.map(s => s.stintLength)),
        shortestStint: Math.min(...compoundStints.map(s => s.stintLength)),
      };
    });
  }

  private compareStrategies(driverStrategies: Record<number, any>) {
    const strategies = Object.values(driverStrategies);
    
    return {
      averageStints: strategies.reduce((sum: number, strategy: any) => sum + strategy.totalStints, 0) / strategies.length,
      mostStints: Math.max(...strategies.map((s: any) => s.totalStints)),
      leastStints: Math.min(...strategies.map((s: any) => s.totalStints)),
      compoundVariety: {
        most: Math.max(...strategies.map((s: any) => s.compounds.length)),
        least: Math.min(...strategies.map((s: any) => s.compounds.length)),
        average: strategies.reduce((sum: number, strategy: any) => sum + strategy.compounds.length, 0) / strategies.length,
      },
    };
  }

  private extractPitStops(stints: any[]) {
    const driverStints = this.groupStintsByDriver(stints);
    const pitStops: any[] = [];

    Object.entries(driverStints).forEach(([driverNumber, driverStintList]) => {
      const stintList = driverStintList as any[];
      for (let i = 1; i < stintList.length; i++) {
        const previousStint = stintList[i - 1];
        const currentStint = stintList[i];

        pitStops.push({
          driverNumber: parseInt(driverNumber),
          lap: previousStint.lapEnd,
          stintBefore: previousStint.stintNumber,
          stintAfter: currentStint.stintNumber,
          tireFrom: previousStint.tireCompound,
          tireTo: currentStint.tireCompound,
          ageFrom: previousStint.tireAge + previousStint.stintLength,
          ageTo: currentStint.tireAge,
        });
      }
    });

    return pitStops.sort((a: any, b: any) => a.lap - b.lap);
  }

  private analyzePitStops(pitStops: any[]) {
    const totalPitStops = pitStops.length;
    
    if (totalPitStops === 0) {
      return {
        totalPitStops: 0,
        averagePitLap: null,
        earliestPit: null,
        latestPit: null,
        mostCommonTireChange: null,
      };
    }

    const pitLaps = pitStops.map(ps => ps.lap);
    const averagePitLap = pitLaps.reduce((sum, lap) => sum + lap, 0) / pitLaps.length;
    
    const tireChanges = pitStops.map(ps => `${ps.tireFrom} → ${ps.tireTo}`);
    const tireChangeCounts = tireChanges.reduce((counts, change) => {
      counts[change] = (counts[change] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const mostCommonTireChange = Object.entries(tireChangeCounts).reduce((most, [change, count]) => 
      count > most.count ? { change, count } : most,
      { change: '', count: 0 }
    );

    return {
      totalPitStops,
      averagePitLap,
      earliestPit: Math.min(...pitLaps),
      latestPit: Math.max(...pitLaps),
      tireChanges: tireChangeCounts,
      mostCommonTireChange,
      pitLapDistribution: this.analyzePitLapDistribution(pitLaps),
    };
  }

  private analyzePitLapDistribution(pitLaps: number[]) {
    const ranges = [
      { min: 1, max: 10, label: 'Early (1-10)' },
      { min: 11, max: 25, label: 'Mid-Early (11-25)' },
      { min: 26, max: 40, label: 'Mid (26-40)' },
      { min: 41, max: 55, label: 'Mid-Late (41-55)' },
      { min: 56, max: 100, label: 'Late (56+)' },
    ];

    return ranges.map(range => ({
      ...range,
      count: pitLaps.filter(lap => lap >= range.min && lap <= range.max).length,
    }));
  }

  private analyzePitStopTiming(pitStops: any[]) {
    const driverPitTiming = {};

    pitStops.forEach(pitStop => {
      const driver = pitStop.driverNumber;
      if (!driverPitTiming[driver]) {
        driverPitTiming[driver] = [];
      }
      driverPitTiming[driver].push(pitStop.lap);
    });

    return {
      driverPitTiming,
      pitWindows: this.identifyPitWindows(pitStops),
      strategicTiming: this.analyzeStrategicTiming(pitStops),
    };
  }

  private identifyPitWindows(pitStops: any[]) {
    // Group pit stops by lap ranges to identify pit windows
    const windows: any[] = [];
    const lapGroups: Record<string, any[]> = {};

    pitStops.forEach(pitStop => {
      const window = Math.floor(pitStop.lap / 5) * 5; // 5-lap windows
      if (!lapGroups[window]) {
        lapGroups[window] = [];
      }
      lapGroups[window].push(pitStop);
    });

    Object.entries(lapGroups).forEach(([window, stops]) => {
      const stopsArray = stops as any[];
      if (stopsArray.length >= 2) { // At least 2 cars pitting in the same window
        windows.push({
          lapRange: `${window}-${parseInt(window) + 4}`,
          driversCount: stopsArray.length,
          drivers: stopsArray.map(s => s.driverNumber),
        });
      }
    });

    return windows;
  }

  private analyzeStrategicTiming(pitStops: any[]) {
    // Analyze if pit stops were reactive (close together) or strategic (spread out)
    const lapSeparations: number[] = [];
    
    for (let i = 1; i < pitStops.length; i++) {
      const separation = pitStops[i].lap - pitStops[i - 1].lap;
      lapSeparations.push(separation);
    }

    if (lapSeparations.length === 0) {
      return null;
    }

    return {
      averageSeparation: lapSeparations.reduce((sum, sep) => sum + sep, 0) / lapSeparations.length,
      clusteredStops: lapSeparations.filter(sep => sep <= 2).length, // Within 2 laps
      isolatedStops: lapSeparations.filter(sep => sep > 5).length, // More than 5 laps apart
    };
  }

  private async analyzeTirePerformanceData(sessionKey: number, stints: any[]) {
    // This would ideally combine stint data with lap times
    // For now, provide basic analysis based on stint data
    const compoundPerformance = {};

    stints.forEach(stint => {
      const compound = stint.tireCompound;
      if (!compoundPerformance[compound]) {
        compoundPerformance[compound] = {
          stints: [],
          totalLaps: 0,
          averageStintLength: 0,
        };
      }
      
      compoundPerformance[compound].stints.push(stint);
      compoundPerformance[compound].totalLaps += stint.stintLength;
    });

    Object.keys(compoundPerformance).forEach(compound => {
      const data = compoundPerformance[compound];
      data.averageStintLength = data.totalLaps / data.stints.length;
    });

    return compoundPerformance;
  }

  private analyzeTireDegradationFromStints(stints: any[]) {
    // Basic degradation analysis based on stint lengths
    const compoundDegradation = {};

    stints.forEach(stint => {
      const compound = stint.tireCompound;
      if (!compoundDegradation[compound]) {
        compoundDegradation[compound] = {
          stintLengths: [],
          averageLength: 0,
          maxLength: 0,
        };
      }
      
      compoundDegradation[compound].stintLengths.push(stint.stintLength);
    });

    Object.keys(compoundDegradation).forEach(compound => {
      const data = compoundDegradation[compound];
      data.averageLength = data.stintLengths.reduce((sum, len) => sum + len, 0) / data.stintLengths.length;
      data.maxLength = Math.max(...data.stintLengths);
    });

    return compoundDegradation;
  }

  private compareCompoundPerformance(stints: any[]) {
    const compounds = [...new Set(stints.map(s => s.tireCompound))];
    
    return compounds.map(compound => {
      const compoundStints = stints.filter(s => s.tireCompound === compound);
      
      return {
        compound,
        averageStintLength: compoundStints.reduce((sum, stint) => sum + stint.stintLength, 0) / compoundStints.length,
        maxStintLength: Math.max(...compoundStints.map(s => s.stintLength)),
        usage: compoundStints.length,
      };
    }).sort((a, b) => b.averageStintLength - a.averageStintLength);
  }

  private compareDriverStints(stints1: any, stints2: any) {
    return {
      stintCount: {
        driver1: stints1.totalStints,
        driver2: stints2.totalStints,
        advantage: stints1.totalStints < stints2.totalStints ? 'driver1' : 'driver2',
      },
      compounds: {
        driver1: stints1.tireStrategy.compounds,
        driver2: stints2.tireStrategy.compounds,
        commonCompounds: stints1.tireStrategy.compounds.filter(c => 
          stints2.tireStrategy.compounds.includes(c)
        ),
      },
      strategy: {
        driver1: stints1.tireStrategy.strategy,
        driver2: stints2.tireStrategy.strategy,
        identical: stints1.tireStrategy.strategy === stints2.tireStrategy.strategy,
      },
    };
  }

  private compareDriverStrategies(strategy1: any, strategy2: any) {
    return {
      stintDifference: Math.abs(strategy1.totalStints - strategy2.totalStints),
      compoundDifference: Math.abs(strategy1.compounds.length - strategy2.compounds.length),
      strategyType: {
        driver1: this.classifyStrategy(strategy1),
        driver2: this.classifyStrategy(strategy2),
      },
    };
  }

  private classifyStrategy(strategy: any) {
    if (strategy.totalStints === 1) return 'NO_STOP';
    if (strategy.totalStints === 2) return 'ONE_STOP';
    if (strategy.totalStints === 3) return 'TWO_STOP';
    if (strategy.totalStints >= 4) return 'MULTI_STOP';
    return 'UNKNOWN';
  }

  private compareStintPerformance(stints1: any[], stints2: any[]) {
    const performance1 = this.calculateOverallPerformance(stints1);
    const performance2 = this.calculateOverallPerformance(stints2);

    return {
      driver1: performance1,
      driver2: performance2,
      comparison: {
        averageLapTime: this.compareMetric(performance1.averageLapTime, performance2.averageLapTime),
        consistency: this.compareMetric(performance1.consistency, performance2.consistency, true), // Lower is better
        degradation: this.compareMetric(performance1.degradation, performance2.degradation, true), // Lower is better
      },
    };
  }

  private calculateOverallPerformance(stints: any[]) {
    const validStints = stints.filter(s => s.averageLapTime !== null);
    
    if (validStints.length === 0) {
      return {
        averageLapTime: null,
        consistency: null,
        degradation: null,
      };
    }

    return {
      averageLapTime: validStints.reduce((sum, stint) => sum + stint.averageLapTime, 0) / validStints.length,
      consistency: validStints.reduce((sum, stint) => sum + stint.consistency, 0) / validStints.length,
      degradation: validStints.reduce((sum, stint) => sum + stint.degradation, 0) / validStints.length,
    };
  }

  private compareMetric(value1: number | null, value2: number | null, lowerIsBetter = false) {
    if (value1 === null || value2 === null) return null;
    
    const better = lowerIsBetter ? value1 < value2 : value1 > value2;
    return {
      driver1: value1,
      driver2: value2,
      advantage: better ? 'driver1' : 'driver2',
      difference: Math.abs(value1 - value2),
    };
  }

  private async analyzeTireDegradationDetailed(sessionKey: number, stints: any[]) {
    // This would require lap-by-lap analysis
    // For now, provide basic degradation metrics
    return stints.map(stint => ({
      ...stint,
      estimatedDegradation: this.estimateDegradationFromStintLength(stint),
    }));
  }

  private estimateDegradationFromStintLength(stint: any) {
    // Simple degradation estimation based on stint length and tire age
    const baseRate = 0.1; // Base degradation per lap
    const ageMultiplier = 1 + (stint.tireAge * 0.05); // Older tires degrade faster
    
    return stint.stintLength * baseRate * ageMultiplier;
  }

  private generateDegradationSummary(degradationData: any[]) {
    const degradationValues = degradationData.map(d => d.estimatedDegradation);
    
    return {
      averageDegradation: degradationValues.reduce((sum, deg) => sum + deg, 0) / degradationValues.length,
      maxDegradation: Math.max(...degradationValues),
      minDegradation: Math.min(...degradationValues),
      totalDataPoints: degradationData.length,
    };
  }

  private analyzeCompoundDegradation(degradationData: any[]) {
    const compoundDegradation = {};

    degradationData.forEach(stint => {
      const compound = stint.tireCompound;
      if (!compoundDegradation[compound]) {
        compoundDegradation[compound] = [];
      }
      compoundDegradation[compound].push(stint.estimatedDegradation);
    });

    Object.keys(compoundDegradation).forEach(compound => {
      const degradations = compoundDegradation[compound];
      compoundDegradation[compound] = {
        average: degradations.reduce((sum, deg) => sum + deg, 0) / degradations.length,
        max: Math.max(...degradations),
        min: Math.min(...degradations),
        samples: degradations.length,
      };
    });

    return compoundDegradation;
  }
}