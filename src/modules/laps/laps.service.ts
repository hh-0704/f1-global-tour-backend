import { Injectable } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { BaseF1Service } from '../../common/services/base-f1.service';
import { OpenF1Lap } from '../../common/interfaces/openf1.interface';
import { LapsQueryParams } from '../../common/interfaces/query-params.interface';
import { TransformedLap } from './interfaces/lap.interface';

@Injectable()
export class LapsService extends BaseF1Service {
  constructor(cachedOpenf1Client: CachedOpenF1ClientService) {
    super(cachedOpenf1Client);
  }

  async getSessionLaps(sessionKey: number, lapNumber?: number): Promise<TransformedLap[]> {
    return this.executeWithErrorHandling(async () => {
      const params: LapsQueryParams = {
        session_key: sessionKey,
        ...(lapNumber != null && { lap_number: lapNumber }),
      };

      const laps = await this.cachedOpenf1Client.fetchLaps(params);
      return laps.map((lap) => this.transformLapData(lap));
    }, 'fetch session laps', { sessionKey, lapNumber });
  }

  private transformLapData(lap: OpenF1Lap): TransformedLap {
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
