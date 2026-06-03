// positions 응답 타입 (plan.md §7.1 / §13).
// 프론트 DriverPositionSample / PositionsResponse 와 이름·필드 동일하게 유지할 것.

// 렌더 직전 좌표 (변환·스냅 완료됨). 프론트는 시간 보간만 수행.
export interface PositionSample {
  t: number; // raceStart 기준 상대 초
  lng: number;
  lat: number;
}

export interface PositionsResponse {
  sessionKey: number;
  circuitId: string;
  drivers: Record<string, { samples: PositionSample[] }>; // key = driver_number
}
