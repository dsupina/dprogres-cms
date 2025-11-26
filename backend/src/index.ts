// Load environment variables FIRST (before any imports that need them)
import dotenv from 'dotenv';
dotenv.config();

// Initialize OpenTelemetry FIRST (SF-011)
// CRITICAL: Telemetry must be initialized BEFORE importing instrumented modules (express, pg, etc.)
import { initializeTelemetry } from './config/telemetry';

const PORT = process.env.PORT || 3000;
let otelSDK: Awaited<ReturnType<typeof initializeTelemetry>> | null = null;

// Wrap server initialization in async IIFE to handle async OTEL startup (SF-011)
(async () => {
  try {
    // Initialize OpenTelemetry SDK with proper async handling (SF-011)
    // This MUST happen before importing app.ts (which imports express, pg, etc.)
    otelSDK = await initializeTelemetry();

    // Dynamically import app AFTER telemetry initialization
    // This ensures Express and other modules are patched by OTEL auto-instrumentations
    const { default: app } = await import('./app');

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Start background jobs AFTER server is listening (SF-011)
    const { startAllJobs, stopAllJobs } = await import('./jobs');
    const jobs = startAllJobs();

    // Graceful shutdown handler (SF-011)
    const gracefulShutdown = (signal: string) => {
      console.log(`\n[Server] ${signal} received, shutting down gracefully...`);

      // Stop background jobs first
      stopAllJobs(jobs);

      server.close(() => {
        console.log('[Server] HTTP server closed');

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
