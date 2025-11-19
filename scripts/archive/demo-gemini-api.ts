/**
 * Gemini File Search API 데모 스크립트
 *
 * 실제 API 호출 과정을 단계별로 보여줍니다
 */

// Load environment variables
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

import {
  createFileSearchStore,
  uploadPdfToStore,
  getFileSearchStore,
  deleteFileSearchStore,
} from '../src/lib/gemini';
import fs from 'fs';

// 색상 출력을 위한 ANSI 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(60) + '\n');
}

async function demo() {
  const testCollectionId = `demo_${Date.now()}`;
  let storeId: string | undefined;

  try {
    // ============================================================
    // Step 1: File Search Store 생성
    // ============================================================
    section('📦 Step 1: File Search Store 생성');

    log('API 호출: createFileSearchStore()', colors.blue);
    log(`  - Collection ID: ${testCollectionId}`, colors.yellow);
    log(`  - Display Name: CiteBite Demo Store`, colors.yellow);

    const startTime1 = Date.now();
    const createResult = await createFileSearchStore(
      testCollectionId,
      'CiteBite Demo Store'
    );
    const duration1 = Date.now() - startTime1;

    if (createResult.success) {
      storeId = createResult.storeId;
      log(`✅ Store 생성 성공! (${duration1}ms)`, colors.green);
      log(`  - Store ID: ${storeId}`, colors.green);
      log(`  - Display Name: ${createResult.storeName}`, colors.green);
    } else {
      log(`❌ Store 생성 실패: ${createResult.error}`, '\x1b[31m');
      return;
    }

    // ============================================================
    // Step 2: Store 정보 조회
    // ============================================================
    section('🔍 Step 2: Store 정보 조회');

    log('API 호출: getFileSearchStore()', colors.blue);
    log(`  - Store ID: ${storeId}`, colors.yellow);

    const startTime2 = Date.now();
    const store = await getFileSearchStore(storeId!);
    const duration2 = Date.now() - startTime2;

    if (store) {
      log(`✅ Store 조회 성공! (${duration2}ms)`, colors.green);
      log(`  - Name: ${store.name}`, colors.green);
      log(`  - Display Name: ${store.displayName}`, colors.green);
      if (store.metadata) {
        log(
          `  - Metadata: ${JSON.stringify(store.metadata, null, 2)}`,
          colors.green
        );
      }
    } else {
      log(`❌ Store 조회 실패`, '\x1b[31m');
    }

    // ============================================================
    // Step 3: PDF 파일 업로드
    // ============================================================
    section('📄 Step 3: PDF 파일 업로드 및 인덱싱');

    const pdfPath = path.join(
      __dirname,
      '..',
      'tests',
      'fixtures',
      'sample.pdf'
    );

    if (!fs.existsSync(pdfPath)) {
      log(`❌ 테스트 PDF 파일을 찾을 수 없습니다: ${pdfPath}`, '\x1b[31m');
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfSizeKB = (pdfBuffer.length / 1024).toFixed(2);

    log('API 호출: uploadPdfToStore()', colors.blue);
    log(`  - Store ID: ${storeId}`, colors.yellow);
    log(`  - PDF 크기: ${pdfSizeKB} KB`, colors.yellow);
    log(`  - Paper ID: demo_paper_001`, colors.yellow);
    log(`  - Title: Sample Research Paper for Testing`, colors.yellow);

    log('\n📊 업로드 진행 중... (자동 청킹 및 임베딩 생성)', colors.blue);

    const startTime3 = Date.now();
    const uploadResult = await uploadPdfToStore(storeId!, pdfBuffer, {
      paper_id: 'demo_paper_001',
      title: 'Sample Research Paper for Testing',
      authors: 'John Doe, Jane Smith',
      year: 2024,
      venue: 'CiteBite Research Lab',
    });
    const duration3 = Date.now() - startTime3;

    if (uploadResult.success) {
      log(`✅ PDF 업로드 및 인덱싱 성공! (${duration3}ms)`, colors.green);
      if (uploadResult.fileId) {
        log(`  - File ID: ${uploadResult.fileId}`, colors.green);
      }
      log(`  - Gemini가 자동으로 수행한 작업:`, colors.cyan);
      log(`    1. PDF 텍스트 추출`, colors.cyan);
      log(`    2. 문서 청킹 (chunk 단위로 분할)`, colors.cyan);
      log(`    3. 각 청크의 임베딩 생성`, colors.cyan);
      log(`    4. 벡터 인덱스 생성 및 저장`, colors.cyan);
    } else {
      log(`❌ PDF 업로드 실패: ${uploadResult.error}`, '\x1b[31m');
    }

    // ============================================================
    // Step 4: Store 삭제 (정리)
    // ============================================================
    section('🗑️  Step 4: Store 삭제 (테스트 정리)');

    log('API 호출: deleteFileSearchStore()', colors.blue);
    log(`  - Store ID: ${storeId}`, colors.yellow);

    const startTime4 = Date.now();
    const deleteSuccess = await deleteFileSearchStore(storeId!);
    const duration4 = Date.now() - startTime4;

    if (deleteSuccess) {
      log(`✅ Store 삭제 성공! (${duration4}ms)`, colors.green);
    } else {
      log(`❌ Store 삭제 실패`, '\x1b[31m');
    }

    // ============================================================
    // 요약
    // ============================================================
    section('📈 API 호출 요약');

    console.log(`총 API 호출 시간:`);
    console.log(`  - Store 생성: ${duration1}ms`);
    console.log(`  - Store 조회: ${duration2}ms`);
    console.log(`  - PDF 업로드 및 인덱싱: ${duration3}ms`);
    console.log(`  - Store 삭제: ${duration4}ms`);
    console.log(
      `  - 총 소요 시간: ${duration1 + duration2 + duration3 + duration4}ms\n`
    );

    log(
      '✅ 모든 Gemini File Search API 기능 테스트 완료!',
      colors.bright + colors.green
    );
    log(
      '\n💡 이제 Phase 2에서 이 Store를 사용하여 RAG 챗봇을 구현할 수 있습니다!',
      colors.cyan
    );
  } catch (error) {
    log(`\n❌ 오류 발생: ${error}`, '\x1b[31m');
    console.error(error);
  }
}

// 스크립트 실행
log('\n🚀 Gemini File Search API 데모 시작...\n', colors.bright + colors.blue);
demo().catch(console.error);
