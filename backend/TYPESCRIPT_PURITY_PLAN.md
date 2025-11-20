# TypeScript Purity Recovery & Prevention Plan

## Current State Analysis

### ✅ Good News
- **Source Code**: 100% TypeScript (57 `.ts` files, 0 `.js` files in `src/`)
- **Configuration**: `tsconfig.json` properly configured
- **Build Output**: Only compiled `.js` files in `dist/` (expected)

### ⚠️ Potential Issues Identified
1. No explicit prevention of `.js` files in source directory
2. No linting rules to catch `.js` imports in TypeScript files
3. No pre-commit hooks to prevent accidental `.js` file commits
4. No CI/CD checks to enforce TypeScript-only source

## Recovery Plan

### Phase 1: Verification & Cleanup (Immediate)

#### Step 1.1: Verify Current State
```bash
# Check for any .js files in source (should return empty)
find backend/src -name "*.js" -type f -not -path "*/node_modules/*"

# Verify all imports use TypeScript files
grep -r "require.*\.js\|import.*\.js" backend/src --include="*.ts"
```

#### Step 1.2: Clean Up Dist Folder
```bash
# Ensure dist is gitignored (should be)
# Clean and rebuild to ensure consistency
cd backend
rm -rf dist
npm run build
```

#### Step 1.3: Update .gitignore
Ensure `dist/` and compiled files are properly ignored:
```
backend/dist/
backend/**/*.js
!backend/node_modules/**/*.js
backend/**/*.js.map
backend/**/*.d.ts
```

### Phase 2: Prevention Mechanisms (Short-term)

#### Step 2.1: Add ESLint Rule to Prevent .js Imports
Add to `backend/.eslintrc.js` or create one:

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // Prevent importing .js files in TypeScript
    '@typescript-eslint/no-require-imports': 'error',
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/*.js'],
            message: 'Do not import .js files. Use .ts files instead.',
          },
        ],
      },
    ],
  },
};
```

#### Step 2.2: Add TypeScript Compiler Option
Update `tsconfig.json` to be more strict:

```json
{
  "compilerOptions": {
    // ... existing options ...
    "allowJs": false,  // Explicitly disallow JavaScript files
    "checkJs": false   // Don't check JavaScript files
  },
  "include": ["src/**/*"],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.js"  // Explicitly exclude any .js files
  ]
}
```

#### Step 2.3: Add Pre-commit Hook
Create `backend/.husky/pre-commit` or use `lint-staged`:

```bash
#!/bin/sh
# Prevent .js files in src directory
if git diff --cached --name-only | grep -E '^backend/src/.*\.js$'; then
  echo "❌ ERROR: JavaScript files (.js) are not allowed in backend/src/"
  echo "Please convert to TypeScript (.ts) or remove the file."
  exit 1
fi

# Run TypeScript compiler check
cd backend
npm run lint
npx tsc --noEmit
```

### Phase 3: CI/CD Enforcement (Medium-term)

#### Step 3.1: Add GitHub Actions Check
Create `.github/workflows/typescript-purity.yml`:

```yaml
name: TypeScript Purity Check

on: [push, pull_request]

jobs:
  check-typescript-purity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd backend
          npm ci
      
      - name: Check for .js files in src
        run: |
          if find backend/src -name "*.js" -type f | grep -v node_modules; then
            echo "❌ ERROR: Found .js files in backend/src/"
            exit 1
          fi
          echo "✅ No .js files found in source directory"
      
      - name: TypeScript compilation check
        run: |
          cd backend
          npx tsc --noEmit
      
      - name: ESLint check
        run: |
          cd backend
          npm run lint
```

### Phase 4: Documentation & Best Practices (Ongoing)

#### Step 4.1: Add Developer Guidelines
Document in `backend/README.md` or `docs/DEVELOPMENT.md`:

```markdown
## TypeScript-Only Policy

**CRITICAL**: This backend is TypeScript-only. JavaScript files are NOT allowed.

### Rules:
1. ✅ All source code must be `.ts` files
2. ✅ All imports must reference `.ts` files (no `.js` extensions)
3. ❌ Never commit `.js` files to `src/` directory
4. ✅ Compiled `.js` files in `dist/` are generated automatically

### If You Need to Add JavaScript:
- Convert it to TypeScript instead
- Use type definitions (`@types/*`) for JavaScript libraries
- If absolutely necessary, create a `.d.ts` declaration file
```

## Implementation Checklist

- [ ] **Phase 1: Verification**
  - [ ] Run verification commands
  - [ ] Clean dist folder
  - [ ] Verify .gitignore
  
- [ ] **Phase 2: Prevention**
  - [ ] Add ESLint rules
  - [ ] Update tsconfig.json with `allowJs: false`
  - [ ] Add pre-commit hook
  
- [ ] **Phase 3: CI/CD**
  - [ ] Add GitHub Actions workflow
  - [ ] Test workflow on PR
  
- [ ] **Phase 4: Documentation**
  - [ ] Update README with TypeScript-only policy
  - [ ] Add to development guidelines
  - [ ] Document in architecture docs

## Quick Commands Reference

```bash
# Check for .js files in source
find backend/src -name "*.js" -type f

# Verify TypeScript compilation
cd backend && npx tsc --noEmit

# Run linting
cd backend && npm run lint

# Check for .js imports
grep -r "\.js['\"]" backend/src --include="*.ts"
```

## Emergency Recovery

If `.js` files are found in `src/`:

1. **Identify the files**: `find backend/src -name "*.js"`
2. **Convert to TypeScript**:
   - Rename `.js` → `.ts`
   - Add type annotations
   - Fix any type errors
3. **Update imports**: Remove `.js` extensions from imports
4. **Test**: `npm run build && npm test`
5. **Commit**: With message "refactor: convert .js files to TypeScript"
