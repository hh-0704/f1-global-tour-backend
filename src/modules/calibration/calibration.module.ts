import { Module } from '@nestjs/common';
import { CoordinateService } from './coordinate.service';
import { TrackGeometryService } from './track-geometry.service';
import { RoadSnapService } from './road-snap.service';

/**
 * 캘리브레이션 모듈 — 프론트 좌표 변환/도로스냅 산출물 이관(서버 보관).
 *
 * 순수 도메인 서비스(외부 의존 없음). positions 파이프라인(Phase 4)이 주입해 사용한다.
 *   - CoordinateService:    (x,y) → (lng,lat) 어파인/2차/TPS 변환
 *   - TrackGeometryService: feat0 geojson 로드 + 호길이/투영 유틸
 *   - RoadSnapService:      진행률 도로스냅(사전계산판)
 */
@Module({
  providers: [CoordinateService, TrackGeometryService, RoadSnapService],
  exports: [CoordinateService, TrackGeometryService, RoadSnapService],
})
export class CalibrationModule {}
