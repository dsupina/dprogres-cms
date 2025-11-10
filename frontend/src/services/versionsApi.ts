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
    const response = await api.get('/versions/compare', {
      params: {
        version_a_id: versionAId,
        version_b_id: versionBId,
        ...options,
      },
    });
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
    const response = await api.get(`/versions/${id1}/diff/${id2}`, {
      params: {
        format,
        context_lines: contextLines,
      },
      responseType: format === 'json' ? 'json' : 'text',
    });

    if (format === 'json') {
      return (response.data as { data: DiffResult }).data;
    }

    return response.data as string;
  },

  /**
   * Export diff in various formats
   */
  exportDiff: async (options: ExportDiffOptions): Promise<Blob> => {
    const response = await api.post('/versions/diff/export', options, {
      responseType: 'blob',
    });
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
      const response = await api.get(`/versions/${versionId}/changes-summary`, {
        params: {
          compare_with: compareWith,
        ...(compareVersionId ? { compare_version_id: compareVersionId } : {}),
      },
    });
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