/**
 * Performance monitoring and metrics collection.
 * Tracks API response times, component render times, and app performance.
 */

import { logger } from '@/lib/logger';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private marks: Map<string, number> = new Map();
  private readonly MAX_METRICS_PER_KEY = 50;

  /**
   * Start a performance measurement
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * End a performance measurement and record the metric
   */
  measure(name: string, metadata?: Record<string, unknown>): number {
    const startTime = this.marks.get(name);
    if (!startTime) {
      logger.warn(`Performance mark not found: ${name}`, { module: 'performance' });
      return 0;
    }

    const duration = performance.now() - startTime;
    this.recordMetric(name, duration, metadata);
    this.marks.delete(name);

    return duration;
  }

  /**
   * Record a metric without explicit start/end
   */
  recordMetric(name: string, duration: number, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricsForKey = this.metrics.get(name)!;
    metricsForKey.push(metric);

    // Keep only recent metrics
    if (metricsForKey.length > this.MAX_METRICS_PER_KEY) {
      metricsForKey.shift();
    }

    // Log slow operations
    if (duration > 1000) {
      logger.warn(`Slow operation: ${name} took ${duration.toFixed(2)}ms`, {
        module: 'performance',
      });
    }
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(name: string): number {
    const metrics = this.metrics.get(name) ?? [];
    if (metrics.length === 0) return 0;

    const sum = metrics.reduce((acc, m) => acc + m.duration, 0);
    return sum / metrics.length;
  }

  /**
   * Get all metrics for a name
   */
  getMetrics(name: string): PerformanceMetric[] {
    return [...(this.metrics.get(name) ?? [])];
  }

  /**
   * Get performance summary
   */
  getSummary(): Record<string, { avg: number; count: number; max: number; min: number }> {
    const summary: Record<string, { avg: number; count: number; max: number; min: number }> = {};

    this.metrics.forEach((metrics, name) => {
      if (metrics.length === 0) return;

      const durations = metrics.map((m) => m.duration);
      const sum = durations.reduce((a, b) => a + b, 0);
      summary[name] = {
        avg: sum / metrics.length,
        count: metrics.length,
        max: Math.max(...durations),
        min: Math.min(...durations),
      };
    });

    return summary;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.marks.clear();
  }

  /**
   * Log performance summary to console
   */
  logSummary(): void {
    const summary = this.getSummary();
    logger.info('Performance Summary', { module: 'performance' });
    Object.entries(summary).forEach(([name, stats]) => {
      logger.info(
        `${name}: avg=${stats.avg.toFixed(2)}ms, min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms (n=${stats.count})`,
        { module: 'performance' }
      );
    });
  }
}

export const performanceMonitor = new PerformanceMonitor();
