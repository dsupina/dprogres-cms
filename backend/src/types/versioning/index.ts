/**
 * Versioning System Type Definitions - Main Export
 * Ticket: CV-002
 *
 * Comprehensive type system for content versioning with multi-site support,
 * security, performance optimization, and real-time collaboration
 */

// Core types and interfaces
export * from './core';
export * from './enums';
export * from './api';
export * from './security';
export * from './performance';
export * from './websocket';
export * from './guards';

// No need to re-export - they're already exported above

// Default export for backward compatibility
export { default as ContentVersionDefault } from './core';