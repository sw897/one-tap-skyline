import { env } from 'cloudflare:workers';
import { serverRuntime } from '../../src/server/runtime';
export const dynamic='force-dynamic';
export function GET() {return Response.json(serverRuntime(env),{headers:{'Cache-Control':'no-store'}});}
