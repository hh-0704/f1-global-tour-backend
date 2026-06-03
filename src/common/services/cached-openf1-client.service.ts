import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpenF1ClientService } from './openf1-client.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  OpenF1Session,
  OpenF1Driver,
  OpenF1Lap,
  OpenF1CarData,
  OpenF1Interval,
  OpenF1RaceControl,
  OpenF1Stint,
  OpenF1Location,
} from '../interfaces/openf1.interface';
import {
  SessionsQueryParams,
  DriversQueryParams,
  LapsQueryParams,
  CarDataQueryParams,
  IntervalsQueryParams,
  RaceControlQueryParams,
  StintsQueryParams,
  LocationQueryParams,
} from '../interfaces/query-params.interface';

/**
 * OpenF1 원본 데이터의 영구 캐시 레이어 (plan.md 1단계).
 *
 * 흐름: RDB 조회 → (miss) OpenF1 호출 → 끝난 세션이면 RDB 영구 저장 → 반환.
 * 과거 리플레이 전용이라 끝난 세션 데이터는 불변 → 세션당 OpenF1 호출 최초 1회, 이후 0회.
 *
 * 핵심 규칙(plan.md §6.5):
 *  ① 빈 결과 `[]`/실패는 절대 저장 금지 (회로차단기 fallback `[]` 가 영구 결손이 되지 않도록).
 *  ② 항상 session_key 전체를 저장/조회. driver_number·lap_number 필터는 조회 후 메모리 적용.
 *  ④ "끝난 세션"(date_end < now)만 영구 저장 → 세션 메타를 먼저 확보(ensureSessionMeta).
 *
 * DB 장애 시에도 OpenF1 직통으로 graceful degradation (조회/저장 실패는 경고 로그 후 진행).
 */
@Injectable()
export class CachedOpenF1ClientService {
  private readonly logger = new Logger(CachedOpenF1ClientService.name);

  constructor(
    private readonly openf1Client: OpenF1ClientService,
    private readonly prisma: PrismaService,
  ) {}

  // fetchSessions(목록): 캐싱 안 함 — 가볍고 429 주범 아님(plan.md 결정). OpenF1 직통 유지.
  async fetchSessions(
    params: SessionsQueryParams = {},
  ): Promise<OpenF1Session[]> {
    return this.openf1Client.fetchSessions(params);
  }

  async fetchDrivers(params: DriversQueryParams): Promise<OpenF1Driver[]> {
    const sk = params.session_key;
    const all = await this.cachedSessionRaw<OpenF1Driver>(
      sk,
      () => this.prisma.openf1Driver.findUnique({ where: { sessionKey: sk } }),
      (data) =>
        this.prisma.openf1Driver.upsert({
          where: { sessionKey: sk },
          create: { sessionKey: sk, raw: this.toJson(data) },
          update: { raw: this.toJson(data), fetchedAt: new Date() },
        }),
      () => this.openf1Client.fetchDrivers({ session_key: sk }),
    );
    // 규칙 ②: 필터는 메모리에서
    return all.filter(
      (d) =>
        params.driver_number == null ||
        d.driver_number === params.driver_number,
    );
  }

  async fetchLaps(params: LapsQueryParams): Promise<OpenF1Lap[]> {
    const sk = params.session_key;
    const all = await this.cachedSessionRaw<OpenF1Lap>(
      sk,
      () => this.prisma.openf1Lap.findUnique({ where: { sessionKey: sk } }),
      (data) =>
        this.prisma.openf1Lap.upsert({
          where: { sessionKey: sk },
          create: { sessionKey: sk, raw: this.toJson(data) },
          update: { raw: this.toJson(data), fetchedAt: new Date() },
        }),
      () => this.openf1Client.fetchLaps({ session_key: sk }),
    );
    // 규칙 ②: driver_number·lap_number 필터는 메모리에서
    return all.filter(
      (l) =>
        (params.driver_number == null ||
          l.driver_number === params.driver_number) &&
        (params.lap_number == null || l.lap_number === params.lap_number),
    );
  }

  // car_data 는 대용량·드라이버별 → 현재 캐싱 대상 아님(plan.md 미포함). 직통 유지.
  async fetchCarData(params: CarDataQueryParams): Promise<OpenF1CarData[]> {
    return this.openf1Client.fetchCarData(params);
  }

