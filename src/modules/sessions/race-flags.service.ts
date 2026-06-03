import { Injectable } from '@nestjs/common';
import { BaseF1Service } from '../../common/services/base-f1.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RACE_FLAGS_LOGIC_VERSION } from '../../common/constants/logic-version';
import { OpenF1RaceControl } from '../../common/interfaces/openf1.interface';
import type {
  FlagStatus,
  LapFlagStatus,
  FrontendSessionType,
  RaceFlagsResponse,
} from './interfaces/race-flags.interface';

@Injectable()
export class RaceFlagsService extends BaseF1Service {
  constructor(
    cachedOpenf1Client: CachedOpenF1ClientService,
    private readonly prisma: PrismaService,
  ) {
    super(cachedOpenf1Client);
  }

  async getRaceFlags(sessionKey: number): Promise<RaceFlagsResponse> {
    return this.executeWithErrorHandling(
      () =>
        this.getCachedComputed<RaceFlagsResponse>(
          sessionKey,
          RACE_FLAGS_LOGIC_VERSION,
          async () => {
            const row = await this.prisma.raceFlagsCache.findUnique({
              where: { sessionKey },
            });
            return row
              ? {
                  logicVersion: row.logicVersion,
                  payload: row.result as unknown as RaceFlagsResponse,
                }
              : null;
          },
          () => this.computeRaceFlags(sessionKey),
          (payload) =>
            this.prisma.raceFlagsCache.upsert({
              where: { sessionKey },
              create: {
                sessionKey,
                result: this.toJson(payload),
                logicVersion: RACE_FLAGS_LOGIC_VERSION,
              },
              update: {
                result: this.toJson(payload),
                logicVersion: RACE_FLAGS_LOGIC_VERSION,
                computedAt: new Date(),
              },
            }),
          // 의미있는 결과만 저장 — 빈 플래그(데이터 없음/일시 실패)는 영구화하지 않음
          (payload) =>
            payload.lapFlags.length > 0 || payload.minuteFlags.length > 0,
        ),
      'get race flags',
      { sessionKey },
    );
  }

  private async computeRaceFlags(
    sessionKey: number,
  ): Promise<RaceFlagsResponse> {
    // 순차 호출 (원본은 CachedOpenF1ClientService 가 RDB 캐싱)
    const sessions = await this.cachedOpenf1Client.fetchSessions({
      session_key: sessionKey,
    });
    const raceControl = await this.cachedOpenf1Client.fetchRaceControl({
      session_key: sessionKey,
    });
    const laps = await this.cachedOpenf1Client.fetchLaps({
      session_key: sessionKey,
    });

    const session = sessions[0];
    const sessionType = this.mapSessionType(session?.session_type ?? 'Race');

    const totalLaps =
      laps.length > 0
        ? Math.max(
            ...laps.map((l) => l.lap_number).filter((n) => Number.isFinite(n)),
          )
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

    return {
      sessionType,
      totalLaps,
      lapFlags,
      totalMinutes,
      minuteFlags,
    };
  }

  private mapSessionType(openF1Type: string): FrontendSessionType {
    const lower = openF1Type.toLowerCase();
    if (lower.includes('race') || lower.includes('sprint')) return 'RACE';
    if (lower.includes('qualifying') || lower.includes('shootout'))
      return 'QUALIFYING';
    return 'PRACTICE';
  }

  private classifyFlag(msg: OpenF1RaceControl): FlagStatus | null {
    // Flag/SafetyCar 카테고리만 처리 (Other 카테고리의 "SAFETY CAR" 텍스트 오분류 방지)
    if (msg.category !== 'Flag' && msg.category !== 'SafetyCar') return null;

    const message = msg.message?.toUpperCase() ?? '';
    const flag = msg.flag?.toUpperCase() ?? '';

    if (flag === 'RED' || message.includes('RED FLAG')) return 'RED';
    if (message.includes('VIRTUAL SAFETY CAR') || message.includes('VSC'))
      return 'VSC';
    if (message.includes('SAFETY CAR') || message.includes('SC DEPLOYED'))
      return 'SC';
    if (flag === 'YELLOW' || message.includes('YELLOW FLAG')) return 'YELLOW';
    if (
      flag === 'GREEN' ||
      flag === 'CLEAR' ||
      message.includes('GREEN FLAG') ||
      message.includes('TRACK CLEAR')
    )
      return 'GREEN';

    return null;
  }

  private getTrackFlagMessages(
    raceControl: OpenF1RaceControl[],
  ): OpenF1RaceControl[] {
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

  private buildLapFlags(
    raceControl: OpenF1RaceControl[],
    maxLap: number,
  ): LapFlagStatus[] {
    if (maxLap <= 0) return [];

    const lapFlags: LapFlagStatus[] = new Array<LapFlagStatus>(maxLap).fill(
      'NONE',
    );
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

    const minuteFlags: LapFlagStatus[] = new Array<LapFlagStatus>(
      totalMinutes,
    ).fill('NONE');

    for (const msg of this.getTrackFlagMessages(raceControl)) {
      const currentFlag = this.applyFlagClassification(this.classifyFlag(msg)!);
      const minuteIndex = Math.floor(
        (new Date(msg.date).getTime() - sessionStartMs) / 60000,
      );

      if (minuteIndex >= 0 && minuteIndex < totalMinutes) {
        for (let i = minuteIndex; i < totalMinutes; i++) {
          minuteFlags[i] = currentFlag;
        }
      }
    }

    return minuteFlags;
  }
}
