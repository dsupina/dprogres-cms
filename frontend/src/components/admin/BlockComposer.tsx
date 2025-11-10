import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  UniqueIdentifier,
  closestCenter
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusCircle,
  GripVertical,
  Trash2,
  Sparkles,
  Copy,
  Image as ImageIcon,
  List as ListIcon,
  LayoutGrid
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { mediaService } from '@/services/media';
import type { MediaFile } from '@/types';
import type { BlockNode, BlockType, RenderedBlockNode, BlockRenderResult } from '@/types/content';
import { featureFlags } from '@/lib/config';

interface BlockComposerProps {
  value: BlockNode[];
  onChange: (blocks: BlockNode[]) => void;
  missingFields?: string[];
  onRequestPreview?: (blocks: BlockNode[]) => Promise<BlockRenderResult>;
}

interface BlockFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'list' | 'media' | 'url';
  helper?: string;
  options?: Array<{ label: string; value: string | number }>;
}

interface BlockDefinition {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaults: Partial<BlockNode>;
  fields: BlockFieldDefinition[];
  supportsChildren?: boolean;
}

const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const BLOCK_LIBRARY: BlockDefinition[] = [
  {
    type: 'hero',
    label: 'Hero',
    description: 'Large hero banner with headline and optional media.',
    icon: <Sparkles className="h-4 w-4" />,
    defaults: {
      props: {
        title: 'Welcome to the story',
        subtitle: 'Craft a compelling introduction for your readers.',
        ctaLabel: 'Continue reading',
        ctaHref: '/blog'
      }
    },
    fields: [
      { key: 'title', label: 'Headline', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'ctaLabel', label: 'Button label', type: 'text' },
      { key: 'ctaHref', label: 'Button link', type: 'url' },
      { key: 'mediaUrl', label: 'Hero image', type: 'media', helper: 'Choose from the media library' }
    ]
  },
  {
    type: 'heading',
    label: 'Heading',
    description: 'Section heading for major content transitions.',
    icon: <PlusCircle className="h-4 w-4" />,
    defaults: {
      props: {
        text: 'Section heading',
        level: 2
      }
    },
    fields: [
      { key: 'text', label: 'Heading text', type: 'text' },
      {
        key: 'level',
        label: 'Heading level',
        type: 'select',
        options: [
          { label: 'H1', value: 1 },
          { label: 'H2', value: 2 },
          { label: 'H3', value: 3 },
          { label: 'H4', value: 4 }
        ]
      }
    ]
  },
  {
    type: 'text',
    label: 'Text',
    description: 'Rich paragraph text.',
    icon: <ListIcon className="h-4 w-4" />,
    defaults: {
      props: {
        body: 'Add supporting narrative for this section.'
      }
    },
    fields: [{ key: 'body', label: 'Paragraph', type: 'textarea' }]
  },
  {
    type: 'richText',
    label: 'Rich Text',
    description: 'Supports HTML or Markdown snippets.',
    icon: <ListIcon className="h-4 w-4" />,
    defaults: {
      props: {
        body: '<p>Describe the topic in detail.</p>'
      }
    },
    fields: [{ key: 'body', label: 'Markup', type: 'textarea', helper: 'Supports HTML.' }]
  },
  {
    type: 'image',
    label: 'Image',
    description: 'Standalone image with caption.',
    icon: <ImageIcon className="h-4 w-4" />,
    defaults: {
      props: {
        src: '',
        alt: '',
        caption: ''
      }
    },
    fields: [
      { key: 'src', label: 'Image', type: 'media' },
      { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text' }
    ]
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'Pull quote with attribution.',
    icon: <Sparkles className="h-4 w-4" />,
    defaults: {
      props: {
        quote: '“A memorable quote reinforces your perspective.”',
        attribution: 'Source name'
      }
    },
    fields: [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'attribution', label: 'Attribution', type: 'text' }
    ]
  },
  {
    type: 'list',
    label: 'List',
    description: 'Bullet list of ideas.',
    icon: <ListIcon className="h-4 w-4" />,
    defaults: {
      props: {
        items: ['Point one', 'Point two', 'Point three']
      }
    },
    fields: [{ key: 'items', label: 'Items (one per line)', type: 'list' }]
  },
  {
    type: 'columns',
    label: 'Columns',
    description: 'Two or more column layout for nested blocks.',
    icon: <LayoutGrid className="h-4 w-4" />,
    defaults: {
      props: {
        columns: 2
      },
      children: []
    },
    fields: [{ key: 'columns', label: 'Number of columns', type: 'number', helper: 'Between 2 and 4 columns recommended.' }],
    supportsChildren: true
  },
  {
    type: 'cta',
    label: 'Call to action',
    description: 'Emphasised call-to-action band.',
    icon: <Sparkles className="h-4 w-4" />,
    defaults: {
      props: {
        title: 'Ready to take the next step?',
        body: 'Invite readers to continue the journey.',
        ctaLabel: 'Get started',
        ctaHref: '/contact'
      }
    },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'ctaLabel', label: 'Button label', type: 'text' },
      { key: 'ctaHref', label: 'Button link', type: 'url' }
    ]
  }
];

