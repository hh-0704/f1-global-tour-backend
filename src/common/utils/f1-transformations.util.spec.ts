import { F1TransformationsUtil } from './f1-transformations.util';
import {
  OpenF1Lap,
  OpenF1Driver,
  OpenF1CarData,
} from '../interfaces/openf1.interface';

describe('F1TransformationsUtil', () => {
  // ── transformDRS ──────────────────────────────────────────────────────────────

  describe('transformDRS', () => {
    it('null이면 enabled=false, available=false를 반환한다', () => {
      expect(F1TransformationsUtil.transformDRS(null)).toEqual({
        enabled: false,
        available: false,
      });
    });

    it.each([0, 1])('DRS=%d이면 enabled=false, available=false', (drs) => {
      expect(F1TransformationsUtil.transformDRS(drs)).toEqual({
        enabled: false,
        available: false,
      });
    });

    it('DRS=8이면 available=true, enabled=false (DRS 사용 가능하지만 미활성)', () => {
      expect(F1TransformationsUtil.transformDRS(8)).toEqual({
        enabled: false,
        available: true,
      });
    });

    it.each([10, 12, 14])('DRS=%d이면 enabled=true, available=true', (drs) => {
      expect(F1TransformationsUtil.transformDRS(drs)).toEqual({
        enabled: true,
        available: true,
      });
    });

    it('알 수 없는 DRS 값은 enabled=false, available=false', () => {
      expect(F1TransformationsUtil.transformDRS(99)).toEqual({
        enabled: false,
        available: false,
      });
    });
  });

  // ── transformSegments ─────────────────────────────────────────────────────────

  describe('transformSegments', () => {
    it('null이면 빈 배열을 반환한다', () => {
      expect(F1TransformationsUtil.transformSegments(null)).toEqual([]);
    });

    it('세그먼트 값을 color/meaning/performance로 변환한다', () => {
      const result = F1TransformationsUtil.transformSegments([
        2048, 2049, 2051,
      ]);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ value: 2048, color: 'yellow' });
      expect(result[1]).toMatchObject({ value: 2049, color: 'green' });
      expect(result[2]).toMatchObject({ value: 2051, color: 'purple' });
    });

    it('알 수 없는 세그먼트 값은 color=unknown으로 변환한다', () => {
      const result = F1TransformationsUtil.transformSegments([9999]);
      expect(result[0]).toMatchObject({ value: 9999, color: 'unknown' });
    });

    it('피트 세그먼트(2064)를 올바르게 변환한다', () => {
      const result = F1TransformationsUtil.transformSegments([2064]);
      expect(result[0]).toMatchObject({ value: 2064, color: 'pit' });
    });
  });

  // ── detectPitLane ─────────────────────────────────────────────────────────────

  describe('detectPitLane', () => {
    it('세그먼트에 2064가 포함되면 true를 반환한다', () => {
      expect(F1TransformationsUtil.detectPitLane([2064, 2048])).toBe(true);
    });

    it('2064가 없으면 false를 반환한다', () => {
      expect(F1TransformationsUtil.detectPitLane([2048, 2049])).toBe(false);
    });

    it('여러 섹터 배열을 합쳐서 검사한다', () => {
      expect(F1TransformationsUtil.detectPitLane([2048], [2064])).toBe(true);
    });

    it('null 배열은 무시한다', () => {
      expect(F1TransformationsUtil.detectPitLane(null, [2048])).toBe(false);
    });
  });

  // ── detectPitOutLap ───────────────────────────────────────────────────────────

  describe('detectPitOutLap', () => {
    it('sector1에 피트 세그먼트가 있으면 true', () => {
      expect(
        F1TransformationsUtil.detectPitOutLap([2064], [2048], [2049]),
      ).toBe(true);
    });

    it('sector2에 피트가 있고 sector3에 없으면 true', () => {
      expect(
        F1TransformationsUtil.detectPitOutLap([2048], [2064], [2049]),
      ).toBe(true);
    });

    it('sector2와 sector3 모두 피트이면 false (피트 아웃이 아닌 피트 인)', () => {
      expect(
        F1TransformationsUtil.detectPitOutLap([2048], [2064], [2064]),
      ).toBe(false);
    });

    it('피트 세그먼트가 전혀 없으면 false', () => {
      expect(
        F1TransformationsUtil.detectPitOutLap([2048], [2049], [2051]),
      ).toBe(false);
    });
  });

  // ── analyzeSectorPerformance ──────────────────────────────────────────────────

  describe('analyzeSectorPerformance', () => {
    it('null이면 neutral을 반환한다', () => {
      expect(F1TransformationsUtil.analyzeSectorPerformance(null)).toBe(
        'neutral',
      );
    });

    it('2051(purple)이 있으면 personal_best', () => {
      expect(F1TransformationsUtil.analyzeSectorPerformance([2048, 2051])).toBe(
        'personal_best',
      );
    });

    it('2049(green)이 있으면 best', () => {
      expect(F1TransformationsUtil.analyzeSectorPerformance([2048, 2049])).toBe(
        'best',
      );
    });

    it('2064(pit)만 있으면 pit', () => {
      expect(F1TransformationsUtil.analyzeSectorPerformance([2064])).toBe(
        'pit',
      );
    });

    it('2048(yellow)만 있으면 neutral', () => {
      expect(F1TransformationsUtil.analyzeSectorPerformance([2048])).toBe(
        'neutral',
      );
    });

    it('personal_best가 best보다 우선순위가 높다', () => {
      expect(F1TransformationsUtil.analyzeSectorPerformance([2049, 2051])).toBe(
        'personal_best',
      );
    });
  });

  // ── transformDriverData ───────────────────────────────────────────────────────

  describe('transformDriverData', () => {
    it('OpenF1 드라이버 데이터를 camelCase로 변환한다', () => {
      const raw: OpenF1Driver = {
        driver_number: 1,
        name_acronym: 'VER',
        full_name: 'Max VERSTAPPEN',
        team_name: 'Red Bull Racing',
        team_colour: '3671C6',
        country_code: 'NED',
        headshot_url: 'https://example.com/ver.png',
        session_key: 9472,
        meeting_key: 1,
      };

      const result = F1TransformationsUtil.transformDriverData(raw);

      expect(result).toEqual({
        number: 1,
        name: 'VER',
        fullName: 'Max VERSTAPPEN',
        team: 'Red Bull Racing',
        teamColor: '3671C6',
        countryCode: 'NED',
        headShotUrl: 'https://example.com/ver.png',
        sessionKey: 9472,
        meetingKey: 1,
      });
    });
  });

  // ── transformCarData ──────────────────────────────────────────────────────────

  describe('transformCarData', () => {
    it('car_data를 변환하고 DRS 상태를 포함한다', () => {
      const raw: OpenF1CarData = {
        date: '2024-04-07T04:07:00.000Z',
        driver_number: 1,
        speed: 320,
        rpm: 12000,
        n_gear: 8,
        throttle: 100,
        brake: 0,
        drs: 10,
        session_key: 9472,
        meeting_key: 1,
      };

      const result = F1TransformationsUtil.transformCarData(raw);

      expect(result.speed).toBe(320);
      expect(result.gear).toBe(8);
      expect(result.drs).toEqual({
        value: 10,
        enabled: true,
        available: true,
      });
    });
  });

  // ── transformLapData ──────────────────────────────────────────────────────────

  describe('transformLapData', () => {
    it('랩 데이터를 변환하고 세그먼트 분석을 포함한다', () => {
      const raw: OpenF1Lap = {
        lap_number: 3,
        lap_duration: null,
        duration_sector_1: 28.1,
        duration_sector_2: null,
        duration_sector_3: null,
        segments_sector_1: [2048, 2051],
        segments_sector_2: [2049],
        segments_sector_3: null,
        date_start: '2024-04-07T04:10:00.000Z',
        driver_number: 1,
        session_key: 9472,
        meeting_key: 1,
      };

      const result = F1TransformationsUtil.transformLapData(raw);

      expect(result.lapNumber).toBe(3);
      expect(result.isDNF).toBe(true);
      expect(result.sectorPerformance.sector1).toBe('personal_best');
      expect(result.sectorPerformance.sector2).toBe('best');
      expect(result.sectorPerformance.sector3).toBe('neutral');
    });
  });
});
