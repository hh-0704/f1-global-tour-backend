export type SectorPerformance = 'fastest' | 'personal_best' | 'normal' | 'none';
export type TireCompound =
  | 'SOFT'
  | 'MEDIUM'
  | 'HARD'
  | 'INTERMEDIATE'
  | 'WET'
  | 'UNKNOWN';

export interface MiniSector {
  sector1: SectorPerformance;
  sector2: SectorPerformance;
  sector3: SectorPerformance;
}

export interface TireInfo {
  compound: TireCompound;
  lapCount: number;
  pitStops: number;
}

export interface DriverDisplayRow {
  position: number;
  driverCode: string;
  teamColor: string;
  interval: string;
  intervalToAhead: string;
  currentLapTime: string;
  bestLapTime: string;
  miniSector: MiniSector;
  tireInfo: TireInfo;
}

export interface DriverDisplayFrame {
  timeOffset: number;
  currentLap: number;
  drivers: DriverDisplayRow[];
}

export interface DriverTimingsResponse {
  frames: DriverDisplayFrame[];
}
