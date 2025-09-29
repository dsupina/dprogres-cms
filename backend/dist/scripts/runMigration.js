"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const database_1 = require("../utils/database");
dotenv.config();
async function runMigration() {
    const migrationPath = path.join(__dirname, '../migrations/005_add_content_hash.sql');
    try {
        console.log('Running migration: 005_add_content_hash.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
        await database_1.pool.query(migrationSQL);
        console.log('Migration completed successfully');
        const result = await database_1.pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'content_versions'
      AND column_name = 'content_hash'
    `);
        if (result.rows.length > 0) {
            console.log('✓ content_hash column added successfully');
            console.log('Column details:', result.rows[0]);
        }
        const indexResult = await database_1.pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'content_versions'
      AND (indexname LIKE '%autosave%' OR indexname LIKE '%hash%')
    `);
        console.log('✓ Indexes created:', indexResult.rows.map(r => r.indexname).join(', '));
    }
    catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
    finally {
        await database_1.pool.end();
    }
}
runMigration();
//# sourceMappingURL=runMigration.js.map