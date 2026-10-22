import { redirect } from 'next/navigation';
import { isAdmin, isAdminConfigured } from '@/lib/admin/auth';
import { LoginForm } from './login-form';

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <LoginForm configured={isAdminConfigured()} />
    </main>
  );
}
