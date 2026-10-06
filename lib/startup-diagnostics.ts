/**
 * Global startup diagnostics — surfaces JS errors that would otherwise silent-crash Expo Go.
 */

import { logger } from '@/lib/logger';

let installed = false;

export function installStartupDiagnostics(): void {
  if (installed) return;
  installed = true;

  const ErrorUtils = (global as typeof global & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;

  const previousHandler = ErrorUtils?.getGlobalHandler?.();

  ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    logger.error(
      `Unhandled ${isFatal ? 'fatal ' : ''}error: ${error.message}`,
      error,
      { module: 'startup-diagnostics' }
    );
    previousHandler?.(error, isFatal);
  });

  // Hermes / RN promise rejections without catch
  const g = global as typeof global & {
    onunhandledrejection?: (event: { reason?: unknown }) => void;
  };
  g.onunhandledrejection = (event: { reason?: unknown }) => {
    const reason = event?.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled promise rejection', err, { module: 'startup-diagnostics' });
  };

  logger.info('Startup diagnostics installed', { module: 'startup-diagnostics' });
}
