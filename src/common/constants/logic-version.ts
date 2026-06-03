// 가공 결과 캐시 무효화용 로직 버전 (plan.md §6 "logic_version").
//
// 계산 로직(프레임 산출·플래그 분류·좌표 파이프라인 등)을 바꿀 때마다 해당 상수를 +1 한다.
// 캐시 조회 시 저장된 logic_version 이 코드 상수와 다르면 miss 처리 → 자동 재계산 후 재저장.
// 원본(openf1_*)은 불변이라 무효화 대상이 아니므로, 재계산 시 OpenF1 재호출은 발생하지 않는다.

export const DRIVER_TIMINGS_LOGIC_VERSION = 1;
export const RACE_FLAGS_LOGIC_VERSION = 1;
export const POSITIONS_LOGIC_VERSION = 1;
