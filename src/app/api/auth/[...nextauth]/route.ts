import { handlers } from '@/auth';

export const GET = async (request: any, context: any) => {
  console.log('[Auth Route] GET request:', request.url);
  return handlers.GET(request, context);
};

export const POST = async (request: any, context: any) => {
  console.log('[Auth Route] POST request:', request.url);
  return handlers.POST(request, context);
};
