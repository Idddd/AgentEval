import { defineHandler } from 'nitro';
import { sharedDemoApi } from '../../shared-demo';
export default defineHandler(event => sharedDemoApi(event.req));
