/**
 * Versions API Service - CV-007
 *
 * API client functions for version comparison and diff functionality
 */

import { apiClient } from '../lib/api';
import { DiffResult, VersionHistory, VersionWithChanges } from '../types/versioning';

export interface CompareVersionsOptions {
  diff_type?: 'text' | 'structural' | 'metadata' | 'all';
  include_unchanged?: boolean;
  algorithm?: 'myers' | 'patience' | 'histogram' | 'semantic';
  granularity?: 'line' | 'word' | 'character';
  context_lines?: number;
  ignore_whitespace?: boolean;
}

export interface ExportDiffOptions {
  version_ids: number[];
  format: 'pdf' | 'html' | 'json' | 'docx';
  include_metadata?: boolean;
  include_statistics?: boolean;
  include_unchanged?: boolean;
  template?: string;
  custom_branding?: boolean;
  page_orientation?: 'portrait' | 'landscape';
}

export const versionsApi = {
  /**
   * Compare two versions and get the diff
   */
  compareVersions: async (
    versionAId: number,
    versionBId: number,
    options: CompareVersionsOptions = {}
  ): Promise<DiffResult> => {
    const params = new URLSearchParams({
      version_a_id: versionAId.toString(),
      version_b_id: versionBId.toString(),
      ...Object.entries(options)
        .filter(([_, v]) => v !== undefined)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {})
    });

    const response = await apiClient.get(`/api/versions/compare?${params}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to compare versions');
    }
    const result = await response.json();
    return result.data;
  },

  /**
   * Get diff between two specific versions
   */
  getDiff: async (
    id1: number,
    id2: number,
    format: 'json' | 'html' | 'unified' = 'json',
    contextLines = 3
  ): Promise<DiffResult | string> => {
    const params = new URLSearchParams({
      format,
      context_lines: contextLines.toString()
    });

    const response = await apiClient.get(`/api/versions/${id1}/diff/${id2}?${params}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get diff');
    }

    if (format === 'html' || format === 'unified') {
      return await response.text();
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * Export diff in various formats
   */
  exportDiff: async (options: ExportDiffOptions): Promise<Blob> => {
    const response = await apiClient.post('/api/versions/diff/export', options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to export diff');
    }
    return await response.blob();
  },

  /**
   * Get changes summary for a version
   */
  getChangesSummary: async (
    versionId: number,
    compareWith: 'previous' | 'published' | 'specific' = 'previous',
    compareVersionId?: number
  ) => {
    const params = new URLSearchParams({
      compare_with: compareWith,
      ...(compareVersionId && { compare_version_id: compareVersionId.toString() })
    });

    const response = await apiClient.get(`/api/versions/${versionId}/changes-summary?${params}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get changes summary');
    }
    const result = await response.json();
    return result.data;
  },

  /**
   * Get version history with diff summaries
   */
  getVersionHistory: async (
    contentType: string,
    contentId: number
  ): Promise<VersionHistory> => {
    const response = await apiClient.get(`/api/versions/history/${contentType}/${contentId}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get version history');
    }
    const result = await response.json();
    return result.data;
  }
};

export default versionsApi;