export class ApiResponseDto<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;

  constructor(data?: T, error?: { code: string; message: string; details?: any }) {
    this.success = !error;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }

  static success<T>(data: T): ApiResponseDto<T> {
    return new ApiResponseDto(data);
  }

  static error<T>(code: string, message: string, details?: any): ApiResponseDto<T> {
    return new ApiResponseDto<T>(undefined, { code, message, details });
  }
}