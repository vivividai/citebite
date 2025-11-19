/**
 * Script to generate a simple test PDF for E2E testing
 *
 * Usage: npx tsx scripts/generate-test-pdf.ts
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'tests',
  'fixtures',
  'sample.pdf'
);

function generateTestPDF() {
  console.log('Generating test PDF...');

  // Create a new PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50,
    },
  });

  // Pipe to a file
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(OUTPUT_PATH);
  doc.pipe(writeStream);

  // Title
  doc
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('Sample Research Paper for Testing', {
      align: 'center',
    });

  doc.moveDown();

  // Authors
  doc.fontSize(12).font('Helvetica').text('John Doe, Jane Smith', {
    align: 'center',
  });

  doc.moveDown();

  // Affiliation
  doc.fontSize(10).text('CiteBite Research Lab', {
    align: 'center',
  });

  doc.moveDown(2);

  // Abstract
  doc.fontSize(14).font('Helvetica-Bold').text('Abstract');
  doc.moveDown(0.5);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(
      'This is a sample research paper generated for testing the CiteBite platform. ' +
        'It demonstrates the PDF indexing and retrieval-augmented generation (RAG) capabilities ' +
        'of the system. The paper contains basic structure including title, authors, abstract, ' +
        'and main content sections.'
    );

  doc.moveDown(2);

  // Introduction
  doc.fontSize(14).font('Helvetica-Bold').text('1. Introduction');
  doc.moveDown(0.5);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(
      'Artificial intelligence has made significant progress in recent years, particularly ' +
        'in the field of natural language processing and information retrieval. This paper ' +
        'explores the integration of modern AI techniques for research assistance and knowledge ' +
        'management.'
    );

  doc.moveDown();

  doc.text(
    'The key contributions of this work include:\n' +
      '• Development of automated paper collection systems\n' +
      '• Implementation of citation-backed AI conversations\n' +
      '• Analysis of research trends and insights generation'
  );

  doc.moveDown(2);

  // Methodology
  doc.fontSize(14).font('Helvetica-Bold').text('2. Methodology');
  doc.moveDown(0.5);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(
      'Our approach leverages modern AI models and vector databases to enable semantic search ' +
        'across academic literature. The system architecture consists of three main components: ' +
        'paper collection, indexing, and retrieval.'
    );

  doc.moveDown();

  doc.text(
    'The paper collection module interfaces with academic APIs to gather relevant publications. ' +
      'Each paper is processed through an embedding pipeline that converts textual content into ' +
      'high-dimensional vector representations.'
  );

  doc.moveDown(2);

  // Results
  doc.fontSize(14).font('Helvetica-Bold').text('3. Results');
  doc.moveDown(0.5);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(
      'Experimental results demonstrate the effectiveness of the proposed system. The retrieval ' +
        'accuracy achieved 92% precision on benchmark datasets, with an average response time of ' +
        'less than 2 seconds per query.'
    );

  doc.moveDown();

  doc.text(
    'User studies indicate high satisfaction with the citation quality and relevance of ' +
      'generated insights. The system successfully processes collections of up to 100 papers ' +
      'with minimal latency.'
  );

  doc.moveDown(2);

  // Conclusion
  doc.fontSize(14).font('Helvetica-Bold').text('4. Conclusion');
  doc.moveDown(0.5);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(
      'This work presents a comprehensive platform for AI-powered research assistance. ' +
        'Future work will focus on expanding the system to support multi-modal content and ' +
        'collaborative features.'
    );

  doc.moveDown(2);

  // References
  doc.fontSize(14).font('Helvetica-Bold').text('References');
  doc.moveDown(0.5);

  doc
    .fontSize(10)
    .font('Helvetica')
    .text('[1] Vaswani, A., et al. (2017). Attention is all you need. NIPS.')
    .text(
      '[2] Devlin, J., et al. (2019). BERT: Pre-training of deep bidirectional transformers. NAACL.'
    )
    .text(
      '[3] Brown, T., et al. (2020). Language models are few-shot learners. NeurIPS.'
    );

  // Finalize the PDF
  doc.end();

  // Wait for the file to be written
  writeStream.on('finish', () => {
    console.log(`✅ Test PDF generated successfully at: ${OUTPUT_PATH}`);
    const stats = fs.statSync(OUTPUT_PATH);
    console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
  });

  writeStream.on('error', error => {
    console.error('❌ Error generating PDF:', error);
    process.exit(1);
  });
}

// Run the script
generateTestPDF();
