// Load environment variables FIRST (before any imports that need them)
import dotenv from 'dotenv';
dotenv.config();

// Initialize OpenTelemetry FIRST (SF-011)
// CRITICAL: Telemetry must be initialized BEFORE importing instrumented modules (express, pg, etc.)
// Otherwise auto-instrumentation won't patch those modules and no spans will be generated
import { initializeTelemetry } from './config/telemetry';

// Import scheduled jobs (SF-011)
import { startResetQuotasJob, stopResetQuotasJob } from './jobs/resetQuotasJob';

const PORT = process.env.PORT || 3000;
let otelSDK: Awaited<ReturnType<typeof initializeTelemetry>> | null = null;

// Wrap server initialization in async IIFE to handle async OTEL startup (SF-011)
// CommonJS doesn't support top-level await, so we use IIFE pattern
(async () => {
  try {
    // Initialize OpenTelemetry SDK with proper async handling (SF-011)
    // This MUST happen before importing app.ts (which imports express, pg, etc.)
    otelSDK = await initializeTelemetry();

    // Dynamically import app AFTER telemetry initialization
    // This ensures Express and other modules are patched by OTEL auto-instrumentations
    const { default: app } = await import('./app');

    // Start server
    const server = app.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

      // Start scheduled jobs (SF-011)
      try {
        await startResetQuotasJob();
        console.log('[Server] Scheduled jobs started successfully');
      } catch (error) {
        console.error('[Server] Failed to start scheduled jobs:', error);
      }
    });

    // Graceful shutdown handler (SF-011)
    const gracefulShutdown = (signal: string) => {
      console.log(`\n[Server] ${signal} received, shutting down gracefully...`);

      // Stop accepting new connections
      server.close(() => {
        console.log('[Server] HTTP server closed');

        // Stop scheduled jobs
        stopResetQuotasJob();
        console.log('[Server] Scheduled jobs stopped');

        // Shutdown OpenTelemetry
        if (otelSDK) {
          otelSDK.shutdown()
            .then(() => {
              console.log('[Server] OpenTelemetry shut down successfully');
              process.exit(0);
            })
            .catch((error) => {
              console.error('[Server] Error shutting down OpenTelemetry:', error);
              process.exit(1);
            });
        } else {
          process.exit(0);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('[Server] Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('[Server] Fatal error during server initialization:', error);
    process.exit(1);
  }
})();
