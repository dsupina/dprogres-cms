export type BlockType =
  | 'hero'
  | 'heading'
  | 'subheading'
  | 'text'
  | 'richText'
  | 'image'
  | 'gallery'
  | 'quote'
  | 'list'
  | 'columns'
  | 'cta'
  | 'button'
  | 'video'
  | 'embed'
  | 'divider';

export interface BlockAIState {
  provider?: string;
  suggested?: boolean;
  summary?: string | null;
  generatedAt?: string;
  confidence?: number;
}

export interface BlockNode {
  id: string;
  type: BlockType;
  variant?: string | null;
  props: Record<string, any>;
  settings?: Record<string, any>;
  children?: BlockNode[];
  ai?: BlockAIState;
}

export interface RenderedBlockNode {
  id?: string;
  type: BlockType;
  variant?: string | null;
  html: string;
  props: Record<string, any>;
  ai?: BlockAIState;
  children?: RenderedBlockNode[];
}

export interface BlockRenderMeta {
  missingFields: string[];
  aiCalls: number;
  completedBlocks: number;
}

export interface BlockRenderResult {
  html: string;
  tree: RenderedBlockNode[];
  meta: BlockRenderMeta;
}
