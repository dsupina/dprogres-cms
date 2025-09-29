const fs = require('fs');

const filePath = './frontend/src/components/admin/MenuBuilder.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix useQuery - remove onSuccess, use useEffect instead
content = content.replace(
  `  const { isLoading } = useQuery({ queryKey: ['menu', domainId], queryFn: () => menuService.getMenuByDomain(domainId }),
    {
      onSuccess: (data) => {
        const tree = menuService.buildMenuTree(data);
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
    }
  );`,
  `  const { data: menuData, isLoading } = useQuery({
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
  }, [menuData]);`
);

// Fix mutations - v5 syntax
content = content.replace(
  `  const createMutation = useMutation({ mutationFn: (data: any) => menuService.createMenuItem(data }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['menu', domainId]);
        toast.success('Menu item created');
        setAddingItem(null);
      },
      onError: () => {
        toast.error('Failed to create menu item');
      }
    }
  );`,
  `  const createMutation = useMutation({
    mutationFn: (data: any) => menuService.createMenuItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item created');
      setAddingItem(null);
    },
    onError: () => {
      toast.error('Failed to create menu item');
    }
  });`
);

content = content.replace(
  `  const updateMutation = useMutation(
    ({ id, ...data }: any) => menuService.updateMenuItem(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['menu', domainId]);
        toast.success('Menu item updated');
        setEditingItem(null);
      },
      onError: () => {
        toast.error('Failed to update menu item');
      }
    }
  );`,
  `  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => menuService.updateMenuItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item updated');
      setEditingItem(null);
    },
    onError: () => {
      toast.error('Failed to update menu item');
    }
  });`
);

content = content.replace(
  `  const deleteMutation = useMutation({ mutationFn: (id: number) => menuService.deleteMenuItem(id }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['menu', domainId]);
        toast.success('Menu item deleted');
      },
      onError: () => {
        toast.error('Failed to delete menu item');
      }
    }
  );`,
  `  const deleteMutation = useMutation({
    mutationFn: (id: number) => menuService.deleteMenuItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item deleted');
    },
    onError: () => {
      toast.error('Failed to delete menu item');
    }
  });`
);

// Add useEffect import if not present
if (!content.includes(', useEffect')) {
  content = content.replace('import { useState', 'import { useState, useEffect');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed MenuBuilder.tsx');