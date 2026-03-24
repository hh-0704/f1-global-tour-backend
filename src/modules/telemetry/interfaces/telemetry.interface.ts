export interface TelemetryFrame {
  timeOffset: number;
  speed: number;
  gear: number;
  throttle: number;
  brake: number;
  drsEnabled: boolean;
  drsAvailable: boolean;
}

export interface DriverTelemetryResponse {
  driverNumber: number;
  driverCode: string;
  teamColor: string;
  frames: TelemetryFrame[];
}
