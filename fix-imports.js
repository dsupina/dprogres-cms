const fs = require('fs');
const path = require('path');

function updateImports(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.includes('node_modules')) {
      updateImports(filePath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;

      // Replace react-query imports
      content = content.replace(/from ['"]react-query['"]/g, "from '@tanstack/react-query'");
      content = content.replace(/from ['"]react-query\/devtools['"]/g, "from '@tanstack/react-query-devtools'");

      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
      }
    }
  });
}

console.log('Updating React Query imports...');
updateImports('./frontend/src');
console.log('Done!');