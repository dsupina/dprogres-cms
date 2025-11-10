export type BlockEntityType = 'post' | 'page';
export type BlockType = 'hero' | 'heading' | 'subheading' | 'text' | 'richText' | 'image' | 'gallery' | 'quote' | 'list' | 'columns' | 'cta' | 'button' | 'video' | 'embed' | 'divider';
export interface BlockAIState {
    provider?: string;
    suggested?: boolean;
    summary?: string | null;
    prompts?: string[];
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
export interface BlockSchemaField {
    key: string;
    label: string;
    type: 'string' | 'text' | 'richtext' | 'media' | 'number' | 'link' | 'list' | 'select';
    required?: boolean;
    options?: Array<{
        value: string;
        label: string;
    }>;
    helperText?: string;
}
export interface BlockSchema {
    key: BlockType;
    name: string;
    description?: string;
    fields: BlockSchemaField[];
    defaults?: Record<string, any>;
    aiPrompt?: string;
}
export interface RenderedBlock {
    id?: string;
    type: BlockType;
    variant?: string | null;
    html: string;
    props: Record<string, any>;
    ai?: BlockAIState;
    children?: RenderedBlock[];
}
export interface BlockRenderMeta {
    missingFields: string[];
    aiCalls: number;
    completedBlocks: number;
}
export interface BlockRenderResult {
    html: string;
    tree: RenderedBlock[];
    meta: BlockRenderMeta;
}
//# sourceMappingURL=content.d.ts.map