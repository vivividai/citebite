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
      model: 'gemini-2.5-flash', // Using flash model for speed
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
    const cleaned = result.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('[KeywordExtraction] Failed to parse Gemini response:', error);
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
  return `You are a research assistant helping to extract academic search keywords for Semantic Scholar, a large academic paper database.

User's research interest:
"${query}"

Task: Generate precise academic search keywords that will find relevant papers in Semantic Scholar.

Requirements:
1. Extract 3-7 key technical terms or concepts from the query
2. Use formal academic terminology (avoid casual language)
3. Focus on specific methods, concepts, or research areas
4. You may use Boolean operators if helpful: AND, OR, NOT (use sparingly)
5. Use phrases in quotes for exact matching if needed (e.g., "deep learning")
6. Prioritize specificity over generality

Guidelines:
- If the query mentions a specific method/technique, include it
- If the query mentions an application domain, include domain-specific terms
- If the query is vague, extract the most specific concepts you can identify
- Avoid overly broad terms like "research" or "study"

Return a JSON object with this exact structure:
{
  "keywords": "search query string for Semantic Scholar",
  "reasoning": "brief explanation (1-2 sentences) of why these keywords were chosen",
  "relatedTerms": ["term1", "term2", "term3"]
}

Example 1:
Input: "I want to research about how transformers are used in computer vision tasks"
Output:
{
  "keywords": "transformer AND computer vision",
  "reasoning": "Focused on the intersection of transformer architecture and vision tasks, which are the core technical concepts",
  "relatedTerms": ["vision transformer", "ViT", "attention mechanism", "image classification"]
}

Example 2:
Input: "papers about machine learning for drug discovery"
Output:
{
  "keywords": "machine learning AND drug discovery",
  "reasoning": "Combined the method (machine learning) with the application domain (drug discovery) for targeted results",
  "relatedTerms": ["molecular property prediction", "virtual screening", "QSAR", "deep learning"]
}

Example 3:
Input: "recent advances in natural language processing"
Output:
{
  "keywords": "natural language processing",
  "reasoning": "Used the core field name; 'recent advances' is handled by date filtering in the UI",
  "relatedTerms": ["NLP", "large language models", "transformers", "BERT", "GPT"]
}

Now extract keywords from the user's query and return ONLY the JSON object (no additional text):`;
}

/**
 * Validate keyword suggestion quality
 * (Optional helper for additional validation)
 */
export function validateKeywordSuggestion(
  suggestion: KeywordSuggestion
): { isValid: boolean; issues: string[] } {
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
  const broadTerms = ['research', 'study', 'analysis', 'investigation', 'paper'];
  const keywordsLower = suggestion.keywords.toLowerCase();
  const foundBroadTerms = broadTerms.filter(term => keywordsLower.includes(term));

  if (foundBroadTerms.length > 0 && suggestion.keywords.split(' ').length < 4) {
    issues.push(`Keywords may be too broad (contains: ${foundBroadTerms.join(', ')})`);
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
