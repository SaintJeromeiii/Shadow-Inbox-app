const { OpenAI } = require('openai');

const MODEL = process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';

let openaiClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

function parseClassificationJson(resultText) {
  const trimmed = String(resultText || '').trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(withoutFence);
}

/**
 * Analyzes an email payload using GPT to categorize, prioritize, and summarize.
 */
async function analyzeEmail(sender, subject, bodyText) {
  const openai = getOpenAIClient();

  if (!openai) {
    console.log('[AI Engine] Skipping classification: OPENAI_API_KEY is not defined.');
    return { summary: subject, category: 'General', priority: 'medium' };
  }

  try {
    const bodyPreview = String(bodyText || '').slice(0, 2000);
    const prompt = `
      You are an AI assistant processing incoming emails for an automated relay inbox.
      Analyze the following email details and output a clean JSON object containing classification metrics.
      
      EMAIL DETAILS:
      - From: ${sender}
      - Subject: ${subject}
      - Body Preview: ${bodyPreview}

      Your response MUST be raw JSON matching this structure exactly (do not include markdown block wrappers):
      {
        "summary": "A concise, max 2-sentence summary of the main actionable point or content.",
        "category": "Urgent Alert" | "Newsletter" | "Transaction" | "General",
        "priority": "high" | "medium" | "low"
      }

      Priority Guide:
      - "high": Immediate action required, security alerts, crucial personal business, or system failures.
      - "medium": Standard personal or professional correspondence.
      - "low": Automated newsletters, general marketing, or passive notifications.
    `;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const resultText = response.choices[0]?.message?.content?.trim();
    if (!resultText) {
      throw new Error('OpenAI returned an empty classification response.');
    }

    const classification = parseClassificationJson(resultText);

    console.log(
      `[AI Engine] Successfully processed email from ${sender}. Priority: ${String(classification.priority || 'medium').toUpperCase()}`,
    );

    return classification;
  } catch (error) {
    console.error('[AI Engine Error] Failed to classify email, falling back to defaults:', error);
    return {
      summary: `[Summary Fallback] ${subject}`,
      category: 'General',
      priority: 'medium',
      ai_error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = { analyzeEmail };
