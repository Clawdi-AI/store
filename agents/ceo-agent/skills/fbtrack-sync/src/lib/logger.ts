import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

// Custom format for file output
const fileFormat = printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({ timestamp, level, message, ...meta });
});

class Logger {
  private winston: winston.Logger;
  private runId: string;

  constructor() {
    this.runId = this.generateRunId();
    
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    fs.ensureDirSync(logsDir);

    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta: { runId: this.runId },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: combine(
            colorize(),
            timestamp({ format: 'HH:mm:ss' }),
            errors({ stack: true }),
            consoleFormat
          ),
        }),
        // File transport for all logs
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          format: combine(
            timestamp(),
            errors({ stack: true }),
            fileFormat
          ),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        // File transport for errors only
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: combine(
            timestamp(),
            errors({ stack: true }),
            fileFormat
          ),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  private generateRunId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${timestamp}-${random}`;
  }

  getRunId(): string {
    return this.runId;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.winston.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.winston.warn(message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error instanceof Error 
      ? { error: { message: error.message, stack: error.stack } }
      : error ? { error } : {};
    
    this.winston.error(message, { ...errorMeta, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.winston.debug(message, meta);
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    this.winston.verbose(message, meta);
  }

  // Create child logger with additional metadata
  child(defaultMeta: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this.winston.child(defaultMeta), this.runId);
  }

  // Log operation timing
  async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.debug(`Starting ${operation}`);
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`Completed ${operation}`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`Failed ${operation}`, error, { duration });
      throw error;
    }
  }
}

class ChildLogger {
  constructor(
    private winston: winston.Logger,
    private runId: string
  ) {}

  info(message: string, meta?: Record<string, unknown>): void {
    this.winston.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.winston.warn(message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error instanceof Error 
      ? { error: { message: error.message, stack: error.stack } }
      : error ? { error } : {};
    
    this.winston.error(message, { ...errorMeta, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.winston.debug(message, meta);
  }

  getRunId(): string {
    return this.runId;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger, ChildLogger };