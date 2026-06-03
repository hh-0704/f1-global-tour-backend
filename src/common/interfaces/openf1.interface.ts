// OpenF1 API Response Interfaces based on documentation

export interface OpenF1Session {
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  location: string;
  circuit_short_name: string;
  country_name: string;
  country_code: string;
  date_start: string;
  date_end: string;
  year: number;
  circuit_key?: number;
  country_key?: number;
  gmt_offset?: string;
}

export interface OpenF1Driver {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  country_code?: string;
  headshot_url?: string;
}

export interface OpenF1Lap {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  lap_number: number;
  date_start: string;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
  i1_speed?: number | null;
  i2_speed?: number | null;
  speed_i1?: number | null;
  speed_i2?: number | null;
  speed_fl?: number | null;
  speed_st?: number | null;
  segments_sector_1?: number[] | null;
  segments_sector_2?: number[] | null;
  segments_sector_3?: number[] | null;
}

export interface OpenF1CarData {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  date: string;
  brake: number;
  throttle: number;
  drs: number;
  n_gear: number;
  speed: number;
  rpm?: number;
}

export interface OpenF1Interval {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  date: string;
  gap_to_leader: number | null;
  interval: number;
}

export interface OpenF1RaceControl {
  meeting_key: number;
  session_key: number;
  date: string;
  driver_number: number | null;
  lap_number: number | null;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  message: string;
}

export interface OpenF1Stint {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
  tyre_age_at_start: number;
}

// OpenF1 /location — 차량의 트랙별 로컬 직교좌표(x,y,z, 단위 ≈ 0.1m, ~3.7Hz).
// x,y 는 위경도가 아니라 트랙별 좌표계 → calibration 모듈이 (lng,lat)로 변환.
export interface OpenF1Location {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  date: string;
  x: number;
  y: number;
  z: number;
}
