import pg from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required for ride storage.');
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  // Do not log connection URLs, credentials, or query parameters.
  pool.on('error', () => console.error('Idle database connection failed.'));
  return pool;
}
