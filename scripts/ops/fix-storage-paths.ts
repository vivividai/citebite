/**
 * Fix storage_path for papers based on actual files in Supabase Storage
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // List all collection folders
  const { data: folders, error: folderError } = await supabase.storage
    .from('pdfs')
    .list('', { limit: 100 });

  if (folderError) {
    console.error('Error listing folders:', folderError);
    process.exit(1);
  }

  console.log(`Found ${folders?.length || 0} collection folders\n`);

  let totalUpdated = 0;

  for (const folder of folders || []) {
    if (!folder.name) continue;

    const collectionId = folder.name;
    console.log(`Processing collection: ${collectionId}`);

    // List PDFs in this collection
    const { data: files, error: fileError } = await supabase.storage
      .from('pdfs')
      .list(collectionId, { limit: 1000 });

    if (fileError) {
      console.error(`  Error listing files: ${fileError.message}`);
      continue;
    }

    console.log(`  Found ${files?.length || 0} PDF files`);

    for (const file of files || []) {
      if (!file.name.endsWith('.pdf')) continue;

      const paperId = file.name.replace('.pdf', '');
      const storagePath = `${collectionId}/${file.name}`;

      // Update paper's storage_path
      const { error: updateError } = await supabase
        .from('papers')
        .update({
          storage_path: storagePath,
          vector_status: 'pending',
        })
        .eq('paper_id', paperId);

      if (updateError) {
        console.log(`  Skip ${paperId}: ${updateError.message}`);
      } else {
        totalUpdated++;
      }
    }
  }

  console.log(`\nTotal updated: ${totalUpdated} papers`);
}

main().catch(console.error);