  async fetchIntervals(
    params: IntervalsQueryParams,
  ): Promise<OpenF1Interval[]> {
    const sk = params.session_key;
    // intervals 는 세션 전체를 캐시. date 필터는 호출자가 사용하지 않아 미적용.
    return this.cachedSessionRaw<OpenF1Interval>(
      sk,
      () =>
        this.prisma.openf1Interval.findUnique({ where: { sessionKey: sk } }),
      (data) =>
        this.prisma.openf1Interval.upsert({
          where: { sessionKey: sk },
          create: { sessionKey: sk, raw: this.toJson(data) },
          update: { raw: this.toJson(data), fetchedAt: new Date() },
        }),
      () => this.openf1Client.fetchIntervals({ session_key: sk }),
    );
  }

  async fetchRaceControl(
    params: RaceControlQueryParams,
  ): Promise<OpenF1RaceControl[]> {
    const sk = params.session_key!;
    // race_control 은 세션 전체를 캐시. category/flag/date 필터는 호출자가 사용하지 않아 미적용.
    return this.cachedSessionRaw<OpenF1RaceControl>(
      sk,
      () =>
        this.prisma.openf1RaceControl.findUnique({ where: { sessionKey: sk } }),
      (data) =>
        this.prisma.openf1RaceControl.upsert({
          where: { sessionKey: sk },
          create: { sessionKey: sk, raw: this.toJson(data) },
          update: { raw: this.toJson(data), fetchedAt: new Date() },
        }),
      () => this.openf1Client.fetchRaceControl({ session_key: sk }),
    );
  }

  async fetchStints(params: StintsQueryParams): Promise<OpenF1Stint[]> {
    const sk = params.session_key;
    const all = await this.cachedSessionRaw<OpenF1Stint>(
      sk,
      () => this.prisma.openf1Stint.findUnique({ where: { sessionKey: sk } }),
      (data) =>
        this.prisma.openf1Stint.upsert({
          where: { sessionKey: sk },
          create: { sessionKey: sk, raw: this.toJson(data) },
          update: { raw: this.toJson(data), fetchedAt: new Date() },
        }),
      () => this.openf1Client.fetchStints({ session_key: sk }),
    );
    // 규칙 ②: driver_number 필터는 메모리에서
    return all.filter(
      (s) =>
        params.driver_number == null ||
        s.driver_number === params.driver_number,
    );
  }

  /**
   * 한 드라이버의 레이스 윈도우 location (date 청크 페이징) — 드라이버 단위 영구 캐시(plan.md §6.6).
   *
   * /location 은 (세션,드라이버)당 수만 행이라 openf1_location 에 (sk, driver) 단위로 저장.
   * ⚠ **빈 결과 `[]` 는 저장 금지(규칙 ①)** — 피트인/수집실패로 일시적으로 비었을 수 있어,
   *    빈 배열을 캐시하면 영구 결손이 된다(다음 요청 때 재수집되도록 비저장).
   * 끝난 세션만 저장(규칙 ④).
   */
  async fetchLocation(params: LocationQueryParams): Promise<OpenF1Location[]> {
    const sk = params.session_key;
    const driver = params.driver_number!;

    // 1. RDB 조회 (드라이버 단위)
    try {
      const row = await this.prisma.openf1Location.findUnique({
        where: {
          sessionKey_driverNumber: { sessionKey: sk, driverNumber: driver },
        },
      });
      if (row) return row.raw as unknown as OpenF1Location[];
    } catch (e) {
      this.logger.warn(
        `location 캐시 조회 실패(session=${sk}, driver=${driver}): ${this.errMsg(e)}`,
      );
    }

    // 2. OpenF1 윈도우 수집 (date 청크 페이징)
    const data = await this.openf1Client.fetchLocationWindow(
      sk,
      driver,
      params.dateGt,
      params.dateLt,
    );

    // 3. 빈 결과 저장 금지(①) + 끝난 세션만 저장(④)
    if (data.length > 0) {
      const { isFinal } = await this.ensureSessionMeta(sk);
      if (isFinal) {
        try {
          await this.prisma.openf1Location.upsert({
            where: {
              sessionKey_driverNumber: {
                sessionKey: sk,
                driverNumber: driver,
              },
            },
            create: {
              sessionKey: sk,
              driverNumber: driver,
              raw: this.toJson(data),
            },
            update: { raw: this.toJson(data), fetchedAt: new Date() },
          });
        } catch (e) {
          this.logger.warn(
            `location 캐시 저장 실패(session=${sk}, driver=${driver}): ${this.errMsg(e)}`,
          );
        }
      }
    }
    return data;
  }