const cloneBlock = (block: BlockNode): BlockNode => ({
  ...block,
  id: generateId(),
  props: { ...block.props },
  settings: block.settings ? { ...block.settings } : undefined,
  ai: block.ai ? { ...block.ai } : undefined,
  children: block.children ? block.children.map(cloneBlock) : []
});

const updateBlocksAtPath = (
  blocks: BlockNode[],
  path: number[],
  updater: (block: BlockNode) => BlockNode
): BlockNode[] => {
  if (path.length === 0) {
    return blocks;
  }

  const [index, ...rest] = path;
  return blocks.map((block, idx) => {
    if (idx !== index) return block;
    if (rest.length === 0) {
      return updater(block);
    }
    const children = block.children ? updateBlocksAtPath(block.children, rest, updater) : [];
    return { ...block, children };
  });
};

const removeBlockAtPath = (blocks: BlockNode[], path: number[]): BlockNode[] => {
  if (path.length === 0) return blocks;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    return blocks.filter((_, idx) => idx !== index);
  }
  return blocks.map((block, idx) => {
    if (idx !== index) return block;
    const children = block.children ? removeBlockAtPath(block.children, rest) : [];
    return { ...block, children };
  });
};

const reorderBlocks = (
  blocks: BlockNode[],
  path: number[],
  fromIndex: number,
  toIndex: number
): BlockNode[] => {
  if (path.length === 0) {
    return arrayMove(blocks, fromIndex, toIndex);
  }
  const [index, ...rest] = path;
  return blocks.map((block, idx) => {
    if (idx !== index) return block;
    const children = block.children ? reorderBlocks(block.children, rest, fromIndex, toIndex) : [];
    return { ...block, children };
  });
};

const mergeRenderedBlocks = (
  rendered: RenderedBlockNode[],
  originals: BlockNode[]
): BlockNode[] => {
  return rendered.map((node) => {
    const match = node.id ? originals.find((block) => block.id === node.id) : undefined;
    const id = match?.id || node.id || generateId();
    return {
      id,
      type: node.type,
      variant: node.variant || null,
      props: { ...(node.props || {}) },
      ai: node.ai,
      children: node.children ? mergeRenderedBlocks(node.children, match?.children || []) : []
    };
  });
};

const getMissingForPath = (missingFields: string[], path: number[]): boolean => {
  if (path.length === 0) return false;
  const prefix = path
    .map((segment, idx) => (idx === 0 ? `blocks[${segment}]` : `.children[${segment}]`))
    .join('');
  return missingFields.some((field) => field.startsWith(prefix));
};

