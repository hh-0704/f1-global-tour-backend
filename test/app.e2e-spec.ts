import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) — API 정보 반환', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/')
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'F1 Global Tour API',
      version: '1.0',
      docs: '/api/docs',
    });
  });
});
