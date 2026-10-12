import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { ConnectorBinding } from './lib/connector-contract.mts';
declare global { namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SKYLINE_PUBLIC_WRITE_OPEN?: string;
    SKYLINE_PUBLIC_PHOTOS_OPEN?: string;
    CITY_DISPLAY_NAME?: string;
    CONNECTORS?: ConnectorBinding;
  }
}
}
