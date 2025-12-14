/**
 * Test script to extract figures from a PDF using pdffigures2
 *
 * Usage: npx tsx scripts/test-figure-extraction.ts <pdf-path> [output-dir]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs/promises';
import path from 'path';
import { renderPdfPages } from '../src/lib/pdf/renderer';
import {
  detectFigures,
  toPageAnalyses,
} from '../src/lib/pdf/figure-detection-strategy';
import { extractFiguresFromPage } from '../src/lib/pdf/figure-extractor';

async function main() {
  const pdfPath = process.argv[2] || 'docs/temp/attention.pdf';
  const outputDir = process.argv[3] || 'docs/temp/extracted-figures';

  console.log(`\n📄 Processing PDF: ${pdfPath}`);
  console.log(`📁 Output directory: ${outputDir}\n`);

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Read PDF
  const pdfBuffer = await fs.readFile(pdfPath);
  console.log(`📦 PDF size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Render all pages
  console.log('\n🖼️  Rendering PDF pages...');
  const pages = await renderPdfPages(pdfBuffer, { dpi: 150 });
  console.log(`✅ Rendered ${pages.length} pages`);

  // Save rendered pages for reference
  const pagesDir = path.join(outputDir, 'pages');
  await fs.mkdir(pagesDir, { recursive: true });

  for (const page of pages) {
    const pagePath = path.join(pagesDir, `page-${page.pageNumber}.png`);
    await fs.writeFile(pagePath, page.imageBuffer);
    console.log(
      `   Saved page ${page.pageNumber} (${page.width}x${page.height})`
    );
  }

  // Detect figures using pdffigures2
  console.log('\n🔍 Detecting figures using pdffigures2...');
  const figuresDir = path.join(outputDir, 'figures');
  await fs.mkdir(figuresDir, { recursive: true });

  const detectionResult = await detectFigures(pdfBuffer, pages);
  const pageAnalyses = toPageAnalyses(detectionResult);

  console.log(`✅ Detected ${detectionResult.totalFigures} figures total`);

  let totalFigures = 0;
  const detectionResults: Array<{
    pageNumber: number;
    figures: Array<{
      figureNumber: string;
      caption: string;
      type: string;
      boundingBox: { x: number; y: number; width: number; height: number };
    }>;
  }> = [];

  for (const page of pages) {
    const analysis = pageAnalyses.find(a => a.pageNumber === page.pageNumber);

    if (!analysis || analysis.figures.length === 0) {
      console.log(`\n   Page ${page.pageNumber}: No figures detected`);
      continue;
    }

    console.log(
      `\n   Page ${page.pageNumber}: Found ${analysis.figures.length} figure(s):`
    );

    detectionResults.push({
      pageNumber: page.pageNumber,
      figures: analysis.figures.map(f => ({
        figureNumber: f.figureNumber,
        caption:
          f.caption.substring(0, 100) + (f.caption.length > 100 ? '...' : ''),
        type: f.type,
        boundingBox: f.boundingBox,
      })),
    });

    // Extract (crop) each figure
    try {
      const croppedFigures = await extractFiguresFromPage(
        page.imageBuffer,
        page.width,
        page.height,
        analysis.figures,
        page.pageNumber
      );

      // Save each figure
      for (const figure of croppedFigures) {
        totalFigures++;
        const safeName = figure.figureNumber
          .replace(/[^a-zA-Z0-9]/g, '_')
          .toLowerCase();
        const figurePath = path.join(
          figuresDir,
          `p${page.pageNumber}_${safeName}.png`
        );

        await fs.writeFile(figurePath, figure.imageBuffer);
        console.log(
          `     - ${figure.figureNumber} (${figure.type}): ${figurePath}`
        );
        console.log(`       Caption: ${figure.caption.substring(0, 80)}...`);
        console.log(
          `       BBox: x=${figure.boundingBox.x.toFixed(2)}, y=${figure.boundingBox.y.toFixed(2)}, w=${figure.boundingBox.width.toFixed(2)}, h=${figure.boundingBox.height.toFixed(2)}`
        );
      }
    } catch (error) {
      console.error(
        `   Error extracting figures from page ${page.pageNumber}:`,
        error
      );
    }
  }

  // Save detection results as JSON
  const resultsPath = path.join(outputDir, 'detection-results.json');
  await fs.writeFile(resultsPath, JSON.stringify(detectionResults, null, 2));

  console.log(`\n✅ Extraction complete!`);
  console.log(`   Total figures extracted: ${totalFigures}`);
  console.log(`   Results saved to: ${outputDir}`);
  console.log(`   Detection details: ${resultsPath}`);
}

main().catch(console.error);
