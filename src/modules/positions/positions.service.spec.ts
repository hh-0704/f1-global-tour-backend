import { Test, TestingModule } from '@nestjs/testing';
import { PositionsService } from './positions.service';
import { PositionPipelineService } from './position-pipeline.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CachedOpenF1ClientService } from '../../common/services/cached-openf1-client.service';
import { PositionsResponse } from './interfaces/positions.interface';

const sample: PositionsResponse = {
  sessionKey: 9472,
  circuitId: 'bahrain',
  drivers: { '1': { samples: [{ t: 0, lng: 50.5, lat: 26 }] } },
};

describe('PositionsService — 캐시/single-flight', () => {
  let service: PositionsService;
  let pipeline: { build: jest.Mock };
  let stored: { logicVersion: number; result: unknown } | null;

  beforeEach(async () => {
    pipeline = { build: jest.fn() };
    stored = null;

    // positions_cache 를 인메모리로 흉내: upsert 시 저장, findUnique 시 반환
    const mockPrisma = {
      positionsCache: {
        findUnique: jest.fn(() => Promise.resolve(stored)),
        upsert: jest.fn(
          (args: { create: { logicVersion: number; result: unknown } }) => {
            stored = {
              logicVersion: args.create.logicVersion,
              result: args.create.result,
            };
            return Promise.resolve({});
          },
        ),
      },
    };
    // 끝난 세션 → 저장 트리거
    const mockClient = { isSessionFinal: jest.fn().mockResolvedValue(true) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: PositionPipelineService, useValue: pipeline },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CachedOpenF1ClientService, useValue: mockClient },
      ],
    }).compile();
    service = mod.get(PositionsService);
  });

  it('결과를 캐시한다(두 번째 호출은 build 미실행)', async () => {
    pipeline.build.mockResolvedValue(sample);

    const a = await service.getPositions(9472);
    const b = await service.getPositions(9472);

    expect(a).toBe(sample);
    expect(b).toBe(sample);
    expect(pipeline.build).toHaveBeenCalledTimes(1);
  });

  it('동시 요청은 single-flight 로 build 1회만 실행한다', async () => {
    let resolve!: (v: PositionsResponse) => void;
    pipeline.build.mockReturnValue(
      new Promise<PositionsResponse>((r) => (resolve = r)),
    );

    const p1 = service.getPositions(9472);
    const p2 = service.getPositions(9472); // 아직 미해결 → 같은 in-flight 공유
    resolve(sample);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(sample);
    expect(r2).toBe(sample);
    expect(pipeline.build).toHaveBeenCalledTimes(1);
  });

  it('실패는 캐시하지 않는다(다음 호출 재시도)', async () => {
    pipeline.build
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(sample);

    await expect(service.getPositions(9472)).rejects.toThrow('boom');
    const ok = await service.getPositions(9472);

    expect(ok).toBe(sample);
    expect(pipeline.build).toHaveBeenCalledTimes(2);
  });
});
