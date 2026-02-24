import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { RaceControlQueryParams } from '../../common/interfaces/query-params.interface';

/**
 * RaceControlService
 *
 * OpenF1 API의 race_control 데이터를 가져와 가공하는 서비스.
 * 레이스 메시지를 깃발, 사고, 세이프티카, 페널티, DRS, 타임라인 등으로 분류·분석한다.
 *
 * [프론트엔드 연동 시 참고]
 * - 원본 OpenF1 필드명(snake_case)은 transformRaceControlMessage()에서 camelCase로 변환됨
 * - 변환된 message 객체 구조:
 *   {
 *     timestamp: string (ISO 8601, 원본 OpenF1의 date 필드),
 *     category: string ('Flag' | 'SafetyCar' | 'Drs' | 'OTHER' 등),
 *     message: string (원문 레이스 컨트롤 메시지),
 *     lapNumber: number | null,
 *     flag: string | null,
 *     scope: string | null,
 *     sector: number | null,
 *     driverNumber: number | null (메시지에서 파싱),
 *     sessionKey: number,
 *     meetingKey: number,
 *   }
 */
@Injectable()
export class RaceControlService {
  private readonly logger = new Logger(RaceControlService.name);

  constructor(private readonly cachedOpenf1Client: CachedOpenF1ClientService) {}

