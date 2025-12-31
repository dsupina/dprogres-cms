import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock document.execCommand for Quill editor tests
// This API is deprecated but still used by quill-image-resize-module-react
document.execCommand = vi.fn(() => true);

// Mock getSelection for Quill editor
document.getSelection = vi.fn(() => ({
  removeAllRanges: vi.fn(),
  addRange: vi.fn(),
  getRangeAt: vi.fn(() => ({
    startContainer: document.body,
    startOffset: 0,
    endContainer: document.body,
    endOffset: 0,
    collapsed: true,
    cloneRange: vi.fn(),
  })),
  rangeCount: 0,
  anchorNode: null,
  anchorOffset: 0,
  focusNode: null,
  focusOffset: 0,
  isCollapsed: true,
  type: 'None',
  extend: vi.fn(),
  collapseToStart: vi.fn(),
  collapseToEnd: vi.fn(),
  collapse: vi.fn(),
  selectAllChildren: vi.fn(),
  deleteFromDocument: vi.fn(),
  containsNode: vi.fn(() => false),
  setBaseAndExtent: vi.fn(),
  toString: vi.fn(() => ''),
} as unknown as Selection));

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver for Quill and other components
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Mock MutationObserver for Quill (only if not already defined)
if (typeof global.MutationObserver === 'undefined') {
  class MutationObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }
  global.MutationObserver = MutationObserverMock as unknown as typeof MutationObserver;
}
