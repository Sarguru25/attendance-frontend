import EmployeeClient from './EmployeeClient';
import { cookies, headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  let backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').trim().replace(/\/$/, '');
  if (!backendUrl.startsWith('http://localhost') && !backendUrl.startsWith('http://127.0.0.1') && backendUrl.startsWith('http://')) {
    backendUrl = backendUrl.replace('http://', 'https://');
  }
  const cookieStore = await cookies();
  const reqHeaders = await headers();

  const cookieHeader = cookieStore.toString();
  let companyId = cookieStore.get('activeCompanyId')?.value || '';
  let token = cookieStore.get('token')?.value || '';

  if (!token) {
    const { auth } = await import('@/auth');
    const session = await auth();
    token = (session as any)?.accessToken || (session?.user as any)?.accessToken || '';
    if (!companyId) {
      companyId = session?.user?.companyId || '';
    }
  }

  let employees: any[] = [];
  let shifts: any[] = [];

  try {
    const fetchHeaders: Record<string, string> = {
      cookie: cookieHeader,
    };

    if (companyId) {
      fetchHeaders['x-company-id'] = companyId;
    }

    if (token) {
      fetchHeaders['authorization'] = `Bearer ${token}`;
    } else if (reqHeaders.get('authorization')) {
      fetchHeaders['authorization'] = reqHeaders.get('authorization')!;
    }

    const res = await fetch(`${backendUrl}/api/admin/employees?detailed=true`, {
      headers: fetchHeaders,
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      employees = data.employees || [];
      shifts = data.shifts || [];
    } else {
      console.error(`[EmployeesPage] Failed to fetch employees: ${res.status} ${res.statusText}`);
    }
  } catch (error) {
    console.error('[EmployeesPage] Error connecting to backend API:', error);
  }

  return <EmployeeClient initialEmployees={employees} shifts={shifts} />;
}
