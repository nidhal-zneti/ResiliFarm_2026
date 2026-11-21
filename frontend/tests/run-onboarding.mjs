import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const tests = await server.ssrLoadModule("/tests/onboarding.tsx");
  await tests.run();
} finally {
  await server.close();
}
