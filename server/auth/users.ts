import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AppUser } from '../../shared/auth';
import type { bcIdentity } from './provider';
import { AuthFailure } from './provider';

export async function syncUser(pool: Pool, identity: ReturnType<typeof bcIdentity>): Promise<AppUser> {
  try {
    const result = await pool.query(`INSERT INTO users (id, auth_subject, full_name, bc_email, email_verified_at)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (auth_subject) DO UPDATE SET
      full_name=EXCLUDED.full_name, bc_email=EXCLUDED.bc_email, email_verified_at=EXCLUDED.email_verified_at
      RETURNING id, full_name, bc_email, created_at`, [randomUUID(), identity.subject, identity.fullName, identity.email, identity.verifiedAt]);
    const row = result.rows[0];
    return { id: row.id, fullName: row.full_name, bcEmail: row.bc_email, createdAt: row.created_at.toISOString() };
  } catch (error) {
    // Never auto-link an existing legacy row by email alone.
    if ((error as { code?: string }).code === '23505') throw new AuthFailure(409, 'This email is already linked to another application identity.');
    throw error;
  }
}
