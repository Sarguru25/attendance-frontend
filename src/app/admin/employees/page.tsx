import EmployeeClient from './EmployeeClient';
import { cookies, headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const cookieStore = await cookies();
  const reqHeaders = await headers();

  const cookieHeader = cookieStore.toString();
  const companyId = cookieStore.get('activeCompanyId')?.value || '';
  const token = cookieStore.get('token')?.value || '';

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
