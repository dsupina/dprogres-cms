/**
 * Jest setup file - runs before all tests
 * Loads environment variables from .env file
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
