/**
 * Gemini-powered Keyword Extraction for Academic Search
 *
 * Converts natural language research queries into precise
 * academic search keywords for Semantic Scholar
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';

/**
 * Result of keyword extraction
 */
export interface KeywordSuggestion {
  keywords: string; // Search query string (may include Boolean operators)
  reasoning: string; // Why these keywords were chosen
  relatedTerms: string[]; // Related terms for reference
}

/**
 * Extract academic search keywords from natural language query
 *
 * Uses Gemini to transform user's research interest description
 * into precise academic terminology suitable for Semantic Scholar search
 *
 * @param naturalLanguageQuery - User's description of research interest
 * @returns Keyword suggestion with reasoning
 */
export async function extractKeywords(
  naturalLanguageQuery: string
): Promise<KeywordSuggestion> {
  console.log('[KeywordExtraction] Starting keyword extraction');
  console.log(`[KeywordExtraction] Input: "${naturalLanguageQuery}"`);

  if (!naturalLanguageQuery || naturalLanguageQuery.trim().length === 0) {
    throw new Error('Natural language query cannot be empty');
  }

  if (naturalLanguageQuery.length > 1000) {
    throw new Error('Natural language query is too long (max 1000 characters)');
  }

  const geminiClient = getGeminiClient();
  const prompt = buildKeywordExtractionPrompt(naturalLanguageQuery);

  const result = await withGeminiErrorHandling(async () => {
    const response = await geminiClient.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: prompt }],
        },
      ],
    });
    const text =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No response generated';
    return text;
  });

  console.log('[KeywordExtraction] Gemini response received');

  // Parse JSON response
  let parsed: KeywordSuggestion;
  try {
    // Remove markdown code block if present
    const cleaned = result
      .trim()
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error(
      '[KeywordExtraction] Failed to parse Gemini response:',
      error
    );
    console.error('[KeywordExtraction] Raw response:', result);
    throw new Error('Failed to parse keyword suggestions from AI response');
  }

  // Validate response structure
  if (!parsed.keywords || typeof parsed.keywords !== 'string') {
    throw new Error('Invalid keyword suggestion format: missing keywords');
  }

  if (!parsed.reasoning || typeof parsed.reasoning !== 'string') {
    parsed.reasoning = 'Keywords extracted from your query';
  }

  if (!Array.isArray(parsed.relatedTerms)) {
    parsed.relatedTerms = [];
  }

  console.log('[KeywordExtraction] Keywords extracted successfully');
  console.log(`[KeywordExtraction] Output: "${parsed.keywords}"`);

  return parsed;
}

/**
 * Build prompt for keyword extraction
 */
