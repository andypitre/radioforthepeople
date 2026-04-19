import { createDb, withAppUser, type Database } from 'db'

let _db: Database | null = null

export function db(): Database {
  if (!_db) _db = createDb()
  return _db
}

export { withAppUser }
