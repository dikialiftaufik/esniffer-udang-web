/**
 * Membuat / mengaktifkan akun VIEWER langsung di database.
 * Dijalankan DI SERVER PRODUKSI (DATABASE_URL produksi harus sudah ter-set):
 *
 *   node --experimental-strip-types scripts/create-viewer.ts \
 *     --email=operator@contoh.com --password='Ganti-Dengan-Yang-Kuat-123'
 *
 * Aman diulang: memakai upsert berdasarkan email. Tidak pernah mencetak password.
 */
import { prisma, closeDb } from '../lib/db/client.ts';
import { hashPassword } from '../lib/auth/password.ts';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const email = (arg('email') ?? '').trim().toLowerCase();
const password = arg('password') ?? '';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Gagal: wajib --email yang valid, contoh --email=operator@contoh.com");
  process.exit(1);
}
if (password.length < 12) {
  console.error('Gagal: --password minimal 12 karakter.');
  process.exit(1);
}

const user = await prisma.user.upsert({
  where: { email },
  update: { role: 'VIEWER', isActive: true },
  create: { email, passwordHash: await hashPassword(password), role: 'VIEWER', isActive: true },
});

console.log(`OK: ${user.email} aktif sebagai ${user.role}`);
await closeDb();