  /**
   * 세션 전체 레이스 컨트롤 메시지를 가져와 변환 후 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, totalMessages, messages[], summary }
   * - messages는 timestamp 오름차순 정렬
   * - summary: 카테고리별 집계 + flagMessages/incidentMessages/penaltyMessages 카운트
   */
  async getSessionRaceControl(sessionKey: number, date?: string) {
    try {
      const params: RaceControlQueryParams = {
        session_key: sessionKey,
        ...(date && { date }),
      };

      this.logger.debug(
        `Fetching race control messages for session ${sessionKey}`,
      );
      const raceControlData =
        await this.cachedOpenf1Client.fetchRaceControl(params);

      const transformedData = raceControlData.map((message) =>
        this.transformRaceControlMessage(message),
      );

      // Sort by timestamp
      transformedData.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      this.logger.log(
        `Retrieved ${transformedData.length} race control messages for session ${sessionKey}`,
      );
      return {
        sessionKey,
        totalMessages: transformedData.length,
        messages: transformedData,
        summary: this.generateRaceControlSummary(transformedData),
      };
    } catch (error) {
      this.logger.error(`Error fetching race control data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch race control data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 깃발(Flag) 관련 메시지만 필터링해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, totalFlagMessages, flagMessages[], flagPeriods[], flagSummary }
   * - flagPeriods: { flag, start, end, duration(ms) } — 같은 깃발이 연속되는 구간을 묶음
   * - flagSummary: { totalFlagMessages, flagTypes, mostCommonFlag }
   * - 프론트 트랙 상태 표시 컴포넌트에서 깃발 색상/아이콘 렌더링에 활용
   */
  async getFlags(sessionKey: number, date?: string) {
    try {
      this.logger.debug(`Fetching flag information for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(
        sessionKey,
        date,
      );

      const flagMessages = raceControlData.messages.filter((message) =>
        this.isFlag(message.message),
      );

      const flagPeriods = this.analyzeFlagPeriods(flagMessages);

      this.logger.log(`Found ${flagMessages.length} flag-related messages`);
      return {
        sessionKey,
        totalFlagMessages: flagMessages.length,
        flagMessages,
        flagPeriods,
        flagSummary: this.generateFlagSummary(flagMessages),
      };
    } catch (error) {
      this.logger.error(`Error fetching flag data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch flag data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 사고(Incident) 관련 메시지를 필터링해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, totalIncidents, incidents[], categorizedIncidents, incidentTimeline[] }
   * - categorizedIncidents: { collisions, spins, offTrack, debris, other }
   * - incidentTimeline 항목: { timestamp, type, message, driverNumber, severity(LOW/MEDIUM/HIGH) }
   * - severity 판정 기준: 레드플래그/세이프티카 동반 → HIGH, 옐로우/조사 → MEDIUM, 그 외 → LOW
   */
  async getIncidents(sessionKey: number, date?: string) {
    try {
      this.logger.debug(
        `Fetching incident information for session ${sessionKey}`,
      );
      const raceControlData = await this.getSessionRaceControl(
        sessionKey,
        date,
      );

      const incidentMessages = raceControlData.messages.filter((message) =>
        this.isIncident(message.message),
      );

      const categorizedIncidents = this.categorizeIncidents(incidentMessages);

      this.logger.log(
        `Found ${incidentMessages.length} incident-related messages`,
      );
      return {
        sessionKey,
        totalIncidents: incidentMessages.length,
        incidents: incidentMessages,
        categorizedIncidents,
        incidentTimeline: this.createIncidentTimeline(incidentMessages),
      };
    } catch (error) {
      this.logger.error(`Error fetching incident data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch incident data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 세이프티카(SC)와 버추얼 세이프티카(VSC) 구간을 분석해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, safetyCarPeriods[], virtualSafetyCarPeriods[], totalSafetyCarTime(ms), totalVSCTime(ms), messages[] }
   * - safetyCarPeriods 항목: { type: 'SAFETY_CAR', deployed, recalled, duration(ms) }
   * - virtualSafetyCarPeriods 항목: { type: 'VIRTUAL_SAFETY_CAR', deployed, ended, duration(ms) }
   * - 리플레이 타임라인 바에서 SC/VSC 구간 음영 표시에 활용 권장
   */
  async getSafetyCarPeriods(sessionKey: number, date?: string) {
    try {
      this.logger.debug(
        `Analyzing safety car periods for session ${sessionKey}`,
      );
      const raceControlData = await this.getSessionRaceControl(
        sessionKey,
        date,
      );

      const safetyCarMessages = raceControlData.messages.filter((message) =>
        this.isSafetyCarMessage(message.message),
      );

      const safetyCarPeriods = this.analyzeSafetyCarPeriods(safetyCarMessages);
      const virtualSafetyCarPeriods =
        this.analyzeVirtualSafetyCarPeriods(safetyCarMessages);

      this.logger.log(
        `Found ${safetyCarPeriods.length} safety car periods and ${virtualSafetyCarPeriods.length} VSC periods`,
      );
      return {
        sessionKey,
        safetyCarPeriods,
        virtualSafetyCarPeriods,
        totalSafetyCarTime: safetyCarPeriods.reduce(
          (total, period: any) => total + (period.duration || 0),
          0,
        ),
        totalVSCTime: virtualSafetyCarPeriods.reduce(
          (total, period: any) => total + (period.duration || 0),
          0,
        ),
        messages: safetyCarMessages,
      };
    } catch (error) {
      this.logger.error(`Error analyzing safety car periods:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze safety car periods',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 레이스 전체 이벤트 타임라인을 생성해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, dateRange, totalEvents, timeline[], timeGroups, eventTypes }
   * - timeline 항목: { timestamp, type(FLAG/INCIDENT/PENALTY/SAFETY_CAR/DRS/OTHER), message, category, flag, scope, sector }
   * - timeGroups: 5분 단위로 그룹화된 이벤트 맵 — 키는 각 구간 시작 ISO 8601 시각
   * - eventTypes: 이벤트 종류별 카운트 맵
   * - ?startDate / ?endDate 로 구간 필터링 지원 (둘 다 생략 시 전체 세션)
   * - 리플레이 진행 바 위에 이벤트 마커 표시, 구간별 이벤트 요약 패널 등에 활용 권장
   */
  async getRaceTimeline(
    sessionKey: number,
    startDate?: string,
    endDate?: string,
  ) {
    try {
      this.logger.debug(`Creating race timeline for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey);

      let filteredMessages = raceControlData.messages;

      // Filter by date range if provided
      if (startDate || endDate) {
        filteredMessages = raceControlData.messages.filter((message) => {
          const messageTime = new Date(message.timestamp).getTime();
          const start = startDate ? new Date(startDate).getTime() : 0;
          const end = endDate ? new Date(endDate).getTime() : Date.now();

          return messageTime >= start && messageTime <= end;
        });
      }

      const timeline = filteredMessages.map((message) => ({
        timestamp: message.timestamp,
        type: this.categorizeMessage(message.message),
        message: message.message,
        category: message.category,
        flag: message.flag,
        scope: message.scope,
        sector: message.sector,
      }));

      // Group by time intervals (e.g., every 5 minutes)
      const timeGroups = this.groupTimelineByInterval(timeline, 5 * 60 * 1000); // 5 minutes

      this.logger.log(
        `Created timeline with ${timeline.length} events in ${Object.keys(timeGroups).length} time intervals`,
      );
      return {
        sessionKey,
        dateRange: {
          start:
            startDate ||
            (filteredMessages.length > 0
              ? filteredMessages[0].timestamp
              : null),
          end:
            endDate ||
            (filteredMessages.length > 0
              ? filteredMessages[filteredMessages.length - 1].timestamp
              : null),
        },
        totalEvents: timeline.length,
        timeline,
        timeGroups,
        eventTypes: this.getEventTypeSummary(timeline),
      };
    } catch (error) {
      this.logger.error(`Error creating race timeline:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to create race timeline',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 페널티 메시지를 필터링하고 상세 정보를 파싱해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, driverNumber, totalPenalties, penalties[], summary }
   * - penalties 항목에는 원본 message 필드 외에 아래가 추가됨:
   *   - penaltyType: 'GRID PENALTY' | 'TIME PENALTY' | 'STOP GO' | 'DRIVE THROUGH' | 'REPRIMAND' | 'DISQUALIFIED' | 'WARNING' | null
   *   - penaltyReason: 메시지에서 파싱한 이유 문자열 (없으면 null)
   *   - affectedDriver: 메시지에서 파싱한 드라이버 번호 (없으면 null)
   *   - severity: 'LOW' | 'MEDIUM' | 'HIGH'
   * - ?driverNumber 로 특정 드라이버 페널티만 조회 가능
   */
  async getPenalties(sessionKey: number, driverNumber?: number) {
    try {
      this.logger.debug(
        `Fetching penalty information for session ${sessionKey}${driverNumber ? ` and driver ${driverNumber}` : ''}`,
      );
      const raceControlData = await this.getSessionRaceControl(sessionKey);

      let penaltyMessages = raceControlData.messages.filter((message) =>
        this.isPenalty(message.message),
      );

      if (driverNumber) {
        penaltyMessages = penaltyMessages.filter(
          (message) =>
            message.message.includes(driverNumber.toString()) ||
            message.message.includes(`CAR ${driverNumber}`),
        );
      }

      const penalties = penaltyMessages.map((message) => ({
        ...message,
        penaltyType: this.extractPenaltyType(message.message),
        penaltyReason: this.extractPenaltyReason(message.message),
        affectedDriver: this.extractDriverNumber(message.message),
        severity: this.assessPenaltySeverity(message.message),
      }));

      const penaltySummary = this.generatePenaltySummary(penalties);

      this.logger.log(`Found ${penalties.length} penalty-related messages`);
      return {
        sessionKey,
        driverNumber,
        totalPenalties: penalties.length,
        penalties,
        summary: penaltySummary,
      };
    } catch (error) {
      this.logger.error(`Error fetching penalty data:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch penalty data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 카테고리 필터를 적용해서 레이스 컨트롤 데이터를 반환한다.
   * GET /:sessionKey 엔드포인트(alias)에서 호출된다.
   *
   * [프론트엔드 연동 시 참고]
   * - category 미입력 시 전체 메시지 반환 (getSessionRaceControl 과 동일)
   * - category 대소문자 구분 없이 필터링 (예: "flag", "Flag", "FLAG" 모두 동작)
   * - OpenF1 category 값 예시: "Flag", "SafetyCar", "Drs", "Other"
   */
  async getSessionRaceControlByCategory(sessionKey: number, category?: string) {
    const raceControlData = await this.getSessionRaceControl(sessionKey);

    if (!category) {
      return raceControlData;
    }

    const filteredMessages = raceControlData.messages.filter(
      (message) => message.category?.toLowerCase() === category.toLowerCase(),
    );

    return {
      ...raceControlData,
      totalMessages: filteredMessages.length,
      messages: filteredMessages,
      summary: this.generateRaceControlSummary(filteredMessages),
    };
  }

  /**
   * DRS 관련 메시지를 분석해서 반환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { sessionKey, drsMessages[], drsZones[], drsActivations, drsEnabled, totalDRSMessages }
   * - drsZones: DRS ENABLED 메시지 기준으로 구간 인덱스(zone)와 활성화 시각 목록
   *   ※ 실제 트랙 위치 좌표는 OpenF1에서 제공하지 않음 — 별도 서킷 데이터 필요
   * - drsActivations: { totalMessages, enabledCount, disabledCount }
   * - drsEnabled: 세션 중 DRS가 한 번이라도 활성화됐는지 boolean
   */
  async getDRSZones(sessionKey: number) {
    try {
      this.logger.debug(`Analyzing DRS zones for session ${sessionKey}`);
      const raceControlData = await this.getSessionRaceControl(sessionKey);

      const drsMessages = raceControlData.messages.filter((message) =>
        this.isDRSMessage(message.message),
      );

      const drsZones = this.analyzeDRSZones(drsMessages);
      const drsActivations = this.analyzeDRSActivations(drsMessages);

      this.logger.log(`Found ${drsMessages.length} DRS-related messages`);
      return {
        sessionKey,
        drsMessages,
        drsZones,
        drsActivations,
        drsEnabled: drsZones.length > 0,
        totalDRSMessages: drsMessages.length,
      };
    } catch (error) {
      this.logger.error(`Error analyzing DRS zones:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to analyze DRS zones',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * OpenF1 원본 race_control 메시지를 프론트엔드 친화적 구조로 변환한다.
   *
   * [OpenF1 → 프론트엔드 필드 매핑]
   * - date        → timestamp  (ISO 8601 문자열)
   * - category    → category   (없으면 'OTHER')
   * - message     → message    (원문 문자열)
   * - lap_number  → lapNumber
   * - flag        → flag       (없으면 null)
   * - scope       → scope      (없으면 null)
   * - sector      → sector     (없으면 null)
   * - session_key → sessionKey
   * - meeting_key → meetingKey
   * + driverNumber: message 텍스트에서 파싱 (없으면 null)
   */
  private transformRaceControlMessage(message: any) {
    return {
      timestamp: message.date,
      category: message.category || 'OTHER',
      message: message.message,
      lapNumber: message.lap_number,
      flag: message.flag || null,
      scope: message.scope || null,
      sector: message.sector || null,
      driverNumber: this.extractDriverNumber(message.message),
      sessionKey: message.session_key,
      meetingKey: message.meeting_key,
    };
  }

  /**
   * 메시지 배열 기반 레이스 컨트롤 요약 통계를 생성한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { totalMessages, categories(카테고리별 카운트 맵), flagMessages, incidentMessages, penaltyMessages, timeSpan }
   * - timeSpan: { start, end } — 세션 첫/마지막 메시지 timestamp
   */
  private generateRaceControlSummary(messages: any[]) {
    const categories = messages.reduce(
      (counts, message) => {
        const category = message.category;
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    const flagCount = messages.filter((m) => this.isFlag(m.message)).length;
    const incidentCount = messages.filter((m) =>
      this.isIncident(m.message),
    ).length;
    const penaltyCount = messages.filter((m) =>
      this.isPenalty(m.message),
    ).length;

    return {
      totalMessages: messages.length,
      categories,
      flagMessages: flagCount,
      incidentMessages: incidentCount,
      penaltyMessages: penaltyCount,
      timeSpan:
        messages.length > 0
          ? {
              start: messages[0].timestamp,
              end: messages[messages.length - 1].timestamp,
            }
          : null,
    };
  }

  /**
   * 메시지 텍스트가 깃발 관련인지 판별한다.
   * 감지 키워드: YELLOW FLAG, RED FLAG, GREEN FLAG, CHEQUERED FLAG,
   *             BLUE FLAG, BLACK FLAG, WHITE FLAG, TRACK CLEAR
   */
  private isFlag(message: string): boolean {
    const flagKeywords = [
      'YELLOW FLAG',
      'RED FLAG',
      'GREEN FLAG',
      'CHEQUERED FLAG',
      'BLUE FLAG',
      'BLACK FLAG',
      'WHITE FLAG',
      'TRACK CLEAR',
    ];
    return flagKeywords.some((keyword) =>
      message.toUpperCase().includes(keyword),
    );
  }

  /**
   * 메시지 텍스트가 사고 관련인지 판별한다.
   * 감지 키워드: INCIDENT, COLLISION, SPIN, OFF TRACK, CRASH, CONTACT, DEBRIS, ACCIDENT
   */
  private isIncident(message: string): boolean {
    const incidentKeywords = [
      'INCIDENT',
      'COLLISION',
      'SPIN',
      'OFF TRACK',
      'CRASH',
      'CONTACT',
      'DEBRIS',
      'ACCIDENT',
    ];
    return incidentKeywords.some((keyword) =>
      message.toUpperCase().includes(keyword),
    );
  }

  /**
   * 메시지 텍스트가 세이프티카/VSC 관련인지 판별한다.
   * 감지 키워드: SAFETY CAR, VIRTUAL SAFETY CAR, VSC, SC DEPLOYED, SC IN, VSC DEPLOYED, VSC ENDING
   */
  private isSafetyCarMessage(message: string): boolean {
    const safetyCarKeywords = [
      'SAFETY CAR',
      'VIRTUAL SAFETY CAR',
      'VSC',
      'SC DEPLOYED',
      'SC IN',
      'VSC DEPLOYED',
      'VSC ENDING',
    ];
    return safetyCarKeywords.some((keyword) =>
      message.toUpperCase().includes(keyword),
    );
  }

  /**
   * 메시지 텍스트가 페널티 관련인지 판별한다.
   * 감지 키워드: PENALTY, INVESTIGATION, REPRIMAND, GRID PENALTY, TIME PENALTY,
   *             STOP GO, DRIVE THROUGH, DISQUALIFIED
   */
  private isPenalty(message: string): boolean {
    const penaltyKeywords = [
      'PENALTY',
      'INVESTIGATION',
      'REPRIMAND',
      'GRID PENALTY',
      'TIME PENALTY',
      'STOP GO',
      'DRIVE THROUGH',
      'DISQUALIFIED',
    ];
    return penaltyKeywords.some((keyword) =>
      message.toUpperCase().includes(keyword),
    );
  }

  /**
   * 메시지 텍스트가 DRS 관련인지 판별한다.
   * 감지 키워드: DRS, DRAG REDUCTION SYSTEM, DRS ENABLED, DRS DISABLED
   */
  private isDRSMessage(message: string): boolean {
    const drsKeywords = [
      'DRS',
      'DRAG REDUCTION SYSTEM',
      'DRS ENABLED',
      'DRS DISABLED',
    ];
    return drsKeywords.some((keyword) =>
      message.toUpperCase().includes(keyword),
    );
  }

  /**
   * 메시지 텍스트를 타입 문자열로 분류한다.
   * 반환값: 'FLAG' | 'INCIDENT' | 'PENALTY' | 'SAFETY_CAR' | 'DRS' | 'OTHER'
   *
   * [프론트엔드 연동 시 참고]
   * - timeline 항목의 type 필드에 사용됨
   * - 프론트에서 이벤트 마커 아이콘/색상 구분에 활용 가능
   */
  private categorizeMessage(message: string): string {
    if (this.isFlag(message)) return 'FLAG';
    if (this.isIncident(message)) return 'INCIDENT';
    if (this.isPenalty(message)) return 'PENALTY';
    if (this.isSafetyCarMessage(message)) return 'SAFETY_CAR';
    if (this.isDRSMessage(message)) return 'DRS';
    return 'OTHER';
  }

  /**
   * 레이스 컨트롤 메시지 텍스트에서 드라이버 번호를 파싱한다.
   * 파싱 패턴 (순서대로 시도):
   *   1. "CAR {번호}"
   *   2. "DRIVER {번호}"
   *   3. "NO. {번호}" 또는 "NO {번호}"
   *   4. "#{번호}"
   * 파싱 실패 시 null 반환.
   */
  private extractDriverNumber(message: string): number | null {
    // Try to extract driver number from various formats
    const patterns = [
      /CAR (\d+)/i,
      /DRIVER (\d+)/i,
      /NO\.?\s*(\d+)/i,
      /#(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return null;
  }

  /**
   * 깃발 메시지 목록에서 연속 깃발 구간을 분석한다.
   * 깃발 타입이 바뀔 때마다 이전 구간을 종료하고 새 구간을 시작한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 항목: { flag(깃발 타입), start(ISO 8601), end(ISO 8601), duration(ms) }
   */
  private analyzeFlagPeriods(flagMessages: any[]) {
    const periods: any[] = [];
    let currentFlag: string | null = null;
    let flagStart: string | null = null;

    for (const message of flagMessages) {
      const flagType = this.extractFlagType(message.message);

      if (flagType && flagType !== currentFlag) {
        // End previous flag period
        if (currentFlag && flagStart) {
          periods.push({
            flag: currentFlag,
            start: flagStart,
            end: message.timestamp,
            duration:
              new Date(message.timestamp).getTime() -
              new Date(flagStart).getTime(),
          });
        }

        // Start new flag period
        currentFlag = flagType;
        flagStart = message.timestamp;
      }
    }

    return periods;
  }

  /**
   * 메시지 텍스트에서 깃발 타입 문자열을 추출한다.
   * 반환값: 'YELLOW' | 'RED' | 'GREEN' | 'CHEQUERED' | 'BLUE' | 'BLACK' | 'WHITE' | null
   */
  private extractFlagType(message: string): string | null {
    const flagTypes = [
      'YELLOW',
      'RED',
      'GREEN',
      'CHEQUERED',
      'BLUE',
      'BLACK',
      'WHITE',
    ];

    for (const flag of flagTypes) {
      if (message.toUpperCase().includes(`${flag} FLAG`)) {
        return flag;
      }
    }

    return null;
  }

  /**
   * 깃발 메시지 배열 기반 요약 통계를 생성한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { totalFlagMessages, flagTypes(타입별 카운트 맵), mostCommonFlag: { flag, count } }
   */
  private generateFlagSummary(flagMessages: any[]) {
    const flagCounts = flagMessages.reduce(
      (counts, message) => {
        const flagType = this.extractFlagType(message.message) || 'UNKNOWN';
        counts[flagType] = (counts[flagType] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    return {
      totalFlagMessages: flagMessages.length,
      flagTypes: flagCounts,
      mostCommonFlag: Object.entries(flagCounts).reduce(
        (most, [flag, count]) =>
          (count as number) > most.count
            ? { flag, count: count as number }
            : most,
        { flag: 'NONE', count: 0 },
      ),
    };
  }

  /**
   * 사고 메시지를 유형별로 분류한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { collisions[], spins[], offTrack[], debris[], other[] }
   * - 각 배열은 해당 유형에 해당하는 원본 메시지 객체들의 목록
   */
  private categorizeIncidents(incidentMessages: any[]) {
    return {
      collisions: incidentMessages.filter((m) =>
        m.message.toUpperCase().includes('COLLISION'),
      ),
      spins: incidentMessages.filter((m) =>
        m.message.toUpperCase().includes('SPIN'),
      ),
      offTrack: incidentMessages.filter((m) =>
        m.message.toUpperCase().includes('OFF TRACK'),
      ),
      debris: incidentMessages.filter((m) =>
        m.message.toUpperCase().includes('DEBRIS'),
      ),
      other: incidentMessages.filter(
        (m) =>
          !m.message.toUpperCase().includes('COLLISION') &&
          !m.message.toUpperCase().includes('SPIN') &&
          !m.message.toUpperCase().includes('OFF TRACK') &&
          !m.message.toUpperCase().includes('DEBRIS'),
      ),
    };
  }

  /**
   * 사고 메시지를 시간순 타임라인 배열로 변환한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 항목: { timestamp, type, message, driverNumber, severity(LOW/MEDIUM/HIGH) }
   */
  private createIncidentTimeline(incidentMessages: any[]) {
    return incidentMessages.map((message) => ({
      timestamp: message.timestamp,
      type: this.classifyIncident(message.message),
      message: message.message,
      driverNumber: message.driverNumber,
      severity: this.assessIncidentSeverity(message.message),
    }));
  }

  /**
   * 사고 유형을 문자열로 분류한다.
   * 반환값: 'COLLISION' | 'SPIN' | 'OFF_TRACK' | 'DEBRIS' | 'OTHER'
   */
  private classifyIncident(message: string): string {
    if (message.toUpperCase().includes('COLLISION')) return 'COLLISION';
    if (message.toUpperCase().includes('SPIN')) return 'SPIN';
    if (message.toUpperCase().includes('OFF TRACK')) return 'OFF_TRACK';
    if (message.toUpperCase().includes('DEBRIS')) return 'DEBRIS';
    return 'OTHER';
  }

  /**
   * 사고의 심각도를 판정한다.
   * - HIGH: 레드플래그 또는 세이프티카 동반
   * - MEDIUM: 옐로우플래그 또는 조사(INVESTIGATION) 동반
   * - LOW: 그 외
   */
  private assessIncidentSeverity(message: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (
      message.toUpperCase().includes('RED FLAG') ||
      message.toUpperCase().includes('SAFETY CAR')
    ) {
      return 'HIGH';
    }
    if (
      message.toUpperCase().includes('YELLOW FLAG') ||
      message.toUpperCase().includes('INVESTIGATION')
    ) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * 세이프티카 메시지에서 SC 배치/복귀 구간을 분석한다.
   * "SAFETY CAR DEPLOYED" / "SC DEPLOYED" 로 구간 시작,
   * "SAFETY CAR IN" / "SC IN" 으로 구간 종료.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 항목: { type: 'SAFETY_CAR', deployed(ISO 8601), recalled(ISO 8601), duration(ms) }
   */
  private analyzeSafetyCarPeriods(messages: any[]) {
    const periods: any[] = [];
    let scDeployed = false;
    let deployTime: string | null = null;

    for (const message of messages) {
      if (
        message.message.toUpperCase().includes('SAFETY CAR DEPLOYED') ||
        message.message.toUpperCase().includes('SC DEPLOYED')
      ) {
        if (!scDeployed) {
          scDeployed = true;
          deployTime = message.timestamp;
        }
      } else if (
        message.message.toUpperCase().includes('SAFETY CAR IN') ||
        message.message.toUpperCase().includes('SC IN')
      ) {
        if (scDeployed && deployTime) {
          periods.push({
            type: 'SAFETY_CAR',
            deployed: deployTime,
            recalled: message.timestamp,
            duration:
              new Date(message.timestamp).getTime() -
              new Date(deployTime).getTime(),
          });
          scDeployed = false;
          deployTime = null;
        }
      }
    }

    return periods;
  }

  /**
   * 세이프티카 메시지에서 VSC 배치/종료 구간을 분석한다.
   * "VIRTUAL SAFETY CAR" / "VSC DEPLOYED" 로 구간 시작,
   * "VSC ENDING" 으로 구간 종료.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 항목: { type: 'VIRTUAL_SAFETY_CAR', deployed(ISO 8601), ended(ISO 8601), duration(ms) }
   */
  private analyzeVirtualSafetyCarPeriods(messages: any[]) {
    const periods: any[] = [];
    let vscDeployed = false;
    let deployTime: string | null = null;

    for (const message of messages) {
      if (
        message.message.toUpperCase().includes('VIRTUAL SAFETY CAR') ||
        message.message.toUpperCase().includes('VSC DEPLOYED')
      ) {
        if (!vscDeployed) {
          vscDeployed = true;
          deployTime = message.timestamp;
        }
      } else if (
        message.message.toUpperCase().includes('VSC ENDING') ||
        message.message.toUpperCase().includes('VSC ENDING')
      ) {
        if (vscDeployed && deployTime) {
          periods.push({
            type: 'VIRTUAL_SAFETY_CAR',
            deployed: deployTime,
            ended: message.timestamp,
            duration:
              new Date(message.timestamp).getTime() -
              new Date(deployTime).getTime(),
          });
          vscDeployed = false;
          deployTime = null;
        }
      }
    }

    return periods;
  }

  /**
   * 타임라인 이벤트 배열을 지정 ms 단위 구간으로 그룹화한다.
   * 반환값: Record<ISO8601문자열, 이벤트[]>
   *
   * [프론트엔드 연동 시 참고]
   * - 현재 5분(300,000ms) 단위로 그룹화 (컨트롤러에서 고정)
   * - 키는 각 구간 시작 시각의 ISO 8601 문자열
   * - 구간별 이벤트 수 집계나 미니맵 히트맵 등에 활용 가능
   */
  private groupTimelineByInterval(timeline: any[], intervalMs: number) {
    const groups: Record<string, any[]> = {};

    for (const event of timeline) {
      const eventTime = new Date(event.timestamp).getTime();
      const intervalStart = Math.floor(eventTime / intervalMs) * intervalMs;
      const intervalKey = new Date(intervalStart).toISOString();

      if (!groups[intervalKey]) {
        groups[intervalKey] = [];
      }
      groups[intervalKey].push(event);
    }

    return groups;
  }

  /**
   * 타임라인 이벤트 배열에서 이벤트 타입별 카운트 맵을 생성한다.
   * 반환값: Record<타입문자열, 카운트>
   */
  private getEventTypeSummary(timeline: any[]) {
    return timeline.reduce(
      (summary, event) => {
        const type = event.type;
        summary[type] = (summary[type] || 0) + 1;
        return summary;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * 메시지 텍스트에서 페널티 유형을 추출한다.
   * 반환값: 'GRID PENALTY' | 'TIME PENALTY' | 'STOP GO' | 'DRIVE THROUGH' |
   *         'REPRIMAND' | 'DISQUALIFIED' | 'WARNING' | null
   */
  private extractPenaltyType(message: string): string | null {
    const penaltyTypes = [
      'GRID PENALTY',
      'TIME PENALTY',
      'STOP GO',
      'DRIVE THROUGH',
      'REPRIMAND',
      'DISQUALIFIED',
      'WARNING',
    ];

    for (const type of penaltyTypes) {
      if (message.toUpperCase().includes(type)) {
        return type;
      }
    }

    return null;
  }

  /**
   * 페널티 메시지 텍스트에서 사유를 파싱한다.
   * 파싱 패턴 (순서대로 시도):
   *   1. "FOR {사유}."
   *   2. "REASON: {사유}."
   *   3. "DUE TO {사유}."
   * 파싱 실패 시 null 반환.
   */
  private extractPenaltyReason(message: string): string | null {
    // Extract reason from common penalty message formats
    const reasonPatterns = [
      /FOR (.+?)(?:\.|$)/i,
      /REASON: (.+?)(?:\.|$)/i,
      /DUE TO (.+?)(?:\.|$)/i,
    ];

    for (const pattern of reasonPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * 페널티 심각도를 판정한다.
   * - HIGH: DISQUALIFIED, STOP GO, DRIVE THROUGH
   * - MEDIUM: GRID PENALTY, TIME PENALTY
   * - LOW: 그 외 (REPRIMAND, WARNING 등)
   */
  private assessPenaltySeverity(message: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (message.toUpperCase().includes('DISQUALIFIED')) return 'HIGH';
    if (
      message.toUpperCase().includes('STOP GO') ||
      message.toUpperCase().includes('DRIVE THROUGH')
    )
      return 'HIGH';
    if (
      message.toUpperCase().includes('GRID PENALTY') ||
      message.toUpperCase().includes('TIME PENALTY')
    )
      return 'MEDIUM';
    return 'LOW';
  }

  /**
   * 페널티 배열 기반 요약 통계를 생성한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { totalPenalties, penaltyTypes(유형별 카운트 맵), severityDistribution(심각도별 카운트 맵) }
   */
  private generatePenaltySummary(penalties: any[]) {
    const typeCounts = penalties.reduce(
      (counts, penalty) => {
        const type = penalty.penaltyType || 'UNKNOWN';
        counts[type] = (counts[type] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    const severityCounts = penalties.reduce(
      (counts, penalty) => {
        const severity = penalty.severity;
        counts[severity] = (counts[severity] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    return {
      totalPenalties: penalties.length,
      penaltyTypes: typeCounts,
      severityDistribution: severityCounts,
    };
  }

  /**
   * DRS ENABLED 메시지 기반으로 DRS 구역 목록을 생성한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환 항목: { zone(인덱스, 1부터 시작), enabled(ISO 8601), message }
   * - 실제 트랙 상 DRS 구역 좌표는 OpenF1 API에서 제공하지 않음
   *   → 정확한 구역 위치가 필요하면 별도 서킷 레이아웃 데이터와 조합 필요
   */
  private analyzeDRSZones(drsMessages: any[]) {
    // This is a simplified implementation
    // In reality, you'd need track position data to accurately identify DRS zones
    const enabledMessages = drsMessages.filter((m) =>
      m.message.toUpperCase().includes('DRS ENABLED'),
    );

    return enabledMessages.map((message, index) => ({
      zone: index + 1,
      enabled: message.timestamp,
      message: message.message,
    }));
  }

  /**
   * DRS 메시지 활성화/비활성화 통계를 집계한다.
   *
   * [프론트엔드 연동 시 참고]
   * - 반환값: { totalMessages, enabledCount, disabledCount }
   */
  private analyzeDRSActivations(drsMessages: any[]) {
    return {
      totalMessages: drsMessages.length,
      enabledCount: drsMessages.filter((m) =>
        m.message.toUpperCase().includes('ENABLED'),
      ).length,
      disabledCount: drsMessages.filter((m) =>
        m.message.toUpperCase().includes('DISABLED'),
      ).length,
    };
  }
}
