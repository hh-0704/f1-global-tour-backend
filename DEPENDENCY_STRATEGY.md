# F1 Global Tour Backend - 의존성 전략

## 현재 패키지 상태 분석

### ✅ 이미 설치된 핵심 의존성
```json
{
  "dependencies": {
    // NestJS 핵심 모듈
    "@nestjs/common": "^10.4.4",
    "@nestjs/core": "^10.4.4",
    "@nestjs/platform-express": "^10.4.4",
    "@nestjs/config": "^3.3.0",
    
    // HTTP 클라이언트 & 캐싱 (완벽!)
    "@nestjs/axios": "^3.1.0",         // HTTP 서비스
    "@nestjs/cache-manager": "^2.3.0",  // 캐시 매니저
    "axios": "^1.7.0",                  // HTTP 클라이언트
    "cache-manager": "^5.7.0",         // 캐시 구현체
    "redis": "^4.7.0",                 // Redis 클라이언트
    
    // 데이터 검증 & 변환 (완벽!)
    "class-transformer": "^0.5.1",     // DTO 변환
    "class-validator": "^0.14.2",      // 검증 데코레이터
    
    // 기타
    "reflect-metadata": "^0.2.2",      // 메타데이터
    "rxjs": "^7.8.1"                   // 반응형 프로그래밍
  }
}
```

## 🔧 추가 설치 필요한 의존성

### Phase 1: 필수 운영 의존성
```bash
# 로깅 시스템
npm install winston nest-winston

# 헬스체크
npm install @nestjs/terminus

# 압축 & CORS
npm install compression helmet

# 환경별 설정
npm install @nestjs/config

# 스케줄링 (선택사항)
npm install @nestjs/schedule node-cron
```

### Phase 2: 개발/테스트 강화 의존성
```bash
# 테스트 유틸리티
npm install -D @nestjs/testing supertest

# API 문서화
npm install @nestjs/swagger swagger-ui-express

# 성능 모니터링
npm install @nestjs/metrics prometheus-api-metrics
```

### Phase 3: 고급 기능 의존성 (선택사항)
```bash
# WebSocket (실시간 기능)
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

# 큐 시스템 (대용량 처리)
npm install @nestjs/bull bull redis

# 데이터베이스 (필요시)
npm install @nestjs/typeorm typeorm pg
```

## 📋 설치 우선순위별 패키지 리스트

### 🚨 즉시 설치 (높은 우선순위)
```bash
# 1단계: 핵심 운영 도구
npm install winston nest-winston @nestjs/terminus compression helmet

# 2단계: 개발 편의성
npm install -D @nestjs/swagger swagger-ui-express
```

### ⚡ 중간 우선순위 (기능 완성 단계)
```bash
# 성능 & 모니터링
npm install @nestjs/metrics

# 스케줄링 (캐시 정리 등)  
npm install @nestjs/schedule node-cron
```

### 🎯 낮은 우선순위 (확장 기능)
```bash
# 실시간 WebSocket
npm install @nestjs/websockets socket.io

# 큐 시스템
npm install @nestjs/bull bull

# 데이터베이스
npm install @nestjs/typeorm typeorm pg
```

## 🏗️ 패키지 매니저 전략

### Node.js 버전 관리
```bash
# .nvmrc 파일 생성
echo "22.11.0" > .nvmrc

# package.json engines 설정
{
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  }
}
```

### 패키지 매니저 선택
현재: **npm** (package-lock.json 존재)
- ✅ 장점: 안정성, 호환성
- 🤔 고려사항: pnpm 전환 시 workspace 활용 가능

### 의존성 버전 관리 정책
```json
{
  "dependencies": {
    // 메이저 버전 고정 (안정성 우선)
    "@nestjs/*": "^10.4.4",
    "axios": "^1.7.0",
    "redis": "^4.7.0"
  },
  "devDependencies": {
    // 개발 도구는 최신 버전 허용
    "typescript": "^5.7.3",
    "jest": "^30.0.0"
  }
}
```

## 📦 권장 설치 명령어

### 1단계: 필수 패키지 설치
```bash
# 로깅 & 헬스체크
npm install winston nest-winston @nestjs/terminus

# 보안 & 성능  
npm install compression helmet

# API 문서화
npm install @nestjs/swagger swagger-ui-express

# 개발 의존성
npm install -D @types/compression @types/helmet
```

### 2단계: 프로젝트별 설정 파일 생성
```bash
# Node 버전 고정
echo "22.11.0" > .nvmrc

# Docker 무시 파일 업데이트
echo -e "\n# Logs\nlogs/\n*.log" >> .gitignore
```

## 🔄 의존성 업데이트 전략

### 정기 업데이트 계획
```bash
# 매주 보안 업데이트 확인
npm audit

# 매월 마이너 버전 업데이트
npm outdated
npm update

# 분기별 메이저 버전 검토
npm outdated --depth=0
```

### 위험도별 업데이트 정책
- **HIGH**: 보안 취약점 - 즉시 업데이트
- **MEDIUM**: 기능 개선 - 테스트 후 업데이트  
- **LOW**: 성능 개선 - 분기별 검토

## 📊 패키지 크기 최적화

### Bundle 분석
```bash
# 의존성 트리 분석
npm ls --depth=0

# 번들 크기 분석 (프로덕션)
npm install -g cost-of-modules
cost-of-modules
```

### 프로덕션 최적화
```dockerfile
# Dockerfile에서 dev dependencies 제외
RUN npm ci --only=production --ignore-scripts
```

## 🛡️ 보안 정책

### 의존성 보안 검사
```bash
# 정기 보안 감사
npm audit --audit-level=high

# 자동 수정
npm audit fix

# 수동 검토 필요한 경우
npm audit fix --force
```

### 신뢰할 수 있는 패키지만 사용
- NestJS 공식 패키지 우선
- 주간 다운로드 100만+ 패키지
- 최근 6개월 내 업데이트된 패키지

## 💡 개발 효율성 도구

### 권장 추가 dev dependencies
```bash
# 코드 품질
npm install -D husky lint-staged

# 개발 편의성
npm install -D nodemon cross-env

# 타입 체킹
npm install -D @types/node @types/jest @types/supertest
```

## 📝 결론

현재 패키지 구성이 **매우 우수**합니다:
- ✅ NestJS 핵심 모듈 완비
- ✅ HTTP 클라이언트 & Redis 캐싱 준비 완료
- ✅ 데이터 검증/변환 도구 완비
- ✅ 테스트 프레임워크 준비 완료

**추가 설치 최소화 전략**으로 빠른 개발 시작이 가능하며, 필요에 따라 점진적으로 기능을 확장할 수 있는 안정적인 기반이 마련되어 있습니다.