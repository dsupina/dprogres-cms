const fs = require('fs');

// Fix files with remaining v5 migration issues
const fixes = [
  {
    file: './frontend/src/pages/admin/MenusPage.tsx',
    find: `  const { data: domains, isLoading: domainsLoading } = useQuery({ queryKey: ['domains'], queryFn: () => domainsService.getAll() },
    {
      onSuccess: (data) => {
        // Auto-select first domain if none selected
        if (!selectedDomainId && data.length > 0) {
          const defaultDomain = data.find(d => d.is_default) || data[0];
          setSelectedDomainId(defaultDomain.id);
        }
      }
    }
  );`,
    replace: `  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsService.getAll()
  });

  // Auto-select first domain when data loads
  useEffect(() => {
    if (!selectedDomainId && domains && domains.length > 0) {
      const defaultDomain = domains.find(d => d.is_default) || domains[0];
      setSelectedDomainId(defaultDomain.id);
    }
  }, [domains, selectedDomainId]);`
  },
  {
    file: './frontend/src/components/admin/DomainSelector.tsx',
    find: `  const { data: domains, isLoading } = useQuery({ queryKey: ['domains'], queryFn: () => domainsService.getAll( }),
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      cacheTime: 10 * 60 * 1000
    }
  );`,
    replace: `  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsService.getAll(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000
  });`
  },
  {
    file: './frontend/src/components/admin/MenuBuilder.tsx',
    find: `  const { isLoading } = useQuery({ queryKey: ['menu', domainId], queryFn: () => menuService.getMenuByDomain(domainId }),
    {
      onSuccess: (data) => {
        const tree = menuService.buildMenuTree(data);
        setItems(tree);
        // Expand all items by default
        const allIds = new Set<number>();
        const collectIds = (items: MenuItem[]) => {
          items.forEach(item => {
            if (item.id) {
              allIds.add(item.id);
            }
            if (item.children) {
              collectIds(item.children);
            }
          });
        };
        collectIds(tree);
        setExpandedItems(allIds);
      }
    }
  );`,
    replace: `  const { data: menuData, isLoading } = useQuery({
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
          if (item.id) {
            allIds.add(item.id);
          }
          if (item.children) {
            collectIds(item.children);
          }
        });
      };
      collectIds(tree);
      setExpandedItems(allIds);
    }
  }, [menuData]);`
  }
];

fixes.forEach(({ file, find, replace }) => {
  try {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(find)) {
      content = content.replace(find, replace);
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Fixed: ${file}`);
    } else {
      console.log(`Pattern not found in: ${file}`);
    }
  } catch (error) {
    console.error(`Error fixing ${file}:`, error.message);
  }
});

console.log('Done!');