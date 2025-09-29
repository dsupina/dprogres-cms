const fs = require('fs');
const path = require('path');

function migrateToV5(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.includes('node_modules')) {
      migrateToV5(filePath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;

      // Pattern 1: useQuery with 2 args - key and fn
      // useQuery('key', () => fn()) => useQuery({ queryKey: ['key'], queryFn: () => fn() })
      content = content.replace(
        /useQuery\(\s*['"`]([^'"`]+)['"`],\s*(\([^)]*\)\s*=>\s*[^,\n]+|\w+)\s*\)/g,
        "useQuery({ queryKey: ['$1'], queryFn: $2 })"
      );

      // Pattern 2: useQuery with 3 args - key, fn, options
      // useQuery('key', () => fn(), { enabled: true }) => useQuery({ queryKey: ['key'], queryFn: () => fn(), enabled: true })
      content = content.replace(
        /useQuery\(\s*['"`]([^'"`]+)['"`],\s*(\([^)]*\)\s*=>\s*[^,]+|\w+),\s*(\{[^}]+\})\s*\)/g,
        (match, key, fn, options) => {
          // Remove the outer braces from options and merge
          const optionsContent = options.slice(1, -1).trim();
          return `useQuery({ queryKey: ['${key}'], queryFn: ${fn}, ${optionsContent} })`;
        }
      );

      // Pattern 3: useQuery with array key
      // useQuery(['key', id], () => fn()) => useQuery({ queryKey: ['key', id], queryFn: () => fn() })
      content = content.replace(
        /useQuery\(\s*\[([^\]]+)\],\s*(\([^)]*\)\s*=>\s*[^,\n]+|\w+)\s*\)/g,
        "useQuery({ queryKey: [$1], queryFn: $2 })"
      );

      // Pattern 4: useQuery with array key and options
      content = content.replace(
        /useQuery\(\s*\[([^\]]+)\],\s*(\([^)]*\)\s*=>\s*[^,]+|\w+),\s*(\{[^}]+\})\s*\)/g,
        (match, key, fn, options) => {
          const optionsContent = options.slice(1, -1).trim();
          return `useQuery({ queryKey: [${key}], queryFn: ${fn}, ${optionsContent} })`;
        }
      );

      // Pattern 5: useMutation - simpler pattern
      // useMutation(fn) => useMutation({ mutationFn: fn })
      content = content.replace(
        /useMutation\(\s*(\([^)]*\)\s*=>\s*[^,\n]+|\w+)\s*\)/g,
        "useMutation({ mutationFn: $1 })"
      );

      // Pattern 6: useMutation with options
      content = content.replace(
        /useMutation\(\s*(\([^)]*\)\s*=>\s*[^,]+|\w+),\s*(\{[^}]+\})\s*\)/g,
        (match, fn, options) => {
          const optionsContent = options.slice(1, -1).trim();
          return `useMutation({ mutationFn: ${fn}, ${optionsContent} })`;
        }
      );

      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Migrated: ${filePath}`);
      }
    }
  });
}

console.log('Migrating to React Query v5 syntax...');
migrateToV5('./frontend/src');
console.log('Migration complete!');