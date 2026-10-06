/**
 * Professional logging infrastructure for production monitoring.
 * Handles console logs with severity levels and optional remote reporting.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  userId?: number;
  timestamp?: string;
  requestId?: string;
}

class Logger {
  private logBuffer: Array<{ level: LogLevel; message: string; context?: LogContext; error?: Error }> = [];
  private maxBufferSize = 100;

  log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry = { level, message, context, error, timestamp: new Date().toISOString() };
    
    // Add to buffer for potential remote reporting
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Format and output to console
    const output = this.formatLog(level, message, context);
    
    switch (level) {
      case 'debug':
        console.debug(`[DEBUG] ${output}`, error || '');
        break;
      case 'info':
        console.log(`[INFO] ${output}`, error || '');
        break;
      case 'warn':
        console.warn(`[WARN] ${output}`, error || '');
        break;
      case 'error':
        console.error(`[ERROR] ${output}`, error || '');
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log('error', message, context, error);
  }

  private formatLog(_level: LogLevel, message: string, context?: LogContext): string {
    const parts = [message];
    if (context?.module) parts.push(`(${context.module})`);
    if (context?.userId) parts.push(`user:${context.userId}`);
    if (context?.requestId) parts.push(`req:${context.requestId}`);
    return parts.join(' ');
  }

  getBuffer(): typeof this.logBuffer {
    return [...this.logBuffer];
  }

  clearBuffer(): void {
    this.logBuffer = [];
  }
}

export const logger = new Logger();
