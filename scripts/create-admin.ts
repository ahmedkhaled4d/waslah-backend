/**
 * Creates the first admin user so someone can log in and create the rest via the API.
 *   MONGODB_URI="mongodb+srv://..." ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' ADMIN_NAME="Your Name" npm run create-admin
 * Safe to rerun: exits without changes if the email already exists.
 */
import mongoose from 'mongoose';
import { usersService } from '../src/modules/users/users.service';

const uri = process.env.MONGODB_URI;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? 'Admin';
if (!uri || !email || !password) {
  throw new Error('Set MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD');
}
if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');

await mongoose.connect(uri);
try {
  const user = await usersService.create({ email, name, password, role: 'admin' });
  console.log(`Created admin ${user.email} (${user._id.toHexString()})`);
} catch (err) {
  if (err instanceof Error && 'code' in err && err.code === 'USER_EXISTS') {
    console.log(`Admin ${email} already exists, nothing to do`);
  } else {
    throw err;
  }
} finally {
  await mongoose.disconnect();
}
