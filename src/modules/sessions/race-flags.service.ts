import { Injectable } from '@nestjs/common';
import { BaseF1Service } from '../../common/services/base-f1.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { OpenF1RaceControl } from '../../common/interfaces/openf1.interface';
import type {
  FlagStatus,
  LapFlagStatus,
  FrontendSessionType,
  RaceFlagsResponse,
} from './interfaces/race-flags.interface';

@Injectable()
export class RaceFlagsService extends BaseF1Service {
  private readonly flagsCache = new Map<
    number,
    { data: RaceFlagsResponse; cachedAt: number }
  >();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10분

  constructor(cachedOpenf1Client: CachedOpenF1ClientService) {
    super(cachedOpenf1Client);
  }

  async getRaceFlags(sessionKey: number): Promise<RaceFlagsResponse> {
    return this.executeWithErrorHandling(
      async () => {
        const cached = this.flagsCache.get(sessionKey);
        if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
          return cached.data;
        }

        // 순차 호출
        const sessions = await this.cachedOpenf1Client.fetchSessions({ session_key: sessionKey });
        const raceControl = await this.cachedOpenf1Client.fetchRaceControl({ session_key: sessionKey });
        const laps = await this.cachedOpenf1Client.fetchLaps({ session_key: sessionKey });

        const session = sessions[0];
        const sessionType = this.mapSessionType(session?.session_type ?? 'Race');

        const totalLaps = laps.length > 0
          ? Math.max(...laps.map((l) => l.lap_number).filter((n) => Number.isFinite(n)))
          : 0;
        const lapFlags = this.buildLapFlags(raceControl, totalLaps);

        let totalMinutes = 0;
        let minuteFlags: LapFlagStatus[] = [];

        if (sessionType !== 'RACE' && session) {
          const startMs = new Date(session.date_start).getTime();
          const endMs = new Date(session.date_end).getTime();
          totalMinutes = Math.ceil((endMs - startMs) / 60000);
          minuteFlags = this.buildMinuteFlags(raceControl, startMs, totalMinutes);
        }

        const data: RaceFlagsResponse = { sessionType, totalLaps, lapFlags, totalMinutes, minuteFlags };
        this.flagsCache.set(sessionKey, { data, cachedAt: Date.now() });
        return data;
      },
      'get race flags',
      { sessionKey },
    );
  }

  private mapSessionType(openF1Type: string): FrontendSessionType {
    const lower = openF1Type.toLowerCase();
    if (lower.includes('race') || lower.includes('sprint')) return 'RACE';
    if (lower.includes('qualifying') || lower.includes('shootout')) return 'QUALIFYING';
    return 'PRACTICE';
  }

  private classifyFlag(msg: OpenF1RaceControl): FlagStatus | null {
    // Flag/SafetyCar 카테고리만 처리 (Other 카테고리의 "SAFETY CAR" 텍스트 오분류 방지)
    if (msg.category !== 'Flag' && msg.category !== 'SafetyCar') return null;

    const message = msg.message?.toUpperCase() ?? '';
    const flag = msg.flag?.toUpperCase() ?? '';

    if (flag === 'RED' || message.includes('RED FLAG')) return 'RED';
    if (message.includes('VIRTUAL SAFETY CAR') || message.includes('VSC')) return 'VSC';
    if (message.includes('SAFETY CAR') || message.includes('SC DEPLOYED')) return 'SC';
    if (flag === 'YELLOW' || message.includes('YELLOW FLAG')) return 'YELLOW';
    if (flag === 'GREEN' || flag === 'CLEAR' || message.includes('GREEN FLAG') || message.includes('TRACK CLEAR')) return 'GREEN';

    return null;
  }

  private getTrackFlagMessages(raceControl: OpenF1RaceControl[]): OpenF1RaceControl[] {
    return raceControl
      .filter((msg) => {
        if (msg.scope && msg.scope !== 'Track') return false;
        return this.classifyFlag(msg) !== null;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private applyFlagClassification(classified: FlagStatus): LapFlagStatus {
    return classified === 'GREEN' ? 'NONE' : classified;
  }

  private buildLapFlags(raceControl: OpenF1RaceControl[], maxLap: number): LapFlagStatus[] {
    if (maxLap <= 0) return [];

    const lapFlags: LapFlagStatus[] = new Array(maxLap).fill('NONE');
    let lastLap = 0;

    for (const msg of this.getTrackFlagMessages(raceControl)) {
      const currentFlag = this.applyFlagClassification(this.classifyFlag(msg)!);
      const lapNum = msg.lap_number ?? lastLap;

      if (lapNum >= 1 && lapNum <= maxLap) {
        for (let i = lapNum - 1; i < maxLap; i++) {
          lapFlags[i] = currentFlag;
        }
        lastLap = lapNum;
      }
    }

    return lapFlags;
  }

  private buildMinuteFlags(
    raceControl: OpenF1RaceControl[],
    sessionStartMs: number,
    totalMinutes: number,
  ): LapFlagStatus[] {
    if (totalMinutes <= 0) return [];

    const minuteFlags: LapFlagStatus[] = new Array(totalMinutes).fill('NONE');

    for (const msg of this.getTrackFlagMessages(raceControl)) {
      const currentFlag = this.applyFlagClassification(this.classifyFlag(msg)!);
      const minuteIndex = Math.floor((new Date(msg.date).getTime() - sessionStartMs) / 60000);

      if (minuteIndex >= 0 && minuteIndex < totalMinutes) {
        for (let i = minuteIndex; i < totalMinutes; i++) {
          minuteFlags[i] = currentFlag;
        }
      }
    }

    return minuteFlags;
  }
}
