import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testGeminiConnection() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('❌ GEMINI_API_KEY is not set');
    return;
  }

  console.log('✅ GEMINI_API_KEY is configured');
  console.log('   Key prefix:', apiKey.substring(0, 10) + '...');

  try {
    const client = new GoogleGenAI({ apiKey });

    // Test with a simple prompt
    console.log('\n🔄 Testing API connection with gemini-2.0-flash...');
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: 'Say hello in one word.' }] }],
    });

    console.log('✅ API connection successful!');
    console.log('   Response:', response.text);

    // List some available models
    console.log('\n📋 Checking available models...');
    const models = await client.models.list();
    const modelNames: string[] = [];
    for await (const model of models) {
      if (model.name?.includes('gemini')) {
        modelNames.push(model.name);
      }
    }
    console.log('   Available Gemini models:');
    modelNames.slice(0, 8).forEach(name => console.log('   -', name));
  } catch (error: unknown) {
    console.log('❌ API connection failed');
    const err = error as Error & { status?: number };
    console.log('   Error:', err.message);
    if (err.status) console.log('   Status:', err.status);
  }
}

testGeminiConnection();
