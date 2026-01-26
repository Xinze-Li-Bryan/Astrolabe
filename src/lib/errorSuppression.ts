/**
 * Global Error Suppression
 *
 * Centralized handling for known harmless errors that should be suppressed.
 * These errors are typically caused by:
 * - Library internals during component unmount (Monaco "Canceled")
 * - Browser layout engines (ResizeObserver loop)
 * - Race conditions in async operations
 *
 * Usage:
 *   import '@/lib/errorSuppression'  // Auto-installs handlers on import
 *
 * To add new suppressions:
 *   Add patterns to HARMLESS_ERROR_PATTERNS array
 */

// ============================================
// Known Harmless Error Patterns
// ============================================

const HARMLESS_ERROR_PATTERNS: Array<{
  pattern: string | RegExp;
  description: string;
}> = [
  {
    pattern: 'Canceled',
    description: 'Monaco Editor async operation cancelled during unmount',
  },
  {
    pattern: 'Canceled: Canceled',
    description: 'Monaco Editor dispose error with full message',
  },
  {
    pattern: /ResizeObserver loop/,
    description: 'Browser ResizeObserver throttling - harmless layout warning',
  },
  {
    pattern: 'Script error.',
    description: 'Cross-origin script error with no details - usually harmless',
  },
];

// ============================================
// Error Detection
// ============================================

/**
 * Check if an error matches known harmless patterns
 */
export function isHarmlessError(error: unknown): boolean {
  if (!error) return false;

  // Get error message from various formats
  const messages: string[] = [];

  if (typeof error === 'string') {
    messages.push(error);
  } else if (typeof error === 'object') {
    const e = error as { message?: string; name?: string; reason?: unknown };
    if (e.message) messages.push(e.message);
    if (e.name) messages.push(e.name);
    if (typeof e.reason === 'string') messages.push(e.reason);
    if (typeof e.reason === 'object' && e.reason) {
      const r = e.reason as { message?: string };
      if (r.message) messages.push(r.message);
    }
  }

  // Check against patterns
  return HARMLESS_ERROR_PATTERNS.some(({ pattern }) => {
    if (typeof pattern === 'string') {
      return messages.some(msg => msg.includes(pattern));
    } else {
      return messages.some(msg => pattern.test(msg));
    }
  });
}

// ============================================
// Global Handlers
// ============================================

let installed = false;

/**
 * Install global error handlers to suppress known harmless errors.
 * Safe to call multiple times - will only install once.
 *
 * This patches multiple layers:
 * 1. Window error events
 * 2. Unhandled promise rejections
 * 3. Console.error (to prevent Next.js error overlay from showing harmless errors)
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;

  const handleError = (event: ErrorEvent) => {
    if (isHarmlessError(event.error) || isHarmlessError(event.message)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isHarmlessError(event.reason)) {
      event.preventDefault();
      return;
    }
  };

  // Use capture phase to intercept before React's error boundary
  window.addEventListener('error', handleError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

  // Patch console.error to filter out harmless errors
  // This prevents Next.js error overlay from showing Monaco "Canceled" errors
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Check if any argument is a harmless error
    const hasHarmlessError = args.some(arg => {
      if (isHarmlessError(arg)) return true;
      // Check string arguments that might contain error messages
      if (typeof arg === 'string' && HARMLESS_ERROR_PATTERNS.some(({ pattern }) => {
        if (typeof pattern === 'string') return arg.includes(pattern);
        return pattern.test(arg);
      })) return true;
      return false;
    });

    if (hasHarmlessError) {
      return; // Suppress the error
    }

    originalConsoleError.apply(console, args);
  };

  // Patch reportError if it exists (used by some browsers and frameworks)
  if (typeof window.reportError === 'function') {
    const originalReportError = window.reportError;
    window.reportError = (error: unknown) => {
      if (isHarmlessError(error)) {
        return;
      }
      originalReportError(error);
    };
  }

  installed = true;
}

// ============================================
// Auto-install on import
// ============================================

installGlobalErrorHandlers();
