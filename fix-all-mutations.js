const fs = require('fs');

// Fix all remaining mutation issues
const files = [
  {
    path: './frontend/src/components/admin/MenuBuilder.tsx',
    replacements: [
      {
        find: `  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: any }) => menuService.updateMenuItem(id, data),
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
        replace: `  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => menuService.updateMenuItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item updated');
      setEditingItem(null);
    },
    onError: () => {
      toast.error('Failed to update menu item');
    }
  });`
      },
      {
        find: `  const deleteMutation = useMutation({ mutationFn: (id: number) => menuService.deleteMenuItem(id }),
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
        replace: `  const deleteMutation = useMutation({
    mutationFn: (id: number) => menuService.deleteMenuItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu item deleted');
    },
    onError: () => {
      toast.error('Failed to delete menu item');
    }
  });`
      },
      {
        find: `  const reorderMutation = useMutation(
    (data: any) => menuService.reorderMenuItems(domainId, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['menu', domainId]);
        toast.success('Menu reordered');
      },
      onError: () => {
        toast.error('Failed to reorder menu');
      }
    }
  );`,
        replace: `  const reorderMutation = useMutation({
    mutationFn: (data: any) => menuService.reorderMenuItems(domainId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', domainId] });
      toast.success('Menu reordered');
    },
    onError: () => {
      toast.error('Failed to reorder menu');
    }
  });`
      }
    ]
  },
  {
    path: './frontend/src/pages/admin/DomainsPage.tsx',
    replacements: [
      {
        find: `  const createMutation = useMutation(domainsService.create, {`,
        replace: `  const createMutation = useMutation({
    mutationFn: domainsService.create,`
      },
      {
        find: `      queryClient.invalidateQueries('domains');`,
        replace: `      queryClient.invalidateQueries({ queryKey: ['domains'] });`
      }
    ]
  }
];

files.forEach(({ path, replacements }) => {
  try {
    let content = fs.readFileSync(path, 'utf8');
    let modified = false;

    replacements.forEach(({ find, replace }) => {
      if (content.includes(find)) {
        content = content.replace(find, replace);
        modified = true;
        console.log(`  Fixed: ${find.substring(0, 50)}...`);
      }
    });

    if (modified) {
      fs.writeFileSync(path, content, 'utf8');
      console.log(`Updated: ${path}`);
    }
  } catch (error) {
    console.error(`Error processing ${path}:`, error.message);
  }
});

console.log('Done!');