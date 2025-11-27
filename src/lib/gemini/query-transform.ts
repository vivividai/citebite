/**
 * Query Transformation for RAG Chat
 *
 * Transforms user queries into optimized sub-queries for better retrieval.
 * Combines query rewriting and decomposition in a single LLM call.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { ConversationMessage } from './chat';

/**
 * Result of query transformation
 */
export interface QueryTransformResult {
  rewrittenQuery: string;
  subQueries: string[]; // exactly 5
  reasoning?: string;
}

/**
 * Prompt for query transformation and decomposition
 */
const QUERY_TRANSFORM_PROMPT = `You are an expert at reformulating questions for academic paper search.

Given a user's question and conversation context, create:
1. A rewritten query optimized for semantic search in academic papers
2. Five specific sub-queries that explore different aspects

## Sub-query Categories
Generate exactly 5 sub-queries covering:
1. **Definition/Background**: Core concepts and foundations
2. **Methodology**: Technical approaches, algorithms, methods
3. **Results/Findings**: Key discoveries, performance, outcomes
4. **Comparison**: Alternative approaches, trade-offs, limitations
5. **Applications**: Use cases, implementations, future directions

## Guidelines
- Make each sub-query self-contained (include context from conversation if needed)
- Use academic terminology appropriate for paper search
- Keep sub-queries specific but not too narrow
- If the question is simple, still generate 5 varied perspectives

## Output Format (JSON only)
{
  "rewrittenQuery": "semantically rich version of the question",
  "subQueries": [
    "Sub-query about definitions and background",
    "Sub-query about methodology and approaches",
    "Sub-query about results and findings",
    "Sub-query about comparisons and alternatives",
    "Sub-query about applications and implications"
  ],
  "reasoning": "Brief explanation of transformation"
}`;

/**
 * Build prompt with conversation context
 */
function buildTransformPrompt(
  userQuestion: string,
  conversationHistory: ConversationMessage[]
): string {
  // Include last 3 messages for context
  const recentHistory = conversationHistory.slice(-3);

  let contextSection = '';
  if (recentHistory.length > 0) {
    const historyText = recentHistory
      .map(
        msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      )
      .join('\n');
    contextSection = `\n## Conversation Context\n${historyText}\n`;
  }

  return `${QUERY_TRANSFORM_PROMPT}
${contextSection}
## Current User Question
"${userQuestion}"

Return ONLY the JSON object:`;
}

/**
 * Transform a user query into optimized sub-queries
 *
 * Uses Gemini to decompose the question into 5 targeted sub-queries
 * covering different aspects (definitions, methodology, results, comparisons, applications).
 *
 * @param userQuestion - The user's original question
 * @param conversationHistory - Previous messages for context
 * @returns Promise with rewritten query and 5 sub-queries
 */
export async function transformQuery(
  userQuestion: string,
  conversationHistory: ConversationMessage[] = []
): Promise<QueryTransformResult> {
  const startTime = Date.now();

  console.log('\n[QueryTransform] ──────────────────────────────────────────');
  console.log('[QueryTransform] Step 1: Query Decomposition');
  console.log('[QueryTransform] ──────────────────────────────────────────');
  console.log(`[QueryTransform] 📝 Original question: "${userQuestion}"`);
  console.log(
    `[QueryTransform] 📚 Conversation context: ${conversationHistory.length} messages`
  );
  console.log('[QueryTransform] 🔄 Calling Gemini to generate sub-queries...');

  const client = getGeminiClient();
  const prompt = buildTransformPrompt(userQuestion, conversationHistory);

  const result = await withGeminiErrorHandling(async () => {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: prompt }],
        },
      ],
      config: {
        temperature: 0.2, // Low temperature for consistent output
      },
    });

    const text =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No response generated';
    return text;
  });

  console.log('[QueryTransform] ✓ Gemini response received');

  // Parse JSON response
  let parsed: QueryTransformResult;
  try {
    // Remove markdown code block if present
    const cleaned = result
      .trim()
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('[QueryTransform] ✗ Failed to parse Gemini response:', error);
    console.error('[QueryTransform] Raw response:', result);
    console.log('[QueryTransform] ⚠️ Using fallback sub-queries');

    // Fallback: use original question for all sub-queries with different perspectives
    const fallback = createFallbackResult(userQuestion);
    const elapsed = Date.now() - startTime;
    console.log(
      `[QueryTransform] ⏱️ Step 1 completed in ${elapsed}ms (fallback)`
    );
    return fallback;
  }

  // Validate response structure
  if (!parsed.rewrittenQuery || typeof parsed.rewrittenQuery !== 'string') {
    parsed.rewrittenQuery = userQuestion;
  }

  if (!Array.isArray(parsed.subQueries) || parsed.subQueries.length !== 5) {
    console.warn(
      '[QueryTransform] ⚠️ Invalid subQueries count, using fallback'
    );
    const fallback = createFallbackResult(userQuestion);
    const elapsed = Date.now() - startTime;
    console.log(
      `[QueryTransform] ⏱️ Step 1 completed in ${elapsed}ms (fallback)`
    );
    return fallback;
  }

  // Ensure all sub-queries are strings
  parsed.subQueries = parsed.subQueries.map((q, i) =>
    typeof q === 'string' && q.trim().length > 0
      ? q
      : createDefaultSubQuery(userQuestion, i)
  );

  const elapsed = Date.now() - startTime;

  console.log('[QueryTransform] ✓ Transformation complete');
  console.log(
    `[QueryTransform] 📝 Rewritten query: "${parsed.rewrittenQuery}"`
  );
  console.log('[QueryTransform] 📋 Generated 5 sub-queries:');
  parsed.subQueries.forEach((q, i) => {
    const category = [
      'Definition',
      'Methodology',
      'Results',
      'Comparison',
      'Applications',
    ][i];
    console.log(
      `[QueryTransform]   [${i + 1}] ${category}: "${q.substring(0, 80)}${q.length > 80 ? '...' : ''}"`
    );
  });
  if (parsed.reasoning) {
    console.log(`[QueryTransform] 💡 Reasoning: ${parsed.reasoning}`);
  }
  console.log(`[QueryTransform] ⏱️ Step 1 completed in ${elapsed}ms`);

  return parsed;
}

/**
 * Create fallback result when transformation fails
 */
function createFallbackResult(userQuestion: string): QueryTransformResult {
  return {
    rewrittenQuery: userQuestion,
    subQueries: [
      createDefaultSubQuery(userQuestion, 0),
      createDefaultSubQuery(userQuestion, 1),
      createDefaultSubQuery(userQuestion, 2),
      createDefaultSubQuery(userQuestion, 3),
      createDefaultSubQuery(userQuestion, 4),
    ],
    reasoning: 'Fallback: transformation failed, using templated sub-queries',
  };
}

/**
 * Create a default sub-query based on category index
 */
function createDefaultSubQuery(
  userQuestion: string,
  categoryIndex: number
): string {
  const templates = [
    `What are the core concepts and background related to: ${userQuestion}`,
    `What methodologies and approaches are used for: ${userQuestion}`,
    `What are the key results and findings about: ${userQuestion}`,
    `What are alternative approaches and comparisons for: ${userQuestion}`,
    `What are the applications and future directions of: ${userQuestion}`,
  ];
  return templates[categoryIndex] || `${userQuestion}`;
}
