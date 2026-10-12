import { env } from 'cloudflare:workers';
import { parseRuntimeConfig } from '../../src/config';
export const dynamic='force-dynamic';
export function GET() {return Response.json(parseRuntimeConfig({cityDisplayName:env.CITY_DISPLAY_NAME}),{headers:{'Cache-Control':'no-store'}});}