  async preloadReplayData(sessionKey: number): Promise<{
    drivers: OpenF1Driver[];
    laps: OpenF1Lap[];
    intervals: OpenF1Interval[];
    stints: OpenF1Stint[];
  }> {
    const [drivers, laps, intervals, stints] = await Promise.all([
      this.fetchDrivers({ session_key: sessionKey }),
      this.fetchLaps({ session_key: sessionKey }),
      this.fetchIntervals({ session_key: sessionKey }),
      this.fetchStints({ session_key: sessionKey }),
    ]);
    return { drivers, laps, intervals, stints };
  }

  /**
   * 가공 결과 영구 저장 가드용 — 끝난 세션(date_end < now) 여부.
   * BaseF1Service.getCachedComputed 가 driver_timings/race_flags/positions 저장 전에 호출.
   */
  async isSessionFinal(sessionKey: number): Promise<boolean> {
    return (await this.ensureSessionMeta(sessionKey)).isFinal;
  }

  // ───────────────────────── 내부 캐시 헬퍼 ─────────────────────────

  /**
   * 세션 단위 원본 캐시 공통 흐름.
   * RDB 히트 시 즉시 반환, miss 면 OpenF1 호출 후 끝난 세션·비어있지 않을 때만 저장(규칙 ①,④).
   * 저장된 데이터는 length>0 만 들어가므로, RDB 행 존재 = 정상 데이터.
   */
  private async cachedSessionRaw<T>(
    sessionKey: number,
    load: () => Promise<{ raw: Prisma.JsonValue } | null>,
    save: (data: T[]) => Promise<unknown>,
    fetch: () => Promise<T[]>,
  ): Promise<T[]> {
    // 1. RDB 조회 (DB 장애는 OpenF1 폴백으로 흡수)
    try {
      const row = await load();
      if (row) return row.raw as unknown as T[];
    } catch (e) {
      this.logger.warn(
        `캐시 조회 실패(session=${sessionKey}): ${this.errMsg(e)}`,
      );
    }

    // 2. OpenF1 호출
    const data = await fetch();

    // 3. 끝난 세션 + 비어있지 않을 때만 영구 저장 (규칙 ①, ④)
    if (data.length > 0) {
      const { isFinal } = await this.ensureSessionMeta(sessionKey);
      if (isFinal) {
        try {
          await save(data);
        } catch (e) {
          this.logger.warn(
            `캐시 저장 실패(session=${sessionKey}): ${this.errMsg(e)}`,
          );
        }
      }
    }
    return data;
  }

  /**
   * "끝난 세션" 판정용 메타 확보 (규칙 ④).
   * openf1_sessions 에는 끝난 세션만 저장되므로 행 존재 = isFinal.
   * 미보유 시 OpenF1 직통 조회 → date_end < now 면 메타 영구 저장.
   */
  private async ensureSessionMeta(
    sessionKey: number,
  ): Promise<{ isFinal: boolean }> {
    try {
      const existing = await this.prisma.openf1Session.findUnique({
        where: { sessionKey },
      });
      if (existing) return { isFinal: existing.isFinal };
    } catch (e) {
      this.logger.warn(
        `세션 메타 조회 실패(session=${sessionKey}): ${this.errMsg(e)}`,
      );
      return { isFinal: false }; // DB 장애 → 영구 저장 보류
    }

    const sessions = await this.openf1Client.fetchSessions({
      session_key: sessionKey,
    });
    const session = sessions[0];
    if (!session?.date_end) return { isFinal: false };

    const endMs = new Date(session.date_end).getTime();
    const isFinal = Number.isFinite(endMs) && endMs < Date.now();

    if (isFinal) {
      try {
        await this.prisma.openf1Session.upsert({
          where: { sessionKey },
          create: {
            sessionKey,
            raw: this.toJson(session),
            dateEnd: new Date(session.date_end),
            isFinal: true,
          },
          update: {
            raw: this.toJson(session),
            dateEnd: new Date(session.date_end),
            isFinal: true,
            fetchedAt: new Date(),
          },
        });
      } catch (e) {
        this.logger.warn(
          `세션 메타 저장 실패(session=${sessionKey}): ${this.errMsg(e)}`,
        );
      }
    }
    return { isFinal };
  }

  private toJson(data: unknown): Prisma.InputJsonValue {
    return data as Prisma.InputJsonValue;
  }

  private errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
