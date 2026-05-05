// @ts-nocheck
export const geminiCliModels = [
  {
    "id": "gemini-2.0-flash",
    "name": "Gemini 2.0 Flash (Cloud Code Assist)",
    "reasoning": false,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 8192
  },
  {
    "id": "gemini-2.5-flash",
    "name": "Gemini 2.5 Flash (Cloud Code Assist)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-2.5-pro",
    "name": "Gemini 2.5 Pro (Cloud Code Assist)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-3-flash-preview",
    "name": "Gemini 3 Flash Preview (Cloud Code Assist)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-3-pro-preview",
    "name": "Gemini 3 Pro Preview (Cloud Code Assist)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-3.1-flash-lite-preview",
    "name": "Gemini 3.1 Flash Lite Preview (Cloud Code Assist)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-3.1-pro-preview",
    "name": "Gemini 3.1 Pro Preview (Cloud Code Assist)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  }
];

export const antigravityModels = [
  {
    "id": "claude-opus-4-5-thinking",
    "name": "Claude Opus 4.5 Thinking (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 5, "output": 25, "cacheRead": 0.5, "cacheWrite": 6.25 },
    "contextWindow": 200000,
    "maxTokens": 64000
  },
  {
    "id": "claude-opus-4-6-thinking",
    "name": "Claude Opus 4.6 Thinking (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 5, "output": 25, "cacheRead": 0.5, "cacheWrite": 6.25 },
    "contextWindow": 200000,
    "maxTokens": 128000
  },
  {
    "id": "claude-sonnet-4-5",
    "name": "Claude Sonnet 4.5 (Antigravity)",
    "reasoning": false,
    "input": ["text", "image"],
    "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
    "contextWindow": 200000,
    "maxTokens": 64000
  },
  {
    "id": "claude-sonnet-4-5-thinking",
    "name": "Claude Sonnet 4.5 Thinking (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
    "contextWindow": 200000,
    "maxTokens": 64000
  },
  {
    "id": "claude-sonnet-4-6",
    "name": "Claude Sonnet 4.6 (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
    "contextWindow": 200000,
    "maxTokens": 64000
  },
  {
    "id": "gemini-3-flash",
    "name": "Gemini 3 Flash (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 0.5, "output": 3, "cacheRead": 0.5, "cacheWrite": 0 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-3.1-pro-high",
    "name": "Gemini 3.1 Pro High (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 2, "output": 12, "cacheRead": 0.2, "cacheWrite": 2.375 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gemini-3.1-pro-low",
    "name": "Gemini 3.1 Pro Low (Antigravity)",
    "reasoning": true,
    "input": ["text", "image"],
    "cost": { "input": 2, "output": 12, "cacheRead": 0.2, "cacheWrite": 2.375 },
    "contextWindow": 1048576,
    "maxTokens": 65535
  },
  {
    "id": "gpt-oss-120b-medium",
    "name": "GPT-OSS 120B Medium (Antigravity)",
    "reasoning": false,
    "input": ["text"],
    "cost": { "input": 0.09, "output": 0.36, "cacheRead": 0, "cacheWrite": 0 },
    "contextWindow": 131072,
    "maxTokens": 32768
  }
];
