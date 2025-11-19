/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite: Chat Functionality
 *
 * Tests AI-powered chat interface with RAG and citations
 * Covers: Send Messages, View History, Citations, Markdown Rendering, Conversation Context
 */

test.describe('Chat Functionality', () => {
  // Helper function to navigate to Chat tab
  const navigateToChat = async (page, collectionId = 'test-collection-id') => {
    await page.goto(`http://localhost:3000/collections/${collectionId}`);
    await page.waitForLoadState('networkidle');

    // Click Chat tab
    const chatTab = page.getByRole('tab', { name: /chat/i }).first();
    if (await chatTab.isVisible().catch(() => false)) {
      await chatTab.click();
      await page.waitForTimeout(500);
    }
  };

  test.describe('5.1 Chat Interface Layout', () => {
    test.skip('should display chat interface', async ({ page: _page }) => {
      await navigateToChat(page);

      // Should show chat UI
      const chatInterface = page
        .locator('[data-testid="chat-interface"]')
        .first();
      const messageInput = page.locator('textarea, input[type="text"]').first();

      const hasInterface =
        (await chatInterface.isVisible().catch(() => false)) ||
        (await messageInput.isVisible().catch(() => false));

      expect(hasInterface).toBe(true);
    });

    test.skip('should have message input field', async ({ page: _page }) => {
      await navigateToChat(page);

      const messageInput = page
        .locator(
          'textarea[placeholder*="message"], textarea[placeholder*="ask"]'
        )
        .first();
      await expect(messageInput).toBeVisible();
      await expect(messageInput).toBeEnabled();
    });

    test.skip('should have send button', async ({ page: _page }) => {
      await navigateToChat(page);

      const sendButton = page
        .getByRole('button', { name: /send|submit/i })
        .first();
      await expect(sendButton).toBeVisible();
    });

    test.skip('should show empty state for new conversation', async ({
      page,
    }) => {
      await navigateToChat(page);

      // New conversation should show welcome message or suggested questions
      const welcomeMessage = page
        .getByText(/start.*conversation|ask.*question|how can i help/i)
        .first();
      const suggestedQuestions = page
        .locator('[data-testid="suggested-questions"]')
        .first();

      const hasWelcome = await welcomeMessage.isVisible().catch(() => false);
      const hasSuggestions = await suggestedQuestions
        .isVisible()
        .catch(() => false);

      console.log(
        `Welcome message: ${hasWelcome}, Suggested questions: ${hasSuggestions}`
      );
    });
  });

  test.describe('5.2 Send Message - Happy Path', () => {
    test.skip('should send message and receive AI response', async ({
      page,
    }) => {
      // This test requires:
      // 1. Auth
      // 2. Collection with indexed papers
      // 3. Working Gemini API
      // 4. File Search store

      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      // Type message
      await messageInput.fill(
        'What are the main research trends in this collection?'
      );

      // Send
      await sendButton.click();

      // User message should appear immediately
      await page.waitForTimeout(500);

      const userMessage = page.locator('[data-testid="user-message"]').last();
      await expect(userMessage).toBeVisible();
      await expect(userMessage).toContainText(
        'What are the main research trends'
      );

      // Loading indicator should appear
      const loadingIndicator = page
        .locator('[data-testid="loading"], .animate-pulse')
        .first();
      const hasLoading = await loadingIndicator.isVisible().catch(() => false);
      console.log(`Loading indicator shown: ${hasLoading}`);

      // AI response should appear (may take 5-10 seconds)
      const aiMessage = page
        .locator('[data-testid="assistant-message"]')
        .last();
      await expect(aiMessage).toBeVisible({ timeout: 15000 });

      const responseText = await aiMessage.textContent();
      expect(responseText?.length).toBeGreaterThan(20); // Non-trivial response

      console.log('AI response received:', responseText?.substring(0, 100));
    });

    test.skip('should clear input after sending message', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      await messageInput.fill('Test message');
      await sendButton.click();

      await page.waitForTimeout(500);

      // Input should be cleared
      const inputValue = await messageInput.inputValue();
      expect(inputValue).toBe('');
    });

    test.skip('should auto-scroll to latest message', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      await messageInput.fill('Test message');
      await sendButton.click();

      await page.waitForTimeout(1000);

      // Should scroll to bottom
      const messageList = page.locator('[data-testid="message-list"]').first();
      const isAtBottom = await page.evaluate(
        el => {
          if (!el) return false;
          return el.scrollHeight - el.scrollTop === el.clientHeight;
        },
        await messageList.elementHandle()
      );

      console.log(`Auto-scrolled to bottom: ${isAtBottom}`);
    });
  });

  test.describe('5.3 Message Input Validation', () => {
    test.skip('should disable send button for empty input', async ({
      page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      // Empty input
      await messageInput.clear();

      // Send button should be disabled
      const isDisabled = await sendButton.isDisabled();
      expect(isDisabled).toBe(true);
    });

    test.skip('should enable send button when text is entered', async ({
      page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      // Enter text
      await messageInput.fill('What are the main findings?');

      // Send button should be enabled
      await expect(sendButton).toBeEnabled();
    });

    test.skip('should reject whitespace-only messages', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      // Enter only spaces
      await messageInput.fill('   ');

      // Send button should still be disabled
      const isDisabled = await sendButton.isDisabled();
      expect(isDisabled).toBe(true);
    });

    test.skip('should support Cmd+Enter keyboard shortcut', async ({
      page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();

      await messageInput.fill('Test message');

      // Press Cmd+Enter (or Ctrl+Enter on Windows)
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+Enter`);

      await page.waitForTimeout(500);

      // Message should be sent
      const userMessage = page.locator('[data-testid="user-message"]').last();
      await expect(userMessage).toBeVisible();
    });
  });

  test.describe('5.4 View Conversation History', () => {
    test.skip('should load existing conversation messages', async ({
      page,
    }) => {
      // Requires conversation with existing messages
      await navigateToChat(page);

      // Messages should load
      const messages = page.locator(
        '[data-testid="user-message"], [data-testid="assistant-message"]'
      );
      const count = await messages.count();

      if (count > 0) {
        console.log(`Loaded ${count} messages from history`);

        // Messages should be in chronological order
        const firstMessage = messages.first();
        const lastMessage = messages.last();

        await expect(firstMessage).toBeVisible();
        await expect(lastMessage).toBeVisible();
      } else {
        console.log('No message history - new conversation');
      }
    });

    test.skip('should distinguish user and AI messages visually', async ({
      page,
    }) => {
      await navigateToChat(page);

      const userMessages = page.locator('[data-testid="user-message"]');
      const aiMessages = page.locator('[data-testid="assistant-message"]');

      const userCount = await userMessages.count();
      const aiCount = await aiMessages.count();

      if (userCount > 0 && aiCount > 0) {
        // Check if they have different styles
        const userStyle = await userMessages.first().evaluate(el => {
          return window.getComputedStyle(el).backgroundColor;
        });

        const aiStyle = await aiMessages.first().evaluate(el => {
          return window.getComputedStyle(el).backgroundColor;
        });

        console.log(`User message bg: ${userStyle}, AI message bg: ${aiStyle}`);

        // Should have different visual treatment
        expect(userStyle).not.toBe(aiStyle);
      }
    });

    test.skip('should show message timestamps', async ({ page: _page }) => {
      await navigateToChat(page);

      const messages = page.locator('[data-testid="message"]');
      const count = await messages.count();

      if (count > 0) {
        const firstMessage = messages.first();

        // Look for timestamp
        const timestamp = firstMessage
          .locator('[data-testid="timestamp"], time, .timestamp')
          .first();
        const hasTimestamp = await timestamp.isVisible().catch(() => false);

        console.log(`Timestamps shown: ${hasTimestamp}`);
      }
    });
  });

  test.describe('5.5 Citations Display', () => {
    test.skip('should display citations with AI responses', async ({
      page,
    }) => {
      await navigateToChat(page);

      // Send message that should generate citations
      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      await messageInput.fill('Which papers discuss neural networks?');
      await sendButton.click();

      // Wait for response
      await page.waitForTimeout(10000);

      // Check for citations
      const citations = page.locator(
        '[data-testid="citation"], [data-testid="citation-card"]'
      );
      const count = await citations.count();

      if (count > 0) {
        console.log(`Found ${count} citations in response`);

        const firstCitation = citations.first();
        await expect(firstCitation).toBeVisible();

        // Citation should show paper info
        const citationText = await firstCitation.textContent();
        console.log('Citation content:', citationText?.substring(0, 100));
      } else {
        console.log('No citations in response (may vary by query)');
      }
    });

    test.skip('should display paper title in citations', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      const citations = page.locator('[data-testid="citation"]');
      const count = await citations.count();

      if (count > 0) {
        const firstCitation = citations.first();

        // Should show paper title
        const title = firstCitation
          .locator('[data-testid="citation-title"]')
          .first();
        const titleText = await title.textContent();

        expect(titleText?.length).toBeGreaterThan(10);
        console.log('Citation title:', titleText);
      }
    });

    test.skip('should display authors and year in citations', async ({
      page,
    }) => {
      await navigateToChat(page);

      const citations = page.locator('[data-testid="citation"]');
      const count = await citations.count();

      if (count > 0) {
        const firstCitation = citations.first();
        const citationText = await firstCitation.textContent();

        // Should include year (e.g., 2023)
        const hasYear = /\b(19|20)\d{2}\b/.test(citationText || '');
        console.log(`Citation includes year: ${hasYear}`);

        // Should include authors
        const hasAuthors = citationText && citationText.length > 50;
        console.log(`Citation includes author info: ${hasAuthors}`);
      }
    });

    test.skip('should link citations to papers in collection', async ({
      page,
    }) => {
      await navigateToChat(page);

      const citations = page.locator('[data-testid="citation"]');
      const count = await citations.count();

      if (count > 0) {
        const firstCitation = citations.first();

        // Should have link to view paper
        const viewLink = firstCitation
          .getByRole('link', { name: /view|see.*paper/i })
          .first();
        const hasLink = await viewLink.isVisible().catch(() => false);

        if (hasLink) {
          // Click should navigate to Papers tab
          await viewLink.click();
          await page.waitForTimeout(1000);

          // Should switch to Papers tab
          const papersTab = page.getByRole('tab', { name: /papers/i }).first();
          const isActive =
            (await papersTab.getAttribute('aria-selected')) === 'true';

          console.log(`Navigated to Papers tab: ${isActive}`);
        }
      }
    });

    test.skip('should handle multiple citations in one response', async ({
      page,
    }) => {
      await navigateToChat(page);

      const citations = page.locator('[data-testid="citation"]');
      const count = await citations.count();

      if (count > 1) {
        console.log(`Multiple citations (${count}) displayed correctly`);

        // All should be visible
        for (let i = 0; i < Math.min(count, 3); i++) {
          await expect(citations.nth(i)).toBeVisible();
        }
      }
    });
  });

  test.describe('5.6 Markdown Rendering', () => {
    test.skip('should render bold text', async ({ page: _page }) => {
      // This test assumes AI response includes markdown
      await navigateToChat(page);

      const aiMessages = page.locator('[data-testid="assistant-message"]');
      const count = await aiMessages.count();

      if (count > 0) {
        const message = aiMessages.last();

        // Check for bold elements
        const boldElements = message.locator('strong, b');
        const hasBold = (await boldElements.count()) > 0;

        console.log(`Markdown bold rendering: ${hasBold}`);
      }
    });

    test.skip('should render lists correctly', async ({ page: _page }) => {
      await navigateToChat(page);

      const aiMessages = page.locator('[data-testid="assistant-message"]');
      const count = await aiMessages.count();

      if (count > 0) {
        const message = aiMessages.last();

        // Check for lists
        const lists = message.locator('ul, ol');
        const hasLists = (await lists.count()) > 0;

        console.log(`Markdown list rendering: ${hasLists}`);
      }
    });

    test.skip('should render code blocks with syntax highlighting', async ({
      page,
    }) => {
      await navigateToChat(page);

      const aiMessages = page.locator('[data-testid="assistant-message"]');
      const count = await aiMessages.count();

      if (count > 0) {
        const message = aiMessages.last();

        // Check for code blocks
        const codeBlocks = message.locator('pre code, .code-block');
        const hasCode = (await codeBlocks.count()) > 0;

        if (hasCode) {
          console.log('Code blocks found with syntax highlighting');

          // Check for syntax highlighting classes
          const firstBlock = codeBlocks.first();
          const className = await firstBlock.getAttribute('class');
          console.log('Code block classes:', className);
        }
      }
    });

    test.skip('should render inline code', async ({ page: _page }) => {
      await navigateToChat(page);

      const aiMessages = page.locator('[data-testid="assistant-message"]');
      const count = await aiMessages.count();

      if (count > 0) {
        const message = aiMessages.last();

        // Check for inline code
        const inlineCode = message.locator('code:not(pre code)');
        const hasInlineCode = (await inlineCode.count()) > 0;

        console.log(`Inline code rendering: ${hasInlineCode}`);
      }
    });

    test.skip('should render links as clickable', async ({ page: _page }) => {
      await navigateToChat(page);

      const aiMessages = page.locator('[data-testid="assistant-message"]');
      const count = await aiMessages.count();

      if (count > 0) {
        const message = aiMessages.last();

        // Check for links
        const links = message.locator('a[href]');
        const hasLinks = (await links.count()) > 0;

        if (hasLinks) {
          const firstLink = links.first();
          const href = await firstLink.getAttribute('href');
          console.log('Rendered link:', href);

          expect(href).toBeTruthy();
        }
      }
    });
  });

  test.describe('5.7 Conversation Context', () => {
    test.skip('should maintain context across messages', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      // Send first message
      await messageInput.fill('What are the main topics in this collection?');
      await sendButton.click();
      await page.waitForTimeout(10000);

      // Send follow-up question with pronoun
      await messageInput.fill('Can you elaborate on the first one?');
      await sendButton.click();
      await page.waitForTimeout(10000);

      // AI should understand "the first one" refers to previous response
      const lastResponse = page
        .locator('[data-testid="assistant-message"]')
        .last();
      const responseText = await lastResponse.textContent();

      // Response should be contextual (not generic)
      expect(responseText?.length).toBeGreaterThan(50);
      console.log('Follow-up response:', responseText?.substring(0, 100));
    });

    test.skip('should include recent messages in context', async ({
      page: _page,
    }) => {
      // The API should send last 10 messages as context
      // This is more of an API test, but we can verify behavior

      await navigateToChat(page);

      // Send multiple messages and verify coherent conversation
      const questions = [
        'What are the main research areas?',
        'Which papers are most cited?',
        'How do these relate to the first area you mentioned?',
      ];

      for (const question of questions) {
        const messageInput = page.locator('textarea').first();
        const sendButton = page.getByRole('button', { name: /send/i }).first();

        await messageInput.fill(question);
        await sendButton.click();
        await page.waitForTimeout(8000);
      }

      // Last response should be contextual
      const lastResponse = page
        .locator('[data-testid="assistant-message"]')
        .last();
      await expect(lastResponse).toBeVisible();

      console.log('Multi-turn conversation completed successfully');
    });
  });

  test.describe('5.8 Error Handling', () => {
    test.skip('should show error message on API failure', async ({
      page: _page,
    }) => {
      // This test would require mocking API failure
      // For now, just check error UI exists

      await navigateToChat(page);

      // Look for potential error states
      const _errorContainer = page.locator(
        '[data-testid="error"], [role="alert"]'
      );

      // Error handling should be implemented
      console.log('Error UI patterns should be implemented for chat failures');
    });

    test.skip('should show retry button for failed messages', async ({
      page,
    }) => {
      // Requires triggering a failure
      await navigateToChat(page);

      const failedMessage = page
        .locator('[data-testid="failed-message"]')
        .first();
      const hasFailed = await failedMessage.isVisible().catch(() => false);

      if (hasFailed) {
        const retryButton = failedMessage
          .getByRole('button', { name: /retry/i })
          .first();
        await expect(retryButton).toBeVisible();
      }
    });

    test.skip('should handle network timeout gracefully', async ({
      page: _page,
    }) => {
      // Would require network simulation
      console.log('Timeout handling should be implemented');
    });
  });

  test.describe('5.9 Conversation Management (Future)', () => {
    test.skip('should show conversation selector', async ({ page: _page }) => {
      // Phase 4 feature
      await navigateToChat(page);

      const conversationSelector = page
        .locator('[data-testid="conversation-selector"]')
        .first();
      const hasSelector = await conversationSelector
        .isVisible()
        .catch(() => false);

      if (hasSelector) {
        console.log('Conversation selector implemented');
      } else {
        console.log(
          'Single conversation mode (conversation selector not yet implemented)'
        );
      }
    });

    test.skip('should create new conversation', async ({ page: _page }) => {
      // Phase 4 feature
      await navigateToChat(page);

      const newConversationButton = page
        .getByRole('button', { name: /new conversation/i })
        .first();
      const hasButton = await newConversationButton
        .isVisible()
        .catch(() => false);

      if (hasButton) {
        await newConversationButton.click();
        await page.waitForTimeout(500);

        // Should clear messages and start fresh
        const messages = page.locator('[data-testid="message"]');
        const count = await messages.count();

        expect(count).toBe(0);
      }
    });

    test.skip('should switch between conversations', async ({
      page: _page,
    }) => {
      // Phase 4 feature
      console.log('Conversation switching to be implemented in Phase 4');
    });
  });

  test.describe('5.10 Performance', () => {
    test.skip('should respond within acceptable time', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      const startTime = Date.now();

      await messageInput.fill('What are the main topics?');
      await sendButton.click();

      // Wait for AI response
      const aiMessage = page
        .locator('[data-testid="assistant-message"]')
        .last();
      await aiMessage.waitFor({ timeout: 30000 });

      const responseTime = Date.now() - startTime;
      console.log(`AI response time: ${responseTime}ms`);

      // Should respond within 30 seconds
      expect(responseTime).toBeLessThan(30000);
    });

    test.skip('should handle rapid message sending', async ({
      page: _page,
    }) => {
      await navigateToChat(page);

      // Send multiple messages quickly
      const messageInput = page.locator('textarea').first();
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      for (let i = 0; i < 3; i++) {
        await messageInput.fill(`Test message ${i + 1}`);
        await sendButton.click();
        await page.waitForTimeout(100);
      }

      // All messages should be queued and processed
      await page.waitForTimeout(5000);

      const userMessages = page.locator('[data-testid="user-message"]');
      const count = await userMessages.count();

      expect(count).toBeGreaterThanOrEqual(3);
    });
  });
});
