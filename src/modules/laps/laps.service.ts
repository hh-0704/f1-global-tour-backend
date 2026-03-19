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

      const laps = await this.cachedOpenf1Client.fetchLaps(params);
      const transformedLaps = laps.map((lap) => this.transformLapData(lap));

      this.logger.log(`Retrieved ${transformedLaps.length} laps for session ${sessionKey}`);
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

  private transformLapData(lap: any) {
    return {
      lapNumber: lap.lap_number,
      lapTime: lap.lap_duration,
      sectors: {
        sector1: lap.duration_sector_1,
        sector2: lap.duration_sector_2,
        sector3: lap.duration_sector_3,
      },
      isPitOutLap: lap.is_pit_out_lap,
      isDNF: lap.lap_duration === null && !lap.is_pit_out_lap,
      timestamp: lap.date_start,
      driverNumber: lap.driver_number,
      sessionKey: lap.session_key,
    };
  }
}
