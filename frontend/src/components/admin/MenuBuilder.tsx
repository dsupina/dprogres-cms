import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Save,
  X
} from 'lucide-react';
import { MenuItem, menuService } from '../../services/menus';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '../ui/Button';
import { toast } from 'react-hot-toast';
import { api } from '../../lib/api';
import type { Page } from '../../types';

interface MenuBuilderProps {
  domainId: number;
}

interface SortableItemProps {
  item: MenuItem;
  depth: number;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: number) => void;
  onAddChild: (parentId: number) => void;
  isExpanded: boolean;
  onToggleExpand: (id: number) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  item,
  depth,
  onEdit,
  onDelete,
  onAddChild,
  isExpanded,
  onToggleExpand,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg mb-2 ${
        isDragging ? 'shadow-lg' : 'shadow-sm'
      }`}
    >
      <div
        className="flex items-center p-3 gap-2"
        style={{ paddingLeft: `${depth * 2 + 0.75}rem` }}
      >
        <button
          className="cursor-grab hover:bg-gray-100 p-1 rounded"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </button>

        {item.children && item.children.length > 0 && (
          <button
            onClick={() => onToggleExpand(item.id)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        <div className="flex-1 flex items-center gap-2">
          <span className="font-medium">{item.label}</span>
          {item.page_id && (
            <span title="Linked to page">
              <FileText className="h-4 w-4 text-blue-500" />
            </span>
          )}
          {item.url && !item.page_id && (
            <span title="External link">
              <ExternalLink className="h-4 w-4 text-green-500" />
            </span>
          )}
          {!item.is_active && (
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
              Inactive
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {depth < 3 && (
            <button
              onClick={() => onAddChild(item.id)}
              className="p-1 hover:bg-gray-100 rounded text-gray-600"
              title="Add child item"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(item)}
            className="p-1 hover:bg-gray-100 rounded text-gray-600"
            title="Edit"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 hover:bg-red-100 rounded text-red-600"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface MenuItemFormProps {
  item?: MenuItem | null;
  parentId?: number | null;
  domainId: number;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const MenuItemForm: React.FC<MenuItemFormProps> = ({
  item,
  parentId,
  domainId,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    label: item?.label || '',
    url: item?.url || '',
    page_id: item?.page_id || null,
    is_active: item?.is_active ?? true,
  });

  const [linkType, setLinkType] = useState(
    item?.page_id ? 'page' : item?.url ? 'external' : 'none'
  );

  // Fetch pages for the dropdown
  const { data: pages = [] } = useQuery<Page[]>({
    queryKey: ['pages', domainId],
    queryFn: async () => {
      const response = await api.get('/pages');
      return (response.data?.data as Page[]) ?? [];
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      domain_id: domainId,
      parent_id: parentId || item?.parent_id || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-4">
        {item ? 'Edit Menu Item' : 'Add Menu Item'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Label
          </label>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
            required
            maxLength={255}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Link Type
          </label>
          <select
            value={linkType}
            onChange={(e) => {
              const type = e.target.value;
              setLinkType(type);
              if (type === 'none') {
                setFormData({ ...formData, url: '', page_id: null });
              } else if (type === 'external') {
                setFormData({ ...formData, page_id: null, url: '' });
              } else if (type === 'page') {
                setFormData({ ...formData, url: '', page_id: null });
              }
            }}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="none">No Link</option>
            <option value="page">Page</option>
            <option value="external">External URL</option>
          </select>
        </div>

        {linkType === 'page' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Page
            </label>
            <select
              value={formData.page_id || ''}
              onChange={(e) => setFormData({ ...formData, page_id: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 border rounded-md"
              required
            >
              <option value="">Select a page</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title} ({page.slug})
                </option>
              ))}
            </select>
          </div>
        )}

        {linkType === 'external' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              External URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="https://example.com"
            />
          </div>
        )}

        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_active"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="mr-2"
          />
          <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
            Active
          </label>
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="primary">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
};

const MenuBuilder: React.FC<MenuBuilderProps> = ({ domainId }) => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [addingItem, setAddingItem] = useState<{ parentId: number | null } | null>(null);

  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: menuData, isLoading } = useQuery({
    queryKey: ['menu', domainId],
    queryFn: () => menuService.getMenuByDomain(domainId)
  });

  // Update menu tree when data loads
  useEffect(() => {
    if (menuData) {
      const tree = menuService.buildMenuTree(menuData);
      setItems(tree);
      // Expand all items by default
      const allIds = new Set<number>();
      const collectIds = (items: MenuItem[]) => {
        items.forEach(item => {
          if (item.children && item.children.length > 0) {
            allIds.add(item.id);
            collectIds(item.children);
          }
        });
      };
      collectIds(tree);
      setExpandedItems(allIds);
    }
  }, [menuData]);

  const createMutation = useMutation({
    mutationFn: (data: any) => menuService.createMenuItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item created');
      setAddingItem(null);
    },
    onError: () => {
      toast.error('Failed to create menu item');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => menuService.updateMenuItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item updated');
      setEditingItem(null);
    },
    onError: () => {
      toast.error('Failed to update menu item');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => menuService.deleteMenuItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item deleted');
    },
    onError: () => {
      toast.error('Failed to delete menu item');
    }
  });

  const reorderMutation = useMutation({
    mutationFn: (data: any) => menuService.reorderMenuItems(domainId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu reordered');
    },
    onError: () => {
      toast.error('Failed to reorder menu');
    }
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      // Flatten the tree for reordering
      const flattenTree = (items: MenuItem[], parent: number | null = null): MenuItem[] => {
        const result: MenuItem[] = [];
        items.forEach((item, index) => {
          result.push({ ...item, parent_id: parent, position: index });
          if (item.children && expandedItems.has(item.id)) {
            result.push(...flattenTree(item.children, item.id));
          }
        });
        return result;
      };

      const flat = flattenTree(items);
      const oldIndex = flat.findIndex(item => item.id === active.id);
      const newIndex = flat.findIndex(item => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(flat, oldIndex, newIndex);

        // Rebuild tree and update positions
        const rebuildTree = (flatItems: MenuItem[]): MenuItem[] => {
          const itemMap = new Map<number, MenuItem>();
          const roots: MenuItem[] = [];

          flatItems.forEach((item, index) => {
            itemMap.set(item.id, { ...item, children: [], position: index });
          });

          flatItems.forEach(item => {
            const current = itemMap.get(item.id)!;
            if (item.parent_id === null) {
              roots.push(current);
            } else {
              const parent = itemMap.get(item.parent_id);
              if (parent) {
                parent.children = parent.children || [];
                parent.children.push(current);
              }
            }
          });

          return roots;
        };

        const newTree = rebuildTree(reordered);
        setItems(newTree);

        // Prepare reorder data
        const reorderData = {
          items: reordered.map((item, index) => ({
            id: item.id,
            position: index,
            parent_id: item.parent_id
          }))
        };

        reorderMutation.mutate(reorderData);
      }
    }
  };

  const handleToggleExpand = (id: number) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSaveItem = (data: any) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const renderItems = (items: MenuItem[], depth = 0): React.ReactNode => {
    // Flatten items for sortable context
    const getAllIds = (items: MenuItem[]): number[] => {
      const ids: number[] = [];
      items.forEach(item => {
        ids.push(item.id);
        if (item.children && expandedItems.has(item.id)) {
          ids.push(...getAllIds(item.children));
        }
      });
      return ids;
    };

    return (
      <SortableContext
        items={getAllIds(items)}
        strategy={verticalListSortingStrategy}
      >
        {items.map(item => (
          <div key={item.id}>
            <SortableItem
              item={item}
              depth={depth}
              onEdit={setEditingItem}
              onDelete={(id) => {
                if (confirm('Are you sure you want to delete this menu item and all its children?')) {
                  deleteMutation.mutate(id);
                }
              }}
              onAddChild={(parentId) => setAddingItem({ parentId })}
              isExpanded={expandedItems.has(item.id)}
              onToggleExpand={handleToggleExpand}
            />
            {item.children && item.children.length > 0 && expandedItems.has(item.id) && (
              <div className="ml-4">
                {renderItems(item.children, depth + 1)}
              </div>
            )}
          </div>
        ))}
      </SortableContext>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading menu...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Menu Structure</h2>
        <Button
          onClick={() => setAddingItem({ parentId: null })}
          variant="primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Menu Item
        </Button>
      </div>

      {(addingItem || editingItem) && (
        <MenuItemForm
          item={editingItem}
          parentId={addingItem?.parentId}
          domainId={domainId}
          onSave={handleSaveItem}
          onCancel={() => {
            setAddingItem(null);
            setEditingItem(null);
          }}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No menu items yet.</p>
              <p className="text-sm text-gray-400 mt-2">
                Click "Add Menu Item" to create your first menu item.
              </p>
            </div>
          ) : (
            renderItems(items)
          )}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="bg-white shadow-xl rounded-lg p-3 opacity-80">
              Dragging...
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default MenuBuilder;