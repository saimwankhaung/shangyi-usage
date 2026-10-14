const fs = require('node:fs/promises');
const { normalizeClaude } = require('../model.cjs');

async function readClaude(file, { configured = false, source = 'terminal' } = {}) {
  try {
    const stats = await fs.stat(file);
    if (stats.size > 128 * 1024) throw new Error('Claude bridge snapshot is too large.');
    return normalizeClaude(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { ...normalizeClaude(null), status: configured ? 'waiting' : 'disconnected',
      source: source === 'vscode' ? 'Claude Code VS Code extension' : 'Claude Code status line',
      message: configured
        ? source === 'vscode' ? 'Connected. In Claude Code, open Account & usage or continue your work to update the limits.'
          : 'Terminal bridge is configured. Open the Claude Code terminal and use it normally. The graphical VS Code panel does not run a terminal status line.'
        : 'Connect your Claude source in Settings to receive usage.' };
    return { ...normalizeClaude(null), status: 'error', message: 'Claude bridge data could not be read. Reconnect the bridge in Settings.' };
  }
}
module.exports = { readClaude };
