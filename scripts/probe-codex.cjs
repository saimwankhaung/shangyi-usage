const { CodexClient } = require('../app/providers/codex.cjs');
const client = new CodexClient(process.argv[2] || 'codex');
client.on('connection-error', () => {});
(async () => {
  try {
    const usage = await client.readUsage();
    console.log(JSON.stringify({ status: usage.status, plan: usage.plan, windows: usage.windows }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { client.stop(); }
})();
