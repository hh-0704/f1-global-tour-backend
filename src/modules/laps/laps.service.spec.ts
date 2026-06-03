import { Test, TestingModule } from '@nestjs/testing';
import { LapsService } from './laps.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { OpenF1Lap } from '../../common/interfaces/openf1.interface';

function lap(
  driver_number: number,
  lap_number: number,
  lap_duration: number | null = 90,
): OpenF1Lap {
  return {
    meeting_key: 1,
    session_key: 9472,
    driver_number,
    lap_number,
    date_start: '2024-03-02T15:00:00Z',
    duration_sector_1: 30,
    duration_sector_2: 30,
    duration_sector_3: 30,
    lap_duration,
    is_pit_out_lap: false,
  };
}

describe('LapsService', () => {
  let service: LapsService;
  let client: { fetchLaps: jest.Mock };

  const allLaps = [lap(1, 1), lap(1, 2), lap(44, 1), lap(44, 2), lap(44, 3)];

  beforeEach(async () => {
    client = { fetchLaps: jest.fn().mockResolvedValue(allLaps) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LapsService,
        { provide: CachedOpenF1ClientService, useValue: client },
      ],
    }).compile();
    service = mod.get(LapsService);
  });

  it('세션 전체를 한 번 fetch 한다(필터 인자 무관, 캐시 단위)', async () => {
    await service.getSessionLaps(9472, 44, 2);
    expect(client.fetchLaps).toHaveBeenCalledWith({ session_key: 9472 });
    expect(client.fetchLaps).toHaveBeenCalledTimes(1);
  });

  it('필터 없으면 전체 랩을 변환해 반환한다', async () => {
    const res = await service.getSessionLaps(9472);
    expect(res).toHaveLength(5);
  });

  it('driverNumber 로 메모리 필터한다', async () => {
    const res = await service.getSessionLaps(9472, 44);
    expect(res).toHaveLength(3);
    expect(res.every((l) => l.driverNumber === 44)).toBe(true);
  });

  it('lapNumber 로 메모리 필터한다', async () => {
    const res = await service.getSessionLaps(9472, undefined, 1);
    expect(res).toHaveLength(2);
    expect(res.every((l) => l.lapNumber === 1)).toBe(true);
  });

  it('driverNumber + lapNumber 동시 필터', async () => {
    const res = await service.getSessionLaps(9472, 44, 2);
    expect(res).toHaveLength(1);
    expect(res[0].driverNumber).toBe(44);
    expect(res[0].lapNumber).toBe(2);
  });

  it('transformLapData: DNF(lap_duration null & !pitOut) 표시', async () => {
    client.fetchLaps.mockResolvedValue([lap(1, 5, null)]);
    const res = await service.getSessionLaps(9472, 1);
    expect(res[0].isDNF).toBe(true);
    expect(res[0].lapTime).toBeNull();
  });

  it('transformLapData: pit-out 랩은 lap_duration null 이어도 isDNF=false', async () => {
    const pitLap: OpenF1Lap = { ...lap(1, 3, null), is_pit_out_lap: true };
    client.fetchLaps.mockResolvedValue([pitLap]);
    const res = await service.getSessionLaps(9472, 1);
    expect(res[0].isPitOutLap).toBe(true);
    expect(res[0].isDNF).toBe(false);
  });
});
