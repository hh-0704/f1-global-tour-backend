import { OpenF1Session } from '../../common/interfaces/openf1.interface';

/**
 * OpenF1 세션 식별자 → circuitId (geojson/계수 키) 매핑.
 *
 * 좌표계는 circuit_key(트랙)마다 고정·연도 무관(Part A §A.4) → circuit_key 우선 매핑.
 * circuit_key 가 없거나 미등록이면 circuit_short_name 폴백
 * (프론트 ReplayAnimationEngine.mapCircuitName 표 이관).
 */

// circuit_key(연도 무관) → circuitId. plan.md A.6 표 기준.
export const CIRCUIT_KEY_TO_ID: Record<number, string> = {
  63: 'bahrain',
  9: 'usa',
  144: 'azerbaijan',
  15: 'spain',
  4: 'hungary',
  6: 'imola',
  14: 'brazil',
  149: 'saudi-arabia',
  152: 'las-vegas',
  150: 'qatar',
  10: 'australia',
  65: 'mexico',
  151: 'miami',
  22: 'monaco',
  23: 'canada',
  39: 'italy',
  49: 'china',
  2: 'britain',
  61: 'singapore',
  7: 'belgium',
  19: 'austria',
  46: 'japan',
  70: 'abu-dhabi',
  55: 'netherlands',
};

// circuit_short_name 폴백 (프론트 mapCircuitName 표 + OpenF1 short_name 보강).
// ⚠ OpenF1 의 circuit_short_name 은 'Sakhir'(bahrain) 처럼 프론트 목데이터와 다를 수 있음.
export const CIRCUIT_SHORTNAME_TO_ID: Record<string, string> = {
  Sakhir: 'bahrain',
  Bahrain: 'bahrain',
  'Monte Carlo': 'monaco',
  Monaco: 'monaco',
  Silverstone: 'britain',
  Monza: 'italy',
  Suzuka: 'japan',
  'Spa-Francorchamps': 'belgium',
  Interlagos: 'brazil',
  'Albert Park': 'australia',
  Melbourne: 'australia',
  Imola: 'imola',
  Miami: 'miami',
  Barcelona: 'spain',
  Catalunya: 'spain',
  'Red Bull Ring': 'austria',
  Spielberg: 'austria',
  Hungaroring: 'hungary',
  Zandvoort: 'netherlands',
  Baku: 'azerbaijan',
  'Marina Bay': 'singapore',
  Singapore: 'singapore',
  Austin: 'usa',
  'Mexico City': 'mexico',
  'Las Vegas': 'las-vegas',
  Losail: 'qatar',
  Lusail: 'qatar',
  'Yas Marina': 'abu-dhabi',
  'Yas Marina Circuit': 'abu-dhabi',
  Jeddah: 'saudi-arabia',
  Shanghai: 'china',
  'Gilles Villeneuve': 'canada',
  Montreal: 'canada',
};

/** 세션 → circuitId. circuit_key 우선, short_name 폴백, 둘 다 실패 시 정규화 폴백. */
export function resolveCircuitId(
  session: Pick<OpenF1Session, 'circuit_key' | 'circuit_short_name'> | null,
): string | null {
  if (!session) return null;

  if (session.circuit_key != null && session.circuit_key in CIRCUIT_KEY_TO_ID) {
    return CIRCUIT_KEY_TO_ID[session.circuit_key];
  }

  const shortName = session.circuit_short_name;
  if (shortName) {
    if (shortName in CIRCUIT_SHORTNAME_TO_ID) {
      return CIRCUIT_SHORTNAME_TO_ID[shortName];
    }
    // 프론트 mapCircuitName 의 마지막 폴백과 동일: 소문자화 + 공백→하이픈
    return shortName.toLowerCase().replace(/\s+/g, '-');
  }

  return null;
}
