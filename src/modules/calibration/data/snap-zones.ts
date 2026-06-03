import { SnapZone } from '../interfaces/calibration.interface';

/**
 * 진행률(호길이) 기반 도로 스냅 구간 (프론트 RoadSnapService.ZONES 이관).
 *
 * 평행한 두 도로가 가까이 붙은 구간(예: monaco 출발선 — pit straight ↔ 접근도로가 ~30m 평행)에서
 * 마커가 옆 도로로 새는 문제를 진행률 전진제약 투영으로 보정한다. TPS(매끄러운 좌표 변환)는
 * "가까운 두 입력 → 멀리 떨어진 두 출력"을 못 만들어 원리적으로 이 분리가 불가능하기 때문.
 *
 * 값은 진행률 0-1. end<start 면 S/F(출발선) wrap 구간.
 */
export const SNAP_ZONES: Record<string, SnapZone[]> = {
  // monaco: 마지막코너~pit straight (S/F 평행구간). end<start = S/F 횡단.
  monaco: [{ start: 0.95, end: 0.13 }],
};

// 구간 경계 블렌드 폭(진행률) ≈ 트랙길이의 2%
export const SNAP_BLEND = 0.02;
// 전진 제약: 뒤로 허용(노이즈)
export const SNAP_BACK_M = 35;
// 전진 제약: 앞으로 허용(데이터 갭 대비, 평행도로보다는 작게)
export const SNAP_FWD_M = 220;
