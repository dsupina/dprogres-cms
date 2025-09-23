import { api } from '../lib/api';

export interface MenuItem {
  id: number;
  domain_id: number;
  parent_id: number | null;
  label: string;
  url: string | null;
  page_id: number | null;
  position: number;
  is_active: boolean;
  depth: number;
  path: string;
  created_at: string;
  updated_at: string;
  children?: MenuItem[];
}

export interface CreateMenuItemDto {
  domain_id: number;
  parent_id?: number | null;
  label: string;
  url?: string | null;
  page_id?: number | null;
  position?: number;
  is_active?: boolean;
}

export interface UpdateMenuItemDto {
  label?: string;
  url?: string | null;
  page_id?: number | null;
  position?: number;
  is_active?: boolean;
  parent_id?: number | null;
}

export interface ReorderMenuItemsDto {
  items: Array<{
    id: number;
    position: number;
    parent_id: number | null;
  }>;
}

class MenuService {
  async getMenuByDomain(domainId: number): Promise<MenuItem[]> {
    const response = await api.get(`/menus/domain/${domainId}`);
    return response.data;
  }

  async getMenuTree(domainId: number): Promise<MenuItem[]> {
    const response = await api.get(`/menus/domain/${domainId}/tree`);
    return response.data;
  }

  async getMenuItem(id: number): Promise<MenuItem> {
    const response = await api.get(`/menus/${id}`);
    return response.data;
  }

  async createMenuItem(data: CreateMenuItemDto): Promise<MenuItem> {
    const response = await api.post('/menus', data);
    return response.data;
  }

  async updateMenuItem(id: number, data: UpdateMenuItemDto): Promise<MenuItem> {
    const response = await api.put(`/menus/${id}`, data);
    return response.data;
  }

  async deleteMenuItem(id: number): Promise<void> {
    await api.delete(`/menus/${id}`);
  }

  async reorderMenuItems(domainId: number, data: ReorderMenuItemsDto): Promise<void> {
    await api.put(`/menus/domain/${domainId}/reorder`, data);
  }

  async duplicateMenu(fromDomainId: number, toDomainId: number): Promise<void> {
    await api.post(`/menus/domain/${fromDomainId}/duplicate`, { toDomainId });
  }

  // Helper function to build tree structure from flat array
  buildMenuTree(items: MenuItem[]): MenuItem[] {
    const itemMap = new Map<number, MenuItem>();
    const rootItems: MenuItem[] = [];

    // First pass: create map of all items
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build tree structure
    items.forEach(item => {
      const currentItem = itemMap.get(item.id)!;
      if (item.parent_id === null) {
        rootItems.push(currentItem);
      } else {
        const parent = itemMap.get(item.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(currentItem);
        }
      }
    });

    // Sort by position at each level
    const sortByPosition = (items: MenuItem[]): MenuItem[] => {
      return items.sort((a, b) => a.position - b.position).map(item => ({
        ...item,
        children: item.children ? sortByPosition(item.children) : []
      }));
    };

    return sortByPosition(rootItems);
  }
}

export const menuService = new MenuService();