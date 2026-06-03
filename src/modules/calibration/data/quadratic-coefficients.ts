import { QuadraticCoefficients } from '../interfaces/calibration.interface';

/**
 * 트랙별 2차 다항식 변환 계수 (어파인으로 안 잡히는 전역 비선형 왜곡).
 *
 * 현재 모든 비선형 트랙은 TPS(tps-coefficients.ts)로 이전됨 → 비어있음.
 * 향후 2차 보정이 필요한 트랙 확장 대비용으로 유지 (변환 우선순위: TPS > 2차 > 어파인).
 */
export const QUADRATIC_COEFFICIENTS: Record<string, QuadraticCoefficients> = {
  // (italy/netherlands 는 TPS 로 이전됨)
};
