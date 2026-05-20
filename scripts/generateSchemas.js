/**
 * Script to generate JSON Schema from Zod schemas.
 * Run with: npm run generate:schema
 * 
 * This script converts the Zod schemas from dbSchemas.js to JSON Schema format
 * and writes them to modal_functions/db_schemas.json for use in the Modal function.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as zod from 'zod';

// Import schemas from dbSchemas.js
import {
  TABLES,
  sessionSchema,
  conversationSchema,
  messageSchema,
  messageRoleSchema,
  codeSchema,
  codeSnapshotSchema,
  consoleSchema,
  interactionSchema,
} from '../src/services/dbSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate JSON Schema for each table schema
const schemas = {
  tables: TABLES,
  schemas: {
    session: zod.toJSONSchema(sessionSchema, { target: 'openapi-3.0' }),
    conversation: zod.toJSONSchema(conversationSchema, { target: 'openapi-3.0' }),
    message: zod.toJSONSchema(messageSchema, { target: 'openapi-3.0' }),
    messageRole: zod.toJSONSchema(messageRoleSchema, { target: 'openapi-3.0' }),
    code: zod.toJSONSchema(codeSchema, { target: 'openapi-3.0' }),
    codeSnapshot: zod.toJSONSchema(codeSnapshotSchema, { target: 'openapi-3.0' }),
    console: zod.toJSONSchema(consoleSchema, { target: 'openapi-3.0' }),
    interaction: zod.toJSONSchema(interactionSchema, { target: 'openapi-3.0' }),
  }
};

// Write to modal_functions directory
const outputPath = join(__dirname, '..', 'modal_functions', 'db_schemas.json');
writeFileSync(outputPath, JSON.stringify(schemas, null, 2));

console.log(`✓ Generated JSON Schema at: ${outputPath}`);
console.log(`  - Tables: ${Object.keys(TABLES).length}`);
console.log(`  - Schemas: ${Object.keys(schemas.schemas).length}`);

