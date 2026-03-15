import 'dotenv/config';

import { spawn } from 'node:child_process';

import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  throw new Error('Missing DISCORD_BOT_TOKEN');
}

const cliProvider = (process.env.AGENT_CLI_PROVIDER?.trim() || 'codex').toLowerCase();
const cliBin =
  process.env.AGENT_CLI_BIN?.trim() ||
  (cliProvider === 'claude' ? process.env.CLAUDE_BIN?.trim() : process.env.CODEX_BIN?.trim()) ||
  (cliProvider === 'claude' ? 'claude' : 'codex');
const cliModel =
  process.env.AGENT_CLI_MODEL?.trim() ||
  (cliProvider === 'claude' ? process.env.CLAUDE_MODEL?.trim() : process.env.CODEX_MODEL?.trim()) ||
  '';
const cliMode =
  process.env.AGENT_CLI_MODE?.trim() ||
  (cliProvider === 'claude' ? process.env.CLAUDE_MODE?.trim() : process.env.CODEX_MODE?.trim()) ||
  'yolo';
const cliWorkDir =
  process.env.AGENT_CLI_WORKDIR?.trim() || process.env.CODEX_WORKDIR?.trim() || '..';
const debounceMs = Number(
  process.env.AGENT_CLI_DEBOUNCE_MS || process.env.CODEX_DEBOUNCE_MS || 6000,
);
const respondToMentionsOnly = process.env.DISCORD_RESPOND_TO_MENTIONS_ONLY === 'true';
const allowedChannelIds = new Set(
  (process.env.DISCORD_ALLOWED_CHANNEL_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const state = {
  queue: [],
  timer: null,
  running: false,
};

function shouldHandle(message, botUserId) {
  if (message.author.bot) return false;
  if (allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channelId)) return false;
  if (message.channel.type === ChannelType.DM) return true;
  if (respondToMentionsOnly) return message.mentions.users.has(botUserId);
  return true;
}

function formatIncomingMessage(message, botUserId) {
  const authorName =
    message.member?.displayName || message.author.globalName || message.author.username;
  const content =
    message.content.replaceAll(`<@${botUserId}>`, '').replaceAll(`<@!${botUserId}>`, '').trim() ||
    '[no text content]';
  const attachments = Array.from(message.attachments.values())
    .map((attachment) => {
      const parts = [
        `name=${attachment.name || 'unknown'}`,
        `url=${attachment.url}`,
        `contentType=${attachment.contentType || 'unknown'}`,
        `size=${attachment.size}`,
      ];

      if (attachment.description) {
        parts.push(`description=${attachment.description}`);
      }

      return parts.join(' | ');
    })
    .join('\n');

  return [
    `author: ${authorName}`,
    `content: ${content}`,
    attachments ? `attachments:\n${attachments}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPrompt(batch) {
  return batch.map((entry, index) => `${index + 1}.\n${entry}`).join('\n\n');
}

function buildCodexArgs() {
  const args = ['exec', 'resume', 'main', '--json'];

  if (cliMode === 'dangerous' || cliMode === 'yolo') {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (cliMode === 'full-auto') {
    args.push('--full-auto');
  }

  if (cliModel) {
    args.push('-m', cliModel);
  }

  return args;
}

function buildClaudeArgs() {
  const args = [
    '--resume',
    '4d59c939-3b54-4d0f-9c73-997ca6c2edb1',
    '--print',
    '--output-format',
    'json',
  ];

  if (cliMode === 'dangerous' || cliMode === 'yolo') {
    args.push('--dangerously-skip-permissions');
  }

  if (cliModel) {
    args.push('--model', cliModel);
  }

  return args;
}

function buildCliArgs() {
  if (cliProvider === 'claude') {
    return buildClaudeArgs();
  }

  if (cliProvider === 'codex') {
    return buildCodexArgs();
  }

  throw new Error(`Unsupported AGENT_CLI_PROVIDER: ${cliProvider}`);
}

function extractCodexReply(stdout) {
  const lines = String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const messages = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    .map((event) => event.item.text)
    .filter(Boolean);

  return messages.at(-1)?.trim() ?? '';
}

function extractClaudeReply(stdout) {
  const text = String(stdout).trim();
  if (!text) {
    return '';
  }

  const result = JSON.parse(text);
  if (result.type !== 'result' || result.is_error) {
    throw new Error(result.result || 'Claude Code returned an error');
  }

  return String(result.result || '').trim();
}

function extractReply(stdout) {
  if (cliProvider === 'claude') {
    return extractClaudeReply(stdout);
  }

  return extractCodexReply(stdout);
}

async function runCli(workDir, prompt) {
  const args = buildCliArgs();

  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(cliBin, args, {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let output = '';

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(new Error(`${cliProvider} exited with code ${code}`));
    });
  });

  return extractReply(stdout);
}

async function sendReply(channel, content) {
  let remaining = content.trim();

  while (remaining.length > 0) {
    const chunk = remaining.slice(0, 2000);
    remaining = remaining.slice(2000);
    await channel.send(chunk);
  }
}

function startTyping(channel) {
  const tick = async () => {
    try {
      await channel.sendTyping();
    } catch {
      return;
    }
  };

  void tick();
  return setInterval(() => {
    void tick();
  }, 5000);
}

async function flushChannel(message) {
  if (state.running || state.queue.length === 0) {
    return;
  }

  state.running = true;
  const batch = state.queue.splice(0, state.queue.length);
  const prompt = buildPrompt(batch);
  const typingInterval = startTyping(message.channel);

  try {
    const reply = await runCli(cliWorkDir, prompt);
    if (reply) {
      await sendReply(message.channel, reply);
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    await sendReply(message.channel, `Erro ao executar ${cliProvider} bridge: ${text}`);
  } finally {
    clearInterval(typingInterval);
    state.running = false;
    if (state.queue.length > 0) {
      void flushChannel(message);
    }
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[agent_cli] ${cliProvider} bridge logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  const botUserId = client.user?.id;
  if (!botUserId) return;
  if (!shouldHandle(message, botUserId)) return;

  state.queue.push(formatIncomingMessage(message, botUserId));

  if (state.timer) {
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(() => {
    state.timer = null;
    void flushChannel(message);
  }, debounceMs);
});

await client.login(token);