function buildKeywordExtractionPrompt(query: string): string {
  return `You are a research assistant helping to extract academic search keywords for Semantic Scholar.

User's research interest:
"${query}"

Task: Generate a balanced search query that captures both core concepts AND the user's intent/context.

## Search Strategy
Your keywords will feed into an embedding-based similarity ranking, so:
- Include relevant synonyms to improve recall
- But keep it focused (max 10 synonyms per concept)
- Reflect the user's underlying intent (survey? application? comparison?)

## Analysis Steps
1. **Core Concepts**: Identify 1-3 main technical concepts
2. **Synonyms/Variants**: For each concept, list up to 10 most relevant alternatives (synonyms, acronyms, related terms)
3. **Query Context**: Detect the user's intent:
   - Paper type: survey/review, empirical study, theoretical, benchmark
   - Scope: overview, specific method, comparison, application
   - Recency: recent/latest, foundational/seminal
   - Domain: specific application area if mentioned
4. **Construct Query**: Combine concepts with context modifiers

## Semantic Scholar Query Syntax
- | for OR: (term1 | term2 | term3) — max 10 terms per group
- + for required: +transformer
- - for exclusion: -"unrelated topic"
- " " for exact phrases: "neural network"

## Output Format
{
  "keywords": "final search query string",
  "coreConcepts": [
    {
      "concept": "main concept name",
      "synonyms": ["syn1", "syn2", ...] // max 10
    }
  ],
  "queryContext": {
    "intent": "what the user wants (e.g., overview, deep dive, comparison)",
    "paperType": "survey | empirical | any",
    "scope": "broad | focused",
    "domain": "application domain if specified, else null"
  },
  "reasoning": "1-2 sentences on keyword selection"
}

## Examples

Input: "hardware neural network 전반에 대해 알고 싶어"
Output:
{
  "keywords": "(\"hardware neural network\" | \"neuromorphic computing\" | \"in-memory computing\" | \"neural network accelerator\" | NPU | \"compute-in-memory\" | \"analog neural network\") +(survey | review | overview)",
  "coreConcepts": [
    {
      "concept": "hardware neural network",
      "synonyms": ["neuromorphic computing", "in-memory computing", "neural network accelerator", "NPU", "compute-in-memory", "analog neural network", "AI accelerator"]
    }
  ],
  "queryContext": {
    "intent": "comprehensive understanding of the field",
    "paperType": "survey",
    "scope": "broad",
    "domain": null
  },
  "reasoning": "User wants '전반' (overall/comprehensive), indicating survey-type papers. Expanded hardware NN variants while requiring review-style content."
}

Input: "transformer를 medical imaging에 적용한 연구"
Output:
{
  "keywords": "(transformer | ViT | \"vision transformer\" | \"attention mechanism\") +(\"medical imaging\" | \"medical image\" | radiology | CT | MRI | \"clinical imaging\")",
  "coreConcepts": [
    {
      "concept": "transformer",
      "synonyms": ["ViT", "vision transformer", "attention mechanism", "self-attention"]
    },
    {
      "concept": "medical imaging",
      "synonyms": ["medical image analysis", "radiology", "CT", "MRI", "clinical imaging", "diagnostic imaging"]
    }
  ],
  "queryContext": {
    "intent": "application of method to domain",
    "paperType": "any",
    "scope": "focused",
    "domain": "medical imaging"
  },
  "reasoning": "Cross-domain query: method (transformer) applied to field (medical imaging). Required both concept groups to appear for relevance."
}

Input: "LLM code generation 최신 연구 동향"
Output:
{
  "keywords": "(LLM | \"large language model\" | GPT | CodeLLM | Codex) +(\"code generation\" | \"program synthesis\" | \"code completion\") +(survey | review | benchmark | \"state-of-the-art\")",
  "coreConcepts": [
    {
      "concept": "LLM",
      "synonyms": ["large language model", "GPT", "CodeLLM", "Codex", "foundation model"]
    },
    {
      "concept": "code generation",
      "synonyms": ["program synthesis", "code completion", "automated coding", "neural code generation"]
    }
  ],
  "queryContext": {
    "intent": "recent trends and advances",
    "paperType": "survey",
    "scope": "broad",
    "domain": "software engineering"
  },
  "reasoning": "User wants '최신 동향' (recent trends), so added survey/benchmark terms. Combined LLM variants with code generation terminology."
}

Input: "GAN vs Diffusion model 이미지 생성 비교"
Output:
{
  "keywords": "(GAN | \"generative adversarial\" | diffusion | DDPM | \"score-based\") +(\"image generation\" | \"image synthesis\") +(comparison | versus | benchmark)",
  "coreConcepts": [
    {
      "concept": "GAN",
      "synonyms": ["generative adversarial network", "StyleGAN", "BigGAN"]
    },
    {
      "concept": "diffusion model",
      "synonyms": ["DDPM", "score-based model", "denoising diffusion", "latent diffusion"]
    }
  ],
  "queryContext": {
    "intent": "comparative analysis",
    "paperType": "benchmark/comparison",
    "scope": "focused",
    "domain": "image generation"
  },
  "reasoning": "Comparison query between two generative approaches. Added comparison-related terms to find papers that evaluate both methods."
}

Now analyze the user's query and return ONLY the JSON object:`;
}

/**
 * Validate keyword suggestion quality
 * (Optional helper for additional validation)
 */
export function validateKeywordSuggestion(suggestion: KeywordSuggestion): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check if keywords are too short
  if (suggestion.keywords.trim().length < 3) {
    issues.push('Keywords are too short');
  }

  // Check if keywords are too long (likely not useful)
  if (suggestion.keywords.length > 200) {
    issues.push('Keywords are too long');
  }

  // Check for overly broad terms
  const broadTerms = [
    'research',
    'study',
    'analysis',
    'investigation',
    'paper',
  ];
  const keywordsLower = suggestion.keywords.toLowerCase();
  const foundBroadTerms = broadTerms.filter(term =>
    keywordsLower.includes(term)
  );

  if (foundBroadTerms.length > 0 && suggestion.keywords.split(' ').length < 4) {
    issues.push(
      `Keywords may be too broad (contains: ${foundBroadTerms.join(', ')})`
    );
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
