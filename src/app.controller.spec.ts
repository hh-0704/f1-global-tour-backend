import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('getApiInfo: API 이름, 버전, docs 경로를 반환한다', () => {
    const result = controller.getApiInfo();

    expect(result.name).toBe('F1 Global Tour API');
    expect(result.version).toBe('1.0');
    expect(result.docs).toBe('/api/docs');
    expect(result.description).toBeDefined();
  });
});
