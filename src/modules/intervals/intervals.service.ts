import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { IntervalsQueryParams } from '../../common/interfaces/query-params.interface';

@Injectable()
export class IntervalsService {
  private readonly logger = new Logger(IntervalsService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  async getSessionIntervals(sessionKey: number, date?: string) {
    try {
      const params: IntervalsQueryParams = {
        session_key: sessionKey,
        ...(date && { date }),
      };
      
      this.logger.debug(`Fetching intervals for session ${sessionKey}`);
      const intervals = await this.cachedOpenf1Client.fetchIntervals(params);
      
      const transformedIntervals = intervals.map(interval => this.transformIntervalData(interval));
      
      this.logger.log(`Retrieved ${transformedIntervals.length} intervals for session ${sessionKey}`);
      return transformedIntervals;
    } catch (error) {
      this.logger.error(`Error fetching session intervals:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to fetch session intervals',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getLiveIntervals(sessionKey: number) {
    try {
      this.logger.debug(`Fetching live intervals for session ${sessionKey}`);
      const intervals = await this.getSessionIntervals(sessionKey);
      
      // Get the most recent interval data for each driver
      const latestIntervals = this.getLatestIntervalsByDriver(intervals);
      
      // Sort by position (gap to leader)
      const sortedIntervals = latestIntervals.sort((a, b) => {
        if (a.gapToLeader === null) return 1;
        if (b.gapToLeader === null) return -1;
        return a.gapToLeader - b.gapToLeader;
      });

      // Add position information
      const positionedIntervals = sortedIntervals.map((interval, index) => ({
        ...interval,
        position: index + 1,
        isLeader: index === 0,
      }));
      
      this.logger.log(`Retrieved live intervals for ${positionedIntervals.length} drivers`);
      return {
        sessionKey,
        updateTime: new Date().toISOString(),
        drivers: positionedIntervals,
      };
    } catch (error) {
      this.logger.error(`Error fetching live intervals:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to fetch live intervals',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getStandings(sessionKey: number, date?: string) {
    try {
      this.logger.debug(`Fetching standings for session ${sessionKey}`);
      const intervals = await this.getSessionIntervals(sessionKey, date);
      
      // Group by timestamp and get latest for each driver
      const latestIntervals = this.getLatestIntervalsByDriver(intervals);
      
      // Create standings with additional race information
      const standings = latestIntervals
        .sort((a, b) => {
          // Handle null gaps (DNF or not started)
          if (a.gapToLeader === null && b.gapToLeader === null) return 0;
          if (a.gapToLeader === null) return 1;
          if (b.gapToLeader === null) return -1;
          return a.gapToLeader - b.gapToLeader;
        })
        .map((interval, index) => {
          const previousDriver = index > 0 ? latestIntervals[index - 1] : null;
          
          return {
            position: index + 1,
            driverNumber: interval.driverNumber,
            gapToLeader: interval.gapToLeader,
            gapToPrevious: previousDriver && interval.gapToLeader !== null && previousDriver.gapToLeader !== null
              ? interval.gapToLeader - previousDriver.gapToLeader
              : null,
            interval: interval.interval,
            isLeader: index === 0,
            timestamp: interval.timestamp,
            status: interval.gapToLeader === null ? 'DNF' : 'RUNNING',
          };
        });
      
      this.logger.log(`Generated standings for ${standings.length} drivers`);
      return {
        sessionKey,
        standingsTime: date || new Date().toISOString(),
        standings,
      };
    } catch (error) {
      this.logger.error(`Error fetching standings:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to fetch standings',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getDriverGaps(sessionKey: number, driverNumber: number) {
    try {
      this.logger.debug(`Fetching gaps for driver ${driverNumber} in session ${sessionKey}`);
      const intervals = await this.getSessionIntervals(sessionKey);
      
      // Filter intervals for specific driver
      const driverIntervals = intervals
        .filter(interval => interval.driverNumber === driverNumber)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (driverIntervals.length === 0) {
        throw new HttpException(
          `No interval data found for driver ${driverNumber} in session ${sessionKey}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Add progression analysis
      const progressiveGaps = driverIntervals.map((interval, index) => {
        const previousInterval = index > 0 ? driverIntervals[index - 1] : null;
        
        return {
          ...interval,
          gapChange: previousInterval && interval.gapToLeader !== null && previousInterval.gapToLeader !== null
            ? interval.gapToLeader - previousInterval.gapToLeader
            : null,
          trend: this.calculateTrend(driverIntervals, index),
        };
      });
      
      this.logger.log(`Retrieved ${progressiveGaps.length} gap measurements for driver ${driverNumber}`);
      return {
        sessionKey,
        driverNumber,
        gapHistory: progressiveGaps,
        summary: this.calculateGapSummary(progressiveGaps),
      };
    } catch (error) {
      this.logger.error(`Error fetching driver gaps:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to fetch driver gaps',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getIntervalsHistory(sessionKey: number, startDate?: string, endDate?: string) {
    try {
      this.logger.debug(`Fetching intervals history for session ${sessionKey}`);
      const intervals = await this.getSessionIntervals(sessionKey);
      
      // Filter by date range if provided
      let filteredIntervals = intervals;
      if (startDate || endDate) {
        filteredIntervals = intervals.filter(interval => {
          const intervalTime = new Date(interval.timestamp).getTime();
          const start = startDate ? new Date(startDate).getTime() : 0;
          const end = endDate ? new Date(endDate).getTime() : Date.now();
          
          return intervalTime >= start && intervalTime <= end;
        });
      }
      
      // Group by timestamp for race progression
      const timeGroups = this.groupIntervalsByTime(filteredIntervals);
      
      // Create race progression data
      const progression = Object.entries(timeGroups)
        .sort(([timeA], [timeB]) => new Date(timeA).getTime() - new Date(timeB).getTime())
        .map(([timestamp, intervalsAtTime]) => ({
          timestamp,
          standings: (intervalsAtTime as any[])
            .sort((a, b) => {
              if (a.gapToLeader === null) return 1;
              if (b.gapToLeader === null) return -1;
              return a.gapToLeader - b.gapToLeader;
            })
            .map((interval, position) => ({
              position: position + 1,
              driverNumber: interval.driverNumber,
              gapToLeader: interval.gapToLeader,
              interval: interval.interval,
            })),
        }));
      
      this.logger.log(`Generated intervals history with ${progression.length} time points`);
      return {
        sessionKey,
        dateRange: {
          start: startDate || (intervals.length > 0 ? intervals[0].timestamp : null),
          end: endDate || (intervals.length > 0 ? intervals[intervals.length - 1].timestamp : null),
        },
        progression,
        totalDataPoints: filteredIntervals.length,
      };
    } catch (error) {
      this.logger.error(`Error fetching intervals history:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to fetch intervals history',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private transformIntervalData(interval: any) {
    return {
      timestamp: interval.date,
      driverNumber: interval.driver_number,
      gapToLeader: interval.gap_to_leader,
      interval: interval.interval,
      sessionKey: interval.session_key,
      meetingKey: interval.meeting_key,
    };
  }

  private getLatestIntervalsByDriver(intervals: any[]) {
    const driverMap = new Map();
    
    intervals.forEach(interval => {
      const driverNumber = interval.driverNumber;
      const currentTime = new Date(interval.timestamp).getTime();
      
      if (!driverMap.has(driverNumber) || 
          new Date(driverMap.get(driverNumber).timestamp).getTime() < currentTime) {
        driverMap.set(driverNumber, interval);
      }
    });
    
    return Array.from(driverMap.values());
  }

  private calculateTrend(intervals: any[], currentIndex: number) {
    if (currentIndex < 2) return 'stable';
    
    const recentIntervals = intervals.slice(Math.max(0, currentIndex - 2), currentIndex + 1);
    const validGaps = recentIntervals
      .map(i => i.gapToLeader)
      .filter(gap => gap !== null);
    
    if (validGaps.length < 2) return 'stable';
    
    const trend = validGaps[validGaps.length - 1] - validGaps[0];
    
    if (trend > 0.5) return 'losing';
    if (trend < -0.5) return 'gaining';
    return 'stable';
  }

  private calculateGapSummary(gaps: any[]) {
    const validGaps = gaps.filter(g => g.gapToLeader !== null);
    
    if (validGaps.length === 0) {
      return {
        minGap: null,
        maxGap: null,
        averageGap: null,
        totalDataPoints: gaps.length,
        validDataPoints: 0,
      };
    }
    
    const gapValues = validGaps.map(g => g.gapToLeader);
    
    return {
      minGap: Math.min(...gapValues),
      maxGap: Math.max(...gapValues),
      averageGap: gapValues.reduce((sum, gap) => sum + gap, 0) / gapValues.length,
      totalDataPoints: gaps.length,
      validDataPoints: validGaps.length,
    };
  }

  private groupIntervalsByTime(intervals: any[]) {
    return intervals.reduce((groups, interval) => {
      const timestamp = interval.timestamp;
      if (!groups[timestamp]) {
        groups[timestamp] = [];
      }
      groups[timestamp].push(interval);
      return groups;
    }, {} as Record<string, any[]>);
  }
}