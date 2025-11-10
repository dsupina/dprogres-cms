/**
 * Versions API Service - CV-007
 *
 * API client functions for version comparison and diff functionality
 */

import api from '../lib/api';
import { DiffResult, VersionHistory } from '../types/versioning';

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

    const response = await api.get('/versions/compare', { params });
    return response.data.data as DiffResult;
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

    const response = await api.get(`/versions/${id1}/diff/${id2}`, {
      params,
      responseType: format === 'json' ? 'json' : 'text',
    });

    if (format === 'html' || format === 'unified') {
      return response.data as string;
    }

    return (response.data as { data: DiffResult }).data;
  },

  /**
   * Export diff in various formats
   */
  exportDiff: async (options: ExportDiffOptions): Promise<Blob> => {
    const response = await api.post('/versions/diff/export', options, {
      responseType: options.format === 'json' ? 'json' : 'blob',
    });

    if (options.format === 'json') {
      return new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
    }

    return response.data as Blob;
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

    const response = await api.get(`/versions/${versionId}/changes-summary`, { params });
    return response.data.data;
  },

  /**
   * Get version history with diff summaries
   */
  getVersionHistory: async (
    contentType: string,
    contentId: number
  ): Promise<VersionHistory> => {
    const response = await api.get(`/versions/history/${contentType}/${contentId}`);
    return response.data.data as VersionHistory;
  }
};

export default versionsApi;