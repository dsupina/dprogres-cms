#!/bin/bash

# Update all React Query imports to @tanstack/react-query
find frontend/src -name "*.tsx" -o -name "*.ts" | while read file; do
  sed -i "s/from 'react-query'/from '@tanstack\/react-query'/g" "$file"
  sed -i "s/from \"react-query\"/from \"@tanstack\/react-query\"/g" "$file"
done

echo "Updated all React Query imports to @tanstack/react-query"