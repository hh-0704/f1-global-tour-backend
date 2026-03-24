export interface TransformedLap {
  lapNumber: number;
  lapTime: number | null;
  sectors: {
    sector1: number | null;
    sector2: number | null;
    sector3: number | null;
  };
  isPitOutLap: boolean;
  isDNF: boolean;
  timestamp: string;
  driverNumber: number;
  sessionKey: number;
}
