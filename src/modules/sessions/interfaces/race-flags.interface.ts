export type FlagStatus = 'GREEN' | 'RED' | 'SC' | 'VSC' | 'YELLOW';
export type LapFlagStatus = 'NONE' | 'RED' | 'SC' | 'VSC' | 'YELLOW';
export type FrontendSessionType = 'RACE' | 'QUALIFYING' | 'PRACTICE';

export interface RaceFlagsResponse {
  sessionType: FrontendSessionType;
  totalLaps: number;
  lapFlags: LapFlagStatus[];
  totalMinutes: number;
  minuteFlags: LapFlagStatus[];
}
