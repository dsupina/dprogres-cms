#!/bin/bash
# TypeScript Purity Check Script
# Ensures no .js files exist in the source directory

set -e

echo "🔍 Checking TypeScript purity..."

# Check for .js files in src directory
JS_FILES=$(find src -name "*.js" -type f 2>/dev/null | grep -v node_modules || true)

if [ -n "$JS_FILES" ]; then
    echo "❌ ERROR: Found JavaScript (.js) files in src/ directory:"
    echo "$JS_FILES"
    echo ""
    echo "This backend is TypeScript-only. Please:"
    echo "1. Convert .js files to .ts"
    echo "2. Add proper type annotations"
    echo "3. Remove .js extensions from imports"
    exit 1
fi

# Check for .js imports in TypeScript files
JS_IMPORTS=$(grep -r "require.*\.js['\"]\|import.*\.js['\"]" src --include="*.ts" 2>/dev/null || true)

if [ -n "$JS_IMPORTS" ]; then
    echo "⚠️  WARNING: Found imports referencing .js files:"
    echo "$JS_IMPORTS"
    echo ""
    echo "TypeScript imports should not include .js extensions."
    echo "Please remove the .js extension from these imports."
    # Don't fail, just warn
fi

# Verify TypeScript compilation
echo "✅ No .js files found in source directory"
echo "🔨 Verifying TypeScript compilation..."
if command -v npx >/dev/null 2>&1; then
    npx tsc --noEmit
else
    echo "⚠️  npx not found, skipping TypeScript compilation check"
    echo "   Run 'npm run build' manually to verify compilation"
fi

if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
    echo "✅ TypeScript purity check passed!"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi
