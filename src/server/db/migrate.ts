import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolveDatabaseUrl } from './index.js'

const sqlite = new Database(resolveDatabaseUrl())
const db = drizzle(sqlite)

migrate(db, { migrationsFolder: './drizzle' })
sqlite.close()

console.log('Migrations applied.')
