// Query parameter interfaces for OpenF1 API calls

export interface SessionsQueryParams {
  country_name?: string;
  year?: string;
  session_key?: number;
  session_name?: string;
}

export interface DriversQueryParams {
  session_key: number;
  driver_number?: number;
}

export interface LapsQueryParams {
  session_key: number;
  driver_number?: number;
  lap_number?: number;
}

export interface CarDataQueryParams {
  session_key: number;
  driver_number: number;
  date_start?: string;
  date_end?: string;
}

export interface IntervalsQueryParams {
  session_key: number;
  date?: string;
}

export interface RaceControlQueryParams {
  session_key?: number;
  date?: string;
  category?: string;
  flag?: string;
}

export interface StintsQueryParams {
  session_key: number;
  driver_number?: number;
}
