import { Injectable } from '@nestjs/common';

export interface ApiInfo {
  name: string;
  version: string;
  description: string;
  docs: string;
}

@Injectable()
export class AppService {
  getApiInfo(): ApiInfo {
    return {
      name: 'F1 Global Tour API',
      version: '1.0',
      description: 'OpenF1 API 프록시 서버',
      docs: '/api/docs',
    };
  }
}