const BlockComposer: React.FC<BlockComposerProps> = ({ value, onChange, missingFields = [], onRequestPreview }) => {
  const [blocks, setBlocks] = useState<BlockNode[]>(value);
  const [aiLoading, setAiLoading] = useState(false);
  const [mediaState, setMediaState] = useState<{
    open: boolean;
    path: number[] | null;
    loading: boolean;
    files: MediaFile[];
  }>({ open: false, path: null, loading: false, files: [] });

  useEffect(() => {
    setBlocks(value);
  }, [value]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const idPathMap = useMemo(() => {
    const map = new Map<string, number[]>();
    const walk = (items: BlockNode[], parent: number[] = []) => {
      items.forEach((block, index) => {
        const path = [...parent, index];
        map.set(block.id, path);
        if (block.children && block.children.length > 0) {
          walk(block.children, path);
        }
      });
    };
    walk(blocks);
    return map;
  }, [blocks]);

  const updateBlocks = (updater: (prev: BlockNode[]) => BlockNode[]) => {
    setBlocks((prev) => {
      const next = updater(prev);
      onChange(next);
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activePath = idPathMap.get(active.id as UniqueIdentifier as string);
    const overPath = idPathMap.get(over.id as UniqueIdentifier as string);
    if (!activePath || !overPath) return;

    const activeParent = activePath.slice(0, -1);
    const overParent = overPath.slice(0, -1);

    // Prevent dragging across different parents for now
    if (activeParent.join('.') !== overParent.join('.')) {
      return;
    }

    const fromIndex = activePath[activePath.length - 1];
    const toIndex = overPath[overPath.length - 1];

    updateBlocks((prev) => reorderBlocks(prev, activeParent, fromIndex, toIndex));
  };

  const addBlock = (type: BlockType, path: number[] = []) => {
    const definition = BLOCK_LIBRARY.find((item) => item.type === type);
    if (!definition) return;

    const newBlock: BlockNode = {
      id: generateId(),
      type,
      variant: definition.defaults.variant || null,
      props: definition.defaults.props ? { ...definition.defaults.props } : {},
      settings: definition.defaults.settings ? { ...definition.defaults.settings } : undefined,
      ai: undefined,
      children: definition.supportsChildren ? [] : undefined
    };

    if (path.length === 0) {
      updateBlocks((prev) => [...prev, newBlock]);
    } else {
      updateBlocks((prev) => updateBlocksAtPath(prev, path, (block) => ({
        ...block,
        children: block.children ? [...block.children, newBlock] : [newBlock]
      })));
    }
  };

  const updateBlockProps = (path: number[], key: string, value: any) => {
    updateBlocks((prev) => updateBlocksAtPath(prev, path, (block) => ({
      ...block,
      props: {
        ...block.props,
        [key]: value
      }
    })));
  };

  const updateBlockVariant = (path: number[], variant: string | null) => {
    updateBlocks((prev) => updateBlocksAtPath(prev, path, (block) => ({
      ...block,
      variant
    })));
  };

  const removeBlock = (path: number[]) => {
    updateBlocks((prev) => removeBlockAtPath(prev, path));
  };

  const duplicateBlock = (path: number[]) => {
    updateBlocks((prev) => {
      const parentPath = path.slice(0, -1);
      const index = path[path.length - 1];
      if (parentPath.length === 0) {
        const clone = cloneBlock(prev[index]);
        const updated = [...prev];
        updated.splice(index + 1, 0, clone);
        return updated;
      }
      return updateBlocksAtPath(prev, parentPath, (block) => {
        const children = block.children ? [...block.children] : [];
        const source = children[index];
        if (!source) return block;
        children.splice(index + 1, 0, cloneBlock(source));
        return { ...block, children };
      });
    });
  };

  const openMediaPicker = async (path: number[]) => {
    setMediaState({ open: true, path, loading: true, files: [] });
    try {
      const response = await mediaService.getMediaFiles();
      setMediaState({ open: true, path, loading: false, files: response.mediaFiles || [] });
    } catch (error) {
      console.error(error);
      toast.error('Unable to fetch media assets');
      setMediaState((state) => ({ ...state, loading: false }));
    }
  };

  const selectMedia = (file: MediaFile) => {
    if (!mediaState.path) return;
    updateBlockProps(mediaState.path, 'mediaId', file.id);
    updateBlockProps(mediaState.path, 'src', file.file_path);
    updateBlockProps(mediaState.path, 'alt', file.alt_text || file.original_name);
    setMediaState({ open: false, path: null, loading: false, files: [] });
  };

  const handleAiPreview = async () => {
    if (!onRequestPreview) return;
    setAiLoading(true);
    try {
      const result = await onRequestPreview(blocks);
      if (result?.tree) {
        const nextBlocks = mergeRenderedBlocks(result.tree, blocks);
        updateBlocks(() => nextBlocks);
        if (result.meta?.missingFields) {
          // Bubble missing field info up via onChange through updateBlocks call
        }
        toast.success('Applied AI suggestions');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate AI suggestions');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BLOCK_LIBRARY.map((block) => (
          <button
            key={block.type}
            type="button"
            onClick={() => addBlock(block.type)}
            className="group flex items-start gap-3 rounded-lg border border-dashed border-gray-300 bg-white p-3 text-left transition hover:border-primary-500 hover:bg-primary-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              {block.icon}
            </span>
            <span>
              <span className="font-semibold text-gray-900">{block.label}</span>
              <span className="block text-sm text-gray-500">{block.description}</span>
            </span>
          </button>
        ))}
      </div>

      {missingFields.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          Some blocks are missing required fields. Highlighted cards indicate what needs attention.
        </div>
      )}

      {featureFlags.enableBlockAI && onRequestPreview && (
        <div className="flex justify-end">
          <Button onClick={handleAiPreview} disabled={aiLoading || blocks.length === 0} variant="outline">
            <Sparkles className="mr-2 h-4 w-4" />
            {aiLoading ? 'Generating…' : 'Auto-fill with AI'}
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <BlockList
          blocks={blocks}
          path={[]}
          onUpdateProps={updateBlockProps}
          onUpdateVariant={updateBlockVariant}
          onRemove={removeBlock}
          onDuplicate={duplicateBlock}
          onAddChild={addBlock}
          openMediaPicker={openMediaPicker}
          missingFields={missingFields}
        />
      </DndContext>

      {mediaState.open && (
        <Modal
          title="Select media"
          onClose={() => setMediaState({ open: false, path: null, loading: false, files: [] })}
        >
          <div className="space-y-4">
            {mediaState.loading ? (
              <div className="py-6 text-center text-sm text-gray-500">Loading media…</div>
            ) : mediaState.files.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">Upload media from the Media Library to use in blocks.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {mediaState.files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className="overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:shadow"
                    onClick={() => selectMedia(file)}
                  >
                    <div className="aspect-video bg-gray-100">
                      <img
                        src={file.file_path}
                        alt={file.alt_text || file.original_name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium text-gray-900">{file.original_name}</div>
                      {file.alt_text && <div className="text-xs text-gray-500">{file.alt_text}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

interface BlockListProps {
  blocks: BlockNode[];
  path: number[];
  onUpdateProps: (path: number[], key: string, value: any) => void;
  onUpdateVariant: (path: number[], variant: string | null) => void;
  onRemove: (path: number[]) => void;
  onDuplicate: (path: number[]) => void;
  onAddChild: (type: BlockType, path: number[]) => void;
  openMediaPicker: (path: number[]) => void;
  missingFields: string[];
}

const BlockList: React.FC<BlockListProps> = ({
  blocks,
  path,
  onUpdateProps,
  onUpdateVariant,
  onRemove,
  onDuplicate,
  onAddChild,
  openMediaPicker,
  missingFields
}) => {
  const ids = useMemo(() => blocks.map((block) => block.id), [blocks]);

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className="space-y-4">
        {blocks.map((block, index) => (
          <SortableBlock
            key={block.id}
            block={block}
            path={[...path, index]}
            onUpdateProps={onUpdateProps}
            onUpdateVariant={onUpdateVariant}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
            onAddChild={onAddChild}
            openMediaPicker={openMediaPicker}
            missingFields={missingFields}
          />
        ))}
      </div>
    </SortableContext>
  );
};

interface SortableBlockProps {
  block: BlockNode;
  path: number[];
  onUpdateProps: (path: number[], key: string, value: any) => void;
  onUpdateVariant: (path: number[], variant: string | null) => void;
  onRemove: (path: number[]) => void;
  onDuplicate: (path: number[]) => void;
  onAddChild: (type: BlockType, path: number[]) => void;
  openMediaPicker: (path: number[]) => void;
  missingFields: string[];
}

const SortableBlock: React.FC<SortableBlockProps> = ({
  block,
  path,
  onUpdateProps,
  onUpdateVariant,
  onRemove,
  onDuplicate,
  onAddChild,
  openMediaPicker,
  missingFields
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const definition = BLOCK_LIBRARY.find((item) => item.type === block.type);
  const blockHasMissing = getMissingForPath(missingFields, path);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'rounded-lg border bg-white p-4 shadow-sm transition',
        blockHasMissing ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-grab text-gray-400 hover:text-gray-600"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <span className="font-semibold text-gray-900">{definition?.label || block.type}</span>
          </div>
          {definition?.description && (
            <p className="text-xs text-gray-500">{definition.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onDuplicate(path)}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(path)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {definition && (
        <div className="mt-4 space-y-3">
          {definition.fields.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              block={block}
              path={path}
              onUpdateProps={onUpdateProps}
              openMediaPicker={openMediaPicker}
            />
          ))}

          {definition.supportsChildren && (
            <div className="mt-4 space-y-3">
              <div className="text-sm font-semibold text-gray-800">Nested blocks</div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onAddChild('text', path)}
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add child block
              </Button>
              {block.children && block.children.length > 0 && (
                <div className="ml-4 border-l border-dashed border-gray-200 pl-4">
                  <BlockList
                    blocks={block.children}
                    path={path}
                    onUpdateProps={onUpdateProps}
                    onUpdateVariant={onUpdateVariant}
                    onRemove={onRemove}
                    onDuplicate={onDuplicate}
                    onAddChild={onAddChild}
                    openMediaPicker={openMediaPicker}
                    missingFields={missingFields}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface FieldEditorProps {
  field: BlockFieldDefinition;
  block: BlockNode;
  path: number[];
  onUpdateProps: (path: number[], key: string, value: any) => void;
  openMediaPicker: (path: number[]) => void;
}

const FieldEditor: React.FC<FieldEditorProps> = ({ field, block, path, onUpdateProps, openMediaPicker }) => {
  const value = block.props?.[field.key];

  switch (field.type) {
    case 'text':
      return (
        <Input
          label={field.label}
          value={value ?? ''}
          onChange={(event) => onUpdateProps(path, field.key, event.target.value)}
          helperText={field.helper}
        />
      );
    case 'textarea':
      return (
        <Textarea
          label={field.label}
          value={value ?? ''}
          onChange={(event) => onUpdateProps(path, field.key, event.target.value)}
          helperText={field.helper}
          rows={4}
        />
      );
    case 'list':
      return (
        <Textarea
          label={field.label}
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(event) =>
            onUpdateProps(path, field.key, event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))
          }
          helperText={field.helper || 'Separate each item with a new line.'}
          rows={4}
        />
      );
    case 'select':
      return (
        <Select
          label={field.label}
          value={String(value ?? '')}
          onChange={(event) => onUpdateProps(path, field.key, Number(event.target.value))}
          options={(field.options || []).map((option) => ({ label: option.label, value: String(option.value) }))}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          label={field.label}
          value={value ?? ''}
          onChange={(event) => onUpdateProps(path, field.key, Number(event.target.value))}
          helperText={field.helper}
        />
      );
    case 'media':
      return (
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => openMediaPicker(path)}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Choose media
            </Button>
            {value && (
              <span className="text-sm text-gray-600 truncate">{value}</span>
            )}
          </div>
          {field.helper && <p className="text-xs text-gray-500">{field.helper}</p>}
        </div>
      );
    case 'url':
      return (
        <Input
          type="url"
          label={field.label}
          value={value ?? ''}
          onChange={(event) => onUpdateProps(path, field.key, event.target.value)}
          helperText={field.helper}
        />
      );
    default:
      return null;
  }
};

export default BlockComposer;
