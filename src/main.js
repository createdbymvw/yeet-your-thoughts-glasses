import { createApp } from './app.js';

/**
 * Entry point. Exposes nothing on window: there is no debug hook that could
 * read the current thought.
 */
const app = createApp(document);
app.start();
