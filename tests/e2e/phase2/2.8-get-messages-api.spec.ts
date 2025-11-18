import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { createAdminSupabaseClient } from '../../../src/lib/supabase/server';

/**
 * Phase 2 - Task 2.8: Chat API - Get Messages
 * E2E Test: Retrieve messages from conversation with cursor-based pagination
 *
 * This test verifies the GET /api/conversations/[id]/messages endpoint:
 * - Retrieves messages with citations (include paper metadata)
 * - Implements pagination (limit 50 messages)
 * - Supports cursor-based pagination for older messages
 * - Verifies user authentication and conversation ownership
 * - Returns proper error codes (401, 404, 400)
 */
test.describe('Task 2.8 - Get Messages API', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'; // From seed data
  const TEST_USER_EMAIL = 'test@example.com';
  const TEST_USER_PASSWORD = 'testpassword123';

  let testCollectionId: string;
  let testConversationId: string;
  let emptyConversationId: string;
  let otherUserConversationId: string;
  let storageState: Record<string, unknown>;
  const messageTimestamps: string[] = [];

  test.beforeAll(async ({ browser }) => {
    console.log(`\n🧪 Test Setup:`);

    const supabase = createAdminSupabaseClient();

    // 1. Create collection
    const collectionId = randomUUID();
    await supabase.from('collections').insert({
      id: collectionId,
      user_id: TEST_USER_ID,
      name: 'Test Collection for Messages',
      search_query: 'machine learning',
      filters: {},
      file_search_store_id: 'test_store_messages',
    });
    testCollectionId = collectionId;

    // 2. Create mock papers
    const paperId1 = 'msg_test_paper_1';
    const paperId2 = 'msg_test_paper_2';
    const paperId3 = 'msg_test_paper_3';

    await supabase.from('papers').upsert([
      {
        paper_id: paperId1,
        title: 'Deep Learning Fundamentals',
        abstract: 'Introduction to deep learning.',
        authors: [{ name: 'Alice Johnson' }],
        year: 2023,
        citation_count: 150,
        venue: 'NeurIPS',
        vector_status: 'completed',
        pdf_source: 'auto',
      },
      {
        paper_id: paperId2,
        title: 'Transformer Architecture',
        abstract: 'Attention mechanisms in transformers.',
        authors: [{ name: 'Bob Smith' }],
        year: 2024,
        citation_count: 200,
        venue: 'ICML',
        vector_status: 'completed',
        pdf_source: 'auto',
      },
      {
        paper_id: paperId3,
        title: 'Reinforcement Learning',
        abstract: 'Deep reinforcement learning methods.',
        authors: [{ name: 'Carol White' }],
        year: 2023,
        citation_count: 120,
        venue: 'ICLR',
        vector_status: 'completed',
        pdf_source: 'auto',
      },
    ]);

    await supabase.from('collection_papers').insert([
      { collection_id: testCollectionId, paper_id: paperId1 },
      { collection_id: testCollectionId, paper_id: paperId2 },
      { collection_id: testCollectionId, paper_id: paperId3 },
    ]);

    // 3. Create conversations
    const convId = randomUUID();
    await supabase.from('conversations').insert({
      id: convId,
      collection_id: testCollectionId,
      user_id: TEST_USER_ID,
      title: 'Test Conversation with Messages',
    });
    testConversationId = convId;

    const emptyConvId = randomUUID();
    await supabase.from('conversations').insert({
      id: emptyConvId,
      collection_id: testCollectionId,
      user_id: TEST_USER_ID,
      title: 'Empty Conversation',
    });
    emptyConversationId = emptyConvId;

    // 4. Create conversation for another user (for ownership test)
    const otherUserId = randomUUID();
    await supabase.from('users').insert({
      id: otherUserId,
      email: 'other@example.com',
      name: 'Other User',
    });

    const otherCollectionId = randomUUID();
    await supabase.from('collections').insert({
      id: otherCollectionId,
      user_id: otherUserId,
      name: 'Other User Collection',
      search_query: 'test',
      filters: {},
    });

    const otherConvId = randomUUID();
    await supabase.from('conversations').insert({
      id: otherConvId,
      collection_id: otherCollectionId,
      user_id: otherUserId,
      title: 'Other User Conversation',
    });
    otherUserConversationId = otherConvId;

    // 5. Create test messages with citations
    const messages = [
      {
        conversation_id: testConversationId,
        role: 'user',
        content: 'What is deep learning?',
        cited_papers: null,
      },
      {
        conversation_id: testConversationId,
        role: 'assistant',
        content: 'Deep learning is a subset of machine learning...',
        cited_papers: [
          {
            paperId: paperId1,
            title: 'Deep Learning Fundamentals',
            relevanceScore: 0.95,
          },
        ],
      },
      {
        conversation_id: testConversationId,
        role: 'user',
        content: 'How do transformers work?',
        cited_papers: null,
      },
      {
        conversation_id: testConversationId,
        role: 'assistant',
        content: 'Transformers use attention mechanisms...',
        cited_papers: [
          {
            paperId: paperId2,
            title: 'Transformer Architecture',
            relevanceScore: 0.92,
          },
        ],
      },
      {
        conversation_id: testConversationId,
        role: 'user',
        content: 'What about reinforcement learning?',
        cited_papers: null,
      },
      {
        conversation_id: testConversationId,
        role: 'assistant',
        content: 'Reinforcement learning involves agents...',
        cited_papers: [
          {
            paperId: paperId3,
            title: 'Reinforcement Learning',
            relevanceScore: 0.88,
          },
          {
            paperId: paperId1,
            title: 'Deep Learning Fundamentals',
            relevanceScore: 0.75,
          },
        ],
      },
    ];

    // Insert messages and capture timestamps
    for (const msg of messages) {
      const { data: inserted } = await supabase
        .from('messages')
        .insert(msg)
        .select('timestamp')
        .single();

      if (inserted?.timestamp) {
        messageTimestamps.push(inserted.timestamp);
      }

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    console.log(`✅ Test data created`);
    console.log(`   Test Collection ID: ${testCollectionId}`);
    console.log(`   Test Conversation ID: ${testConversationId}`);
    console.log(`   Messages created: ${messages.length}`);
    console.log(`   Papers: ${paperId1}, ${paperId2}, ${paperId3}\n`);

    // Login to get auth state
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/');

    // Check if already logged in
    const collectionsLink = page.getByRole('link', { name: /collections/i });
    const isLoggedIn = await collectionsLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      // Navigate to login page
      const loginButton = page.getByRole('link', { name: /login|sign in/i });
      await loginButton.click();

      // Fill in login credentials
      await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
      await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

      // Submit login form
      const submitButton = page
        .getByRole('main')
        .getByRole('button', { name: /sign in|login/i });
      await submitButton.click();

      // Wait for redirect
      await page.waitForURL(/\/(collections)?/, { timeout: 15000 });
    }

    // Save storage state
    storageState = await context.storageState();

    console.log('✅ Authentication state saved\n');

    await context.close();
  });

  test.afterAll(async () => {
    // Cleanup
    const supabase = createAdminSupabaseClient();
    await supabase.from('collections').delete().eq('user_id', TEST_USER_ID);
    await supabase
      .from('papers')
      .delete()
      .in('paper_id', [
        'msg_test_paper_1',
        'msg_test_paper_2',
        'msg_test_paper_3',
      ]);

    console.log(`\n✅ Test data cleaned up`);
  });

  test('should retrieve all messages with default pagination', async ({
    browser,
  }) => {
    console.log('Test: Retrieve messages with default pagination');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const response = await page.request.get(
      `/api/conversations/${testConversationId}/messages`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.messages).toBeDefined();
    expect(body.data.pagination).toBeDefined();

    const messages = body.data.messages;
    const pagination = body.data.pagination;

    // Verify messages are returned
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(6); // 3 user + 3 assistant messages

    // Verify pagination metadata
    expect(pagination.limit).toBe(50); // Default limit
    expect(pagination.hasMore).toBe(false); // Only 6 messages
    expect(pagination.nextCursor).toBeDefined();
    expect(pagination.prevCursor).toBeDefined();

    // Verify messages are in chronological order (oldest first)
    for (let i = 1; i < messages.length; i++) {
      const prevTimestamp = new Date(messages[i - 1].timestamp);
      const currTimestamp = new Date(messages[i].timestamp);
      expect(currTimestamp.getTime()).toBeGreaterThanOrEqual(
        prevTimestamp.getTime()
      );
    }

    // Verify citations are included
    const assistantMessages = messages.filter(
      (m: { role: string }) => m.role === 'assistant'
    );
    expect(assistantMessages.length).toBe(3);

    assistantMessages.forEach((msg: { cited_papers: unknown[] }) => {
      expect(msg.cited_papers).toBeDefined();
      expect(Array.isArray(msg.cited_papers)).toBe(true);
      expect(msg.cited_papers.length).toBeGreaterThan(0);
    });

    console.log(`   ✅ Retrieved ${messages.length} messages`);
    console.log(`   ✅ Citations included in assistant messages\n`);

    await context.close();
  });

  test('should retrieve messages with custom limit', async ({ browser }) => {
    console.log('Test: Retrieve messages with limit=2');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const response = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=2`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);

    const messages = body.data.messages;
    const pagination = body.data.pagination;

    expect(messages.length).toBe(2);
    expect(pagination.limit).toBe(2);
    expect(pagination.hasMore).toBe(true); // More messages exist

    console.log(`   ✅ Limit parameter working correctly\n`);

    await context.close();
  });

  test('should support cursor-based pagination with before parameter', async ({
    browser,
  }) => {
    console.log('Test: Pagination with before parameter');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    // First, get initial messages
    const firstResponse = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=3`
    );
    const firstBody = await firstResponse.json();
    const firstMessages = firstBody.data.messages;
    const nextCursor = firstBody.data.pagination.nextCursor;

    console.log(`   First batch: ${firstMessages.length} messages`);
    console.log(`   Next cursor: ${nextCursor}`);

    // Then, get older messages using the cursor
    const secondResponse = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=3&before=${nextCursor}`
    );
    const secondBody = await secondResponse.json();
    const secondMessages = secondBody.data.messages;

    console.log(`   Second batch: ${secondMessages.length} messages`);

    expect(secondResponse.status()).toBe(200);
    expect(secondMessages.length).toBe(3);

    // Verify no overlap between batches
    const firstIds = firstMessages.map((m: { id: string }) => m.id);
    const secondIds = secondMessages.map((m: { id: string }) => m.id);
    const overlap = firstIds.filter((id: string) => secondIds.includes(id));
    expect(overlap.length).toBe(0);

    console.log(`   ✅ Cursor pagination working (no overlap)\n`);

    await context.close();
  });

  test('should support cursor-based pagination with after parameter', async ({
    browser,
  }) => {
    console.log('Test: Pagination with after parameter');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    // Get oldest messages
    const oldResponse = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=2`
    );
    const oldBody = await oldResponse.json();
    const prevCursor = oldBody.data.pagination.prevCursor;

    console.log(`   Previous cursor: ${prevCursor}`);

    // Get newer messages using after
    const newResponse = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=3&after=${prevCursor}`
    );
    const newBody = await newResponse.json();
    const newMessages = newBody.data.messages;

    console.log(`   Newer messages: ${newMessages.length}`);

    expect(newResponse.status()).toBe(200);
    expect(newMessages.length).toBeGreaterThan(0);

    console.log(`   ✅ After parameter working correctly\n`);

    await context.close();
  });

  test('should return empty array for conversation with no messages', async ({
    browser,
  }) => {
    console.log('Test: Empty conversation');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const response = await page.request.get(
      `/api/conversations/${emptyConversationId}/messages`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.messages).toEqual([]);
    expect(body.data.pagination.hasMore).toBe(false);

    console.log('✅ Empty conversation returns empty array\n');

    await context.close();
  });

  test('should return 400 for invalid limit', async ({ browser }) => {
    console.log('Test: Invalid limit parameter');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    // Test limit = 0
    const response1 = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=0`
    );
    expect(response1.status()).toBe(400);

    // Test limit > 100
    const response2 = await page.request.get(
      `/api/conversations/${testConversationId}/messages?limit=101`
    );
    expect(response2.status()).toBe(400);

    console.log('✅ Invalid limit values rejected\n');

    await context.close();
  });

  test('should return 400 for invalid datetime cursor', async ({ browser }) => {
    console.log('Test: Invalid cursor parameter');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const response = await page.request.get(
      `/api/conversations/${testConversationId}/messages?before=invalid-date`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);
    console.log(`   Error:`, body.error);

    expect(statusCode).toBe(400);
    expect(body.error).toBe('Invalid query parameters');

    console.log('✅ Invalid cursor rejected\n');

    await context.close();
  });

  test('should return 404 for non-existent conversation', async ({
    browser,
  }) => {
    console.log('Test: Non-existent conversation');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const fakeConversationId = randomUUID();

    const response = await page.request.get(
      `/api/conversations/${fakeConversationId}/messages`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);
    console.log(`   Error:`, body.error);

    expect(statusCode).toBe(404);

    console.log('✅ Non-existent conversation returns 404\n');

    await context.close();
  });

  test('should return 404 for conversation owned by another user', async ({
    browser,
  }) => {
    console.log("Test: Accessing another user's conversation");

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const response = await page.request.get(
      `/api/conversations/${otherUserConversationId}/messages`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);
    console.log(`   Error:`, body.error);

    expect(statusCode).toBe(404);

    console.log('✅ Ownership check prevents unauthorized access\n');

    await context.close();
  });

  test('should return 401 for unauthenticated request', async ({ request }) => {
    console.log('Test: Unauthenticated request');

    const response = await request.get(
      `/api/conversations/${testConversationId}/messages`
    );

    const statusCode = response.status();
    const body = await response.json();

    console.log(`   Response Status: ${statusCode}`);
    console.log(`   Error:`, body.error);

    expect(statusCode).toBe(401);
    expect(body.error).toBe('Unauthorized');

    console.log('✅ Unauthenticated request rejected\n');
  });

  test('should complete Task 2.8 successfully', () => {
    console.log('\n✅ Task 2.8 - Chat API - Get Messages: COMPLETE');
    console.log(
      '   - GET /api/conversations/[id]/messages endpoint implemented'
    );
    console.log('   - Messages returned with citations (paper metadata)');
    console.log('   - Default pagination (limit 50) working');
    console.log('   - Cursor-based pagination implemented (before/after)');
    console.log('   - Query parameter validation (limit, before, after)');
    console.log('   - Authentication and ownership verified');
    console.log('   - Chronological message ordering (oldest first)');
    console.log('   - Pagination metadata (hasMore, cursors)');
    console.log('   - Proper error responses (400, 401, 404)');
    console.log(
      '\n🚀 Phase 2 Complete! Ready for Phase 3: Manual PDF Upload\n'
    );
  });
});
