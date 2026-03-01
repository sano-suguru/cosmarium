import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

type Bindings = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.get('/assets/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
});

app.get('/', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-cache');
});

app.all('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  // ASSETS.fetch() の Response は immutable headers を持つため、
  // secureHeaders が headers.set() できるよう mutable な Response にラップする
  return new Response(res.body, res);
});

export default app;
