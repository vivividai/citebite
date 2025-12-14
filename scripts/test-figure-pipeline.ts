/**
 * Test script for full figure pipeline
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx scripts/test-figure-pipeline.ts docs/temp/attention.pdf
 *
 * Options:
 *   --skip-analysis  Skip Gemini analysis, only extract images (faster)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { processPdfFigures } from '../src/lib/pdf/figure-pipeline';

// Test paper/collection IDs (use existing or create temp)
const TEST_PAPER_ID = 'test-paper-pdffigures2';
const TEST_COLLECTION_ID = 'test-collection-pdffigures2';

async function main() {
  const args = process.argv.slice(2);
  const skipAnalysis = args.includes('--skip-analysis');
  const pdfPath = args.find(arg => !arg.startsWith('--'));

  if (!pdfPath) {
    console.error(
      'Usage: npx tsx scripts/test-figure-pipeline.ts <pdf-path> [--skip-analysis]'
    );
    process.exit(1);
  }

  const absolutePath = path.resolve(pdfPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const strategy = process.env.FIGURE_DETECTION_STRATEGY || 'gemini';

  console.log('='.repeat(60));
  console.log('Full Figure Pipeline Test');
  console.log('='.repeat(60));
  console.log(`PDF: ${absolutePath}`);
  console.log(`Detection strategy: ${strategy}`);
  console.log(`Skip analysis: ${skipAnalysis}`);
  console.log(`Paper ID: ${TEST_PAPER_ID}`);
  console.log(`Collection ID: ${TEST_COLLECTION_ID}`);
  console.log('='.repeat(60));

  // Read PDF
  const pdfBuffer = fs.readFileSync(absolutePath);
  console.log(`PDF size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB\n`);

  // Run full pipeline
  console.log('[Pipeline] Starting figure processing...\n');
  const startTime = Date.now();

  try {
    const result = await processPdfFigures(
      pdfBuffer,
      TEST_PAPER_ID,
      TEST_COLLECTION_ID,
      {
        detectionStrategy: strategy as 'gemini' | 'pdffigures2',
        skipAnalysis,
        onProgress: progress => {
          console.log(`  [${progress.phase}] ${progress.message}`);
        },
      }
    );

    const pipelineTime = Date.now() - startTime;

    console.log('\n' + '-'.repeat(60));
    console.log('[Pipeline] Results:');
    console.log(`  Total pages: ${result.totalPages}`);
    console.log(`  Pages with figures: ${result.pagesWithFigures.join(', ')}`);
    console.log(`  Figures detected: ${result.stats.figuresDetected}`);
    console.log(`  Figures analyzed: ${result.stats.figuresAnalyzed}`);
    console.log(`  Processing time: ${(pipelineTime / 1000).toFixed(2)}s`);

    // Save figures to local folder
    const outputDir = path.join(
      path.dirname(absolutePath),
      'extracted-figures'
    );
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`\n[Saving] Saving figures to: ${outputDir}`);
    for (const fig of result.figures) {
      const safeName = fig.normalizedFigureNumber.replace(/[^a-z0-9-]/gi, '-');
      const filename = `page${fig.pageNumber}-${safeName}.png`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, fig.imageBuffer);
      console.log(
        `  Saved: ${filename} (${(fig.imageBuffer.length / 1024).toFixed(1)} KB)`
      );
    }

    // Show detected figures
    console.log('\n[Figures]:');
    for (const fig of result.figures) {
      console.log(
        `  - ${fig.figureNumber} (Page ${fig.pageNumber}, ${fig.type})`
      );
      console.log(`    Caption: ${fig.caption.substring(0, 60)}...`);
      if (fig.description) {
        console.log(`    Description: ${fig.description.substring(0, 60)}...`);
      }
      console.log(
        `    Image size: ${(fig.imageBuffer.length / 1024).toFixed(1)} KB`
      );
    }

    // Skip indexing for local test (requires valid UUID)
    console.log('\n' + '='.repeat(60));
    console.log('Test complete!');
    console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log(`\nImages saved to: ${outputDir}`);
  } catch (error) {
    console.error('\n[Error]:', error);
    process.exit(1);
  }
}

main().catch(console.error);
