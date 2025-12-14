/**
 * Test script for figure detection
 *
 * Usage: npx tsx scripts/test-figure-detection.ts docs/temp/attention.pdf
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { renderPdfPagesStream } from '../src/lib/pdf/renderer';
import {
  detectFigures,
  getDetectionStrategy,
  toPageAnalyses,
} from '../src/lib/pdf/figure-detection-strategy';
import { isPdffigures2Available } from '../src/lib/pdf/pdffigures2-client';

async function main() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('Usage: npx tsx scripts/test-figure-detection.ts <pdf-path>');
    process.exit(1);
  }

  const absolutePath = path.resolve(pdfPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Figure Detection Test');
  console.log('='.repeat(60));
  console.log(`PDF: ${absolutePath}`);
  console.log(`Current strategy: ${getDetectionStrategy()}`);

  // Check pdffigures2 availability
  const pdffigures2Available = await isPdffigures2Available();
  console.log(`pdffigures2 available: ${pdffigures2Available}`);
  console.log('='.repeat(60));

  // Read PDF
  const pdfBuffer = fs.readFileSync(absolutePath);
  console.log(`PDF size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Render pages
  console.log('\n[Phase 1] Rendering pages...');
  const pages = [];
  for await (const page of renderPdfPagesStream(pdfBuffer, { dpi: 150 })) {
    pages.push(page);
    process.stdout.write(`\r  Rendered page ${page.pageNumber}`);
  }
  console.log(`\n  Total pages: ${pages.length}`);

  // Test Gemini detection
  console.log('\n[Phase 2] Testing Gemini detection...');
  const startGemini = Date.now();

  try {
    const geminiResult = await detectFigures(pdfBuffer, pages, {
      strategy: 'gemini',
      concurrency: 3,
      onProgress: (current, total) => {
        process.stdout.write(`\r  Progress: ${current}/${total} pages`);
      },
    });

    const geminiTime = Date.now() - startGemini;
    console.log(`\n  Time: ${(geminiTime / 1000).toFixed(2)}s`);
    console.log(`  Figures detected: ${geminiResult.totalFigures}`);

    const analyses = toPageAnalyses(geminiResult);
    for (const analysis of analyses) {
      console.log(`  - Page ${analysis.pageNumber}:`);
      for (const fig of analysis.figures) {
        console.log(
          `      ${fig.figureNumber} (${fig.type}): ${fig.caption.substring(0, 50)}...`
        );
      }
    }
  } catch (error) {
    console.error(`\n  Error: ${error}`);
  }

  // Test pdffigures2 detection (if available)
  if (pdffigures2Available) {
    console.log('\n[Phase 3] Testing pdffigures2 detection...');
    const startPdf2 = Date.now();

    try {
      const pdf2Result = await detectFigures(pdfBuffer, pages, {
        strategy: 'pdffigures2',
      });

      const pdf2Time = Date.now() - startPdf2;
      console.log(`  Time: ${(pdf2Time / 1000).toFixed(2)}s`);
      console.log(`  Figures detected: ${pdf2Result.totalFigures}`);

      const analyses = toPageAnalyses(pdf2Result);
      for (const analysis of analyses) {
        console.log(`  - Page ${analysis.pageNumber}:`);
        for (const fig of analysis.figures) {
          console.log(
            `      ${fig.figureNumber} (${fig.type}): ${fig.caption.substring(0, 50)}...`
          );
        }
      }
    } catch (error) {
      console.error(`  Error: ${error}`);
    }
  } else {
    console.log(
      '\n[Phase 3] Skipping pdffigures2 test (service not available)'
    );
    console.log('  To test pdffigures2, run: docker-compose up -d pdffigures2');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete!');
}

main().catch(console.error);
