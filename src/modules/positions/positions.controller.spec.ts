import { Test, TestingModule } from '@nestjs/testing';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PositionsResponse } from './interfaces/positions.interface';

describe('PositionsController', () => {
  let controller: PositionsController;
  let service: { getPositions: jest.Mock };

  beforeEach(async () => {
    service = { getPositions: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [PositionsController],
      providers: [{ provide: PositionsService, useValue: service }],
    }).compile();
    controller = mod.get(PositionsController);
  });

  it('ApiResponseDto.success 로 래핑해 반환한다', async () => {
    const data: PositionsResponse = {
      sessionKey: 9472,
      circuitId: 'bahrain',
      drivers: {},
    };
    service.getPositions.mockResolvedValue(data);

    const res = await controller.getPositions(9472);

    expect(res.success).toBe(true);
    expect(res.data).toBe(data);
    expect(res.timestamp).toBeDefined();
    expect(service.getPositions).toHaveBeenCalledWith(9472);
  });
});
