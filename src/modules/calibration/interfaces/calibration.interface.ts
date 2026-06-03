// 캘리브레이션(좌표 변환/도로스냅) 타입 정의.
// 프론트 src/features/replay/types/index.ts 의 변환 계수 타입을 그대로 이관한 것.

// 트랙별 어파인 변환 계수 (x,y -> lng,lat)
export interface AffineCoefficients {
  a: number;
  b: number;
  e: number; // lng = a*x + b*y + e
  c: number;
  d: number;
  f: number; // lat = c*x + d*y + f
}

// 트랙별 2차 다항식 변환 계수 (어파인으로 안 잡히는 비선형 왜곡 보정).
// value = [x, y, x², y², xy, 1] 계수 순서
export interface QuadraticCoefficients {
  lng: [number, number, number, number, number, number];
  lat: [number, number, number, number, number, number];
}

// 트랙별 TPS(Thin-Plate Spline) 국소 비선형 변환 계수.
// 검증된 base 어파인 위에 '잔차'만 RBF로 보정한다 (특정 코너의 뱅킹/far-corner 왜곡 대응).
//   lng = (a*x+b*y+e) + res_lng(xn,yn),  lat = (c*x+d*y+f) + res_lat(xn,yn)
//   xn=(x-cx)/s, yn=(y-cy)/s
//   res = α[0] + α[1]*xn + α[2]*yn + Σ w_i·U(r_i),  U(r)=r²·ln r,  r_i=|(xn,yn)-control_i|
export interface TpsResidual {
  a: [number, number, number]; // 잔차의 어파인 항 [1, xn, yn]
  w: number[]; // control_i 별 RBF 가중치 (controls와 같은 길이)
}
export interface TpsCoefficients {
  affine: AffineCoefficients; // base 변환
  norm: { cx: number; cy: number; s: number }; // RBF 수치안정용 정규화
  controls: [number, number][]; // 정규화 좌표계 제어점
  lng: TpsResidual;
  lat: TpsResidual;
}

// 도로 스냅 구간 (진행률 0-1). end<start면 S/F wrap 구간.
export interface SnapZone {
  start: number;
  end: number;
}

// 드라이버 location 시계열 샘플 (OpenF1 x,y 기반, raceStart 기준 상대초 t)
export interface LocationSample {
  t: number;
  x: number;
  y: number;
}

// feat0(트랙 메인 LineString)을 로컬 미터좌표로 변환한 기하 정보.
// road-snap 의 진행률 투영/호길이 매핑에 사용.
export interface TrackGeometry {
  tm: [number, number][]; // feat0 좌표를 로컬 미터로 변환한 점들
  cum: number[]; // 각 점까지 누적 호 길이(m)
  total: number; // 전체 호 길이(m)
  kx: number; // 경도 미터 환산 계수 cos(meanLat)
}
