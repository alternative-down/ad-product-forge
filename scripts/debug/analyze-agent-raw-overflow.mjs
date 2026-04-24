#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function readArg(name) {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function requireArg(name) {
  const value = readArg(name);

  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function getMessageText(message) {
  const parts = Array.isArray(message?.content?.parts) ? message.content.parts : [];

  return parts
    .filter((part) =>
      part
      && typeof part === 'object'
      && (part.type === 'text' || part.type === 'reasoning')
      && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function serializeBudgetValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function getToolInvocationBudgetTexts(message) {
  const partInvocations = (Array.isArray(message?.content?.parts) ? message.content.parts : [])
    .filter((part) => part?.type === 'tool-invocation' && part.toolInvocation?.state !== 'result')
    .map((part) => part.toolInvocation);
  const topLevelInvocations = Array.isArray(message?.content?.toolInvocations)
    ? message.content.toolInvocations
    : [];
  const metadataInvocations = Array.isArray(message?.metadata?.toolInvocations)
    ? message.metadata.toolInvocations
    : [];
  const toolInvocations = [
    ...partInvocations,
    ...topLevelInvocations,
    ...metadataInvocations,
  ];

  return toolInvocations.flatMap((toolInvocation) => {
    if (!toolInvocation || typeof toolInvocation !== 'object') {
      return [];
    }

    const toolName = typeof toolInvocation.toolName === 'string'
      ? toolInvocation.toolName
      : 'unknown';
    const args = serializeBudgetValue(toolInvocation.args);

    return [[
      `Tool call: ${toolName}`,
      args,
    ].filter(Boolean).join('\n')];
  });
}

function getToolResultBudgetTexts(message) {
  const partResults = (Array.isArray(message?.content?.parts) ? message.content.parts : [])
    .filter((part) => part?.type === 'tool-invocation' && part.toolInvocation?.state === 'result')
    .map((part) => part.toolInvocation);
  const metadataResults = Array.isArray(message?.metadata?.toolResults)
    ? message.metadata.toolResults
    : [];
  const toolResults = [
    ...partResults,
    ...metadataResults,
  ];

  return toolResults.flatMap((toolResult) => {
    if (!toolResult || typeof toolResult !== 'object') {
      return [];
    }

    const toolName = typeof toolResult.toolName === 'string'
      ? toolResult.toolName
      : 'unknown';
    const result = serializeBudgetValue(toolResult.result);

    return [[
      `Tool result: ${toolName}`,
      result,
    ].filter(Boolean).join('\n')];
  });
}

function getMessageBudgetText(message) {
  return [
    getMessageText(message),
    ...getToolInvocationBudgetTexts(message),
    ...getToolResultBudgetTexts(message),
  ]
    .filter(Boolean)
    .join('\n');
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function summarizeMessages(messages) {
  const rows = messages.map((message) => {
    const budgetText = getMessageBudgetText(message);

    return {
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
      chars: budgetText.length,
      tokens: estimateTokens(budgetText),
      preview: budgetText.replace(/\s+/gu, ' ').slice(0, 160),
    };
  });

  const totals = rows.reduce((accumulator, row) => ({
    chars: accumulator.chars + row.chars,
    tokens: accumulator.tokens + row.tokens,
  }), {
    chars: 0,
    tokens: 0,
  });
  const byRole = rows.reduce((accumulator, row) => {
    accumulator[row.role] ??= {
      count: 0,
      chars: 0,
      tokens: 0,
    };
    accumulator[row.role].count += 1;
    accumulator[row.role].chars += row.chars;
    accumulator[row.role].tokens += row.tokens;
    return accumulator;
  }, {});

  return {
    messageCount: rows.length,
    totals,
    byRole,
    largest: [...rows].sort((left, right) => right.tokens - left.tokens).slice(0, 20),
  };
}

async function fetchJson(baseUrl, apiKey, requestPath) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    headers: {
      'x-forge-admin-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${requestPath} -> ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllThreadMessages(baseUrl, apiKey, agentId) {
  const items = [];
  let page = 0;

  while (true) {
    const response = await fetchJson(
      baseUrl,
      apiKey,
      `/admin/agent/thread-messages?agentId=${agentId}&page=${page}&perPage=100`,
    );

    items.push(...response.items);

    if (!response.hasMore) {
      return items;
    }

    page += 1;
  }
}

async function main() {
  const baseUrl = requireArg('--base-url');
  const agentId = requireArg('--agent-id');
  const apiKey = requireArg('--api-key');
  const outputPath = readArg('--output') ?? path.resolve(
    process.cwd(),
    `tmp/agent-debug/${agentId}.json`,
  );

  const [agent, runtimeMemory, executionSteps, threadMessages] = await Promise.all([
    fetchJson(baseUrl, apiKey, `/admin/agent?agentId=${agentId}`),
    fetchJson(baseUrl, apiKey, `/admin/agent/runtime-memory?agentId=${agentId}`),
    fetchJson(baseUrl, apiKey, `/admin/agent/execution-steps?agentId=${agentId}&page=0&perPage=200`),
    fetchAllThreadMessages(baseUrl, apiKey, agentId),
  ]);

  const lastAgentStep = agent.recentExecutionSteps.find((step) => step.kind === 'agent-step') ?? null;
  const messagesAfterLastAgentStep = lastAgentStep
    ? threadMessages.filter((message) => message.createdAt > lastAgentStep.createdAt)
    : threadMessages;

  const snapshot = {
    downloadedAt: new Date().toISOString(),
    baseUrl,
    agentId,
    agent,
    runtimeMemory,
    executionSteps,
    threadMessages,
    analysis: {
      lastAgentStepCreatedAt: lastAgentStep?.createdAt ?? null,
      fullThread: summarizeMessages(threadMessages),
      afterLastAgentStep: summarizeMessages(messagesAfterLastAgentStep),
      runtimeMetrics: runtimeMemory.metrics ?? null,
    },
  };

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log(JSON.stringify({
    outputPath,
    analysis: snapshot.analysis,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
