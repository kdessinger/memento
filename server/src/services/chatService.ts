import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chatSessions, chatMessages } from '../db/schema.js';
import * as dataService from './dataService.js';
import axios from 'axios';

const MAX_HISTORY_MESSAGES = 20;
const MAX_CONTEXT_LENGTH = 4000;

// Fallback replies when no LLM is configured
const FALLBACK_REPLIES = [
  "I'm Memento, your personal data assistant. I can see your insights, action items, and lifelogs but I don't have an LLM brain configured right now.",
  "I can browse your data, but deep reasoning requires an LLM API key. Ask your admin to set OPENROUTER_API_KEY.",
  "Your data is here: {stats} insights, {action_items} action items. I can reference them once an LLM is connected.",
];

function getFallbackReply(userId: number): Promise<string> {
  return dataService.getDashboardStats(userId).then(stats => {
    return `I'm Memento, your personal data assistant. I can see you have ${stats.total_insights} insights, ${stats.total_action_items} action items (${stats.completed_action_items} completed), ${stats.total_questions} questions, and ${stats.total_lifelogs} lifelogs. An LLM brain hasn't been configured yet — ask your admin to set OPENROUTER_API_KEY to enable deep reasoning.`;
  }).catch(() => FALLBACK_REPLIES[0]);
}

async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('No LLM API key configured');
  }

  // Prefer OpenRouter if key looks like sk-or-* or sk-o*, otherwise OpenAI
  const isOpenRouter = apiKey.startsWith('sk-or') || apiKey.startsWith('sk-o') || apiKey.length > 50;
  const baseUrl = isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
  const model = isOpenRouter ? 'anthropic/claude-sonnet-4' : 'gpt-4o-mini';

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: 'You are Memento, a helpful personal assistant embedded in a life-logging dashboard. Be concise, warm, and reference the user\'s data when relevant.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://10.20.30.113:3000',
        'X-Title': 'Memento Chat'
      },
      timeout: 30000
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || 'No response from LLM.';
}

export async function getOrCreateSession(userId: number, sessionId?: number) {
  if (sessionId) {
    const existing = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1);
    if (existing.length > 0) return existing[0];
  }

  const inserted = await db
    .insert(chatSessions)
    .values({ userId })
    .returning({ id: chatSessions.id });

  const newSession = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, inserted[0].id))
    .limit(1);

  return newSession[0];
}

export async function getSessionMessages(sessionId: number) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt);
}

export async function saveMessage(sessionId: number, role: string, content: string) {
  await db.insert(chatMessages).values({ sessionId, role, content });
}

export async function buildDataContext(userId: number): Promise<string> {
  const stats = await dataService.getDashboardStats(userId);
  const consolidated = await dataService.getConsolidatedData(userId);

  const recentActionItems = consolidated.action_items.slice(0, 5);
  const recentQuestions = consolidated.questions.filter(q => !q.resolved).slice(0, 3);
  const recentDecisions = consolidated.decisions.slice(0, 3);
  const recentIdeas = consolidated.ideas.slice(0, 3);

  let context = `You are Memento, Kenn's personal AI assistant embedded in his self-hosted life-logging dashboard. You have access to his Daily Insights, action items, decisions, ideas, questions, lifelogs, and more from his Limitless/Omi pendant data.

Here is a summary of Kenn's current data:

📊 Overview:
- ${stats.total_insights} daily insights
- ${stats.total_action_items} action items (${stats.completed_action_items} completed)
- ${stats.total_questions} questions (${stats.resolved_questions} resolved)
- ${stats.total_decisions} decisions
- ${stats.total_ideas} ideas
- ${stats.total_lifelogs} lifelogs

`;

  if (recentActionItems.length > 0) {
    context += `📋 Recent Action Items:\n`;
    for (const item of recentActionItems) {
      context += `- [${item.completed ? 'x' : ' '}] ${item.content.substring(0, 120)}${item.content.length > 120 ? '...' : ''}\n`;
    }
    context += '\n';
  }

  if (recentQuestions.length > 0) {
    context += `❓ Open Questions:\n`;
    for (const q of recentQuestions) {
      context += `- ${q.content.substring(0, 120)}${q.content.length > 120 ? '...' : ''}\n`;
    }
    context += '\n';
  }

  if (recentDecisions.length > 0) {
    context += `🎯 Recent Decisions:\n`;
    for (const d of recentDecisions) {
      context += `- ${d.content.substring(0, 120)}${d.content.length > 120 ? '...' : ''}\n`;
    }
    context += '\n';
  }

  if (recentIdeas.length > 0) {
    context += `💡 Recent Ideas:\n`;
    for (const i of recentIdeas) {
      context += `- ${i.content.substring(0, 120)}${i.content.length > 120 ? '...' : ''}\n`;
    }
    context += '\n';
  }

  context += `Answer Kenn's questions based on this data. Be concise, helpful, and reference specific items when relevant. If you don't have enough information, say so honestly.\n`;

  if (context.length > MAX_CONTEXT_LENGTH) {
    context = context.substring(0, MAX_CONTEXT_LENGTH) + '\n... [context truncated]';
  }

  return context;
}

export async function sendToHermes(
  userId: number,
  sessionId: number,
  userMessage: string,
  _hermesSessionId?: string | null
): Promise<{ reply: string; hermesSessionId: string | null }> {
  const dataContext = await buildDataContext(userId);
  const history = await getSessionMessages(sessionId);
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  let prompt = dataContext + '\n';
  if (recentHistory.length > 0) {
    prompt += `=== RECENT CONVERSATION ===\n`;
    for (const msg of recentHistory) {
      const label = msg.role === 'user' ? 'Kenn' : 'Memento';
      prompt += `${label}: ${msg.content}\n`;
    }
    prompt += '\n';
  }
  prompt += `Kenn: ${userMessage}\n\nMemento:`;

  try {
    const reply = await callLLM(prompt);
    return { reply, hermesSessionId: null };
  } catch (error: any) {
    console.error('LLM error:', error.message);
    const fallback = await getFallbackReply(userId);
    return { reply: fallback, hermesSessionId: null };
  }
}

export async function updateSessionTimestamp(sessionId: number) {
  await db
    .update(chatSessions)
    .set({ updatedAt: sql`datetime('now')` })
    .where(eq(chatSessions.id, sessionId));
}

export async function updateHermesSessionId(sessionId: number, hermesSessionId: string) {
  await db
    .update(chatSessions)
    .set({ hermesSessionId })
    .where(eq(chatSessions.id, sessionId));
}

export async function listUserSessions(userId: number) {
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt));
}
