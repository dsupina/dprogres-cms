import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../utils/database';

dotenv.config();

async function runMigration() {
  const migrationPath = path.join(__dirname, '../migrations/005_add_content_hash.sql');

  try {
    console.log('Running migration: 005_add_content_hash.sql');

    // Read the migration file
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('Migration completed successfully');

    // Verify the migration
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'content_versions'
      AND column_name = 'content_hash'
    `);

    if (result.rows.length > 0) {
      console.log('✓ content_hash column added successfully');
      console.log('Column details:', result.rows[0]);
    }

    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'content_versions'
      AND (indexname LIKE '%autosave%' OR indexname LIKE '%hash%')
    `);

    console.log('✓ Indexes created:', indexResult.rows.map(r => r.indexname).join(', '));

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();