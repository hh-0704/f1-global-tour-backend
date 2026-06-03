import { Injectable } from '@nestjs/common';
import {
  AffineCoefficients,
  QuadraticCoefficients,
  TpsCoefficients,
} from './interfaces/calibration.interface';
import { AFFINE_COEFFICIENTS } from './data/affine-coefficients';
import { QUADRATIC_COEFFICIENTS } from './data/quadratic-coefficients';
import { TPS_COEFFICIENTS } from './data/tps-coefficients';

/**
 * OpenF1 location (x, y) 로컬 좌표를 위경도(lng, lat)로 변환한다.
 *
 * 프론트 LocationCoordinateService 를 그대로 백엔드로 포팅한 것 (런타임 결과가
 * 프론트 PoC 와 수치적으로 동일해야 한다 — test/coordinate.service.spec.ts 로 보장).
 *
 * 트랙마다 변환 구조가 다를 수 있다 (우선순위: TPS > 2차 > 어파인):
 *   - 어파인 (대부분):   lng = a*x + b*y + e,  lat = c*x + d*y + f
 *   - 2차 다항식 (일부):  어파인으로 안 잡히는 전역 비선형 왜곡
 *   - TPS (일부):        특정 코너(뱅킹·far-corner 왜곡)가 전역 변환으로 안 잡히는 트랙.
 *                        base 어파인 + 국소 RBF 잔차 보정 (italy/monaco/netherlands)
 */
@Injectable()
export class CoordinateService {
  // TPS 트랙 (특정 코너 국소 보정). 모든 변환보다 우선.
  private readonly tps: Record<string, TpsCoefficients> = TPS_COEFFICIENTS;
  // 2차 다항식 트랙 (어파인으로 부족한 경우). 어파인보다 우선.
  private readonly quadratic: Record<string, QuadraticCoefficients> =
    QUADRATIC_COEFFICIENTS;
  // 트랙별 어파인 계수
  private readonly coefficients: Record<string, AffineCoefficients> =
    AFFINE_COEFFICIENTS;

  hasCalibration(circuitId: string): boolean {
    return (
      circuitId in this.tps ||
      circuitId in this.quadratic ||
      circuitId in this.coefficients
    );
  }

  getCoefficients(circuitId: string): AffineCoefficients | null {
    return this.coefficients[circuitId] ?? null;
  }

  /** OpenF1 (x, y) -> [lng, lat]. 우선순위 TPS > 2차 > 어파인. 계수 없으면 null. */
  toLngLat(circuitId: string, x: number, y: number): [number, number] | null {
    const tps = this.tps[circuitId];
    if (tps) return this.applyTps(tps, x, y);

    const q = this.quadratic[circuitId];
    if (q) {
      return [this.applyQuad(q.lng, x, y), this.applyQuad(q.lat, x, y)];
    }
    const c = this.coefficients[circuitId];
    if (!c) return null;
    const lng = c.a * x + c.b * y + c.e;
    const lat = c.c * x + c.d * y + c.f;
    return [lng, lat];
  }

  // value = [x, y, x², y², xy, 1] 계수
  private applyQuad(
    k: QuadraticCoefficients['lng'],
    x: number,
    y: number,
  ): number {
    return (
      k[0] * x + k[1] * y + k[2] * x * x + k[3] * y * y + k[4] * x * y + k[5]
    );
  }

  // base 어파인 + 국소 RBF 잔차. U(r)=r²·ln r (r은 정규화 좌표계 거리).
  private applyTps(t: TpsCoefficients, x: number, y: number): [number, number] {
    const { affine: af, norm, controls, lng, lat } = t;
    const xn = (x - norm.cx) / norm.s;
    const yn = (y - norm.cy) / norm.s;

    let resLng = lng.a[0] + lng.a[1] * xn + lng.a[2] * yn;
    let resLat = lat.a[0] + lat.a[1] * xn + lat.a[2] * yn;
    for (let i = 0; i < controls.length; i++) {
      const dx = xn - controls[i][0];
      const dy = yn - controls[i][1];
      const r2 = dx * dx + dy * dy;
      const u = r2 > 1e-12 ? 0.5 * r2 * Math.log(r2) : 0; // r²·ln r = ½·r²·ln(r²)
      resLng += lng.w[i] * u;
      resLat += lat.w[i] * u;
    }

    const baseLng = af.a * x + af.b * y + af.e;
    const baseLat = af.c * x + af.d * y + af.f;
    return [baseLng + resLng, baseLat + resLat];
  }
}
