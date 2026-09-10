import { createApp } from './app.js';

/**
 * Entry point for the Meta Ray-Ban Display "Web App" build (glasses.html).
 * Same modules as the browser prototype; only the platform flag differs.
 */
const app = createApp(document, { platform: 'meta-webapp' });
app.start();
