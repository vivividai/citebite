/**
 * Test script to extract figures from a PDF using the figure pipeline
 *
 * Usage: npx tsx scripts/test-figure-extraction.ts <pdf-path> [output-dir]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs/promises';
import path from 'path';
import { renderPdfPages } from '../src/lib/pdf/renderer';
import { detectFiguresInPage } from '../src/lib/pdf/figure-detector';
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

  // Detect and extract figures from each page
  console.log('\n🔍 Detecting figures...');
  const figuresDir = path.join(outputDir, 'figures');
  await fs.mkdir(figuresDir, { recursive: true });

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
    console.log(`\n   Processing page ${page.pageNumber}...`);

    try {
      // Detect figures
      const analysis = await detectFiguresInPage(
        page.imageBuffer,
        page.pageNumber
      );

      if (analysis.figures.length === 0) {
        console.log(`   No figures detected on page ${page.pageNumber}`);
        continue;
      }

      console.log(
        `   Found ${analysis.figures.length} figure(s) on page ${page.pageNumber}:`
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
      console.error(`   Error processing page ${page.pageNumber}:`, error);
    }

    // Rate limit between pages
    await new Promise(resolve => setTimeout(resolve, 1000));
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
