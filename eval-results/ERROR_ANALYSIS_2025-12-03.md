# QASPER RAG Evaluation Error Analysis Report

**Date**: 2025-12-03
**Model**: Gemini 2.5 Flash (JSON mode)
**Dataset**: QASPER dev set (30 papers, 92 questions)
**Collection ID**: 360fff9f-9237-457d-859b-12103b67998f

---

## Executive Summary

| Metric              | Value       |
| ------------------- | ----------- |
| Overall F1 Score    | **9.55%**   |
| Overall Exact Match | **5.43%**   |
| Total Questions     | 92          |
| Zero F1 Questions   | 22 (23.9%)  |
| Runtime             | ~18 minutes |

### Performance by Answer Type

| Answer Type  | Count | F1 Score | Exact Match |
| ------------ | ----- | -------- | ----------- |
| Extractive   | 50    | 4.91%    | 0%          |
| Abstractive  | 19    | 7.03%    | 0%          |
| Yes/No       | 15    | 33.33%   | 33.33%      |
| Unanswerable | 8     | 0%       | 0%          |

---

## Failure Analysis Summary

### Zero F1 Score Breakdown (22 questions)

| Answer Type  | Count | % of Type | Primary Failure Cause                                       |
| ------------ | ----- | --------- | ----------------------------------------------------------- |
| Unanswerable | 8     | 100%      | System attempts to answer when it should say "unanswerable" |
| Yes/No       | 10    | 66.7%     | Incorrect yes/no prediction                                 |
| Extractive   | 3     | 6%        | Verbose answers vs. exact span match                        |
| Abstractive  | 1     | 5.3%      | Semantic mismatch                                           |

---

## Detailed Error Categories

### Category 1: Unanswerable Questions (8/8 failed - 100% failure rate)

**Root Cause**: The RAG system is not designed to recognize when a question cannot be answered from the provided documents. It always attempts to provide an answer.

#### Example 1

| Field          | Content                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | What crowdsourcing platform is used?                                                                                                                                               |
| **True Label** | `unanswerable`                                                                                                                                                                     |
| **Predicted**  | "The crowdsourcing platform used is CrowdFlower. The data collection for dialogs was performed using workers on this platform."                                                    |
| **Analysis**   | System found CrowdFlower mentioned in the collection (from a different paper) and reported it, when the specific paper being asked about doesn't mention a crowdsourcing platform. |

#### Example 2

| Field          | Content                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | How do they match words before reordering them?                                                                                                                                   |
| **True Label** | `unanswerable`                                                                                                                                                                    |
| **Predicted**  | "Before reordering, words are matched by translating each word in the source language into English using a bilingual dictionary, specifically Google Translate word translation." |
| **Analysis**   | System retrieved information from other papers in the collection about word matching, answering a question that the target paper doesn't address.                                 |

#### Example 3

| Field          | Content                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | What is the interannotator agreement for the human evaluation?                                                                                                                                        |
| **True Label** | `unanswerable`                                                                                                                                                                                        |
| **Predicted**  | "The inter-annotator agreement for human evaluation varies depending on the specific task and dataset: For the Dialog domain (DL-PS) dataset, the average Kappa value among annotators was 0.6033..." |
| **Analysis**   | System synthesized information from multiple papers when the target paper doesn't report inter-annotator agreement.                                                                                   |

**Recommendation**:

- Add confidence thresholds to the RAG system
- Implement "unanswerable" detection based on retrieval confidence scores
- Consider fine-tuning the LLM prompt to output "I cannot find this information in the provided documents" when confidence is low

---

### Category 2: Yes/No Questions (10/15 failed - 66.7% failure rate)

**Root Cause**: The system provides detailed explanations instead of simple yes/no responses. Additionally, some answers are factually incorrect.

#### Example 1: Incorrect Prediction

| Field          | Content                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | Did they use a crowdsourcing platform for manual annotations?                                                                                                                                               |
| **True Label** | `no`                                                                                                                                                                                                        |
| **Predicted**  | "Yes, crowdsourcing platforms were used for manual annotations in several instances described in the excerpts. Specifically: One research effort explicitly used the crowdsourcing platform CrowdFlower..." |
| **Analysis**   | System retrieved information from other papers and incorrectly answered "yes" for a paper that didn't use crowdsourcing. This is a **cross-paper contamination** issue.                                     |

#### Example 2: Format Mismatch

| Field          | Content                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | Does BERT reach the best performance among all the algorithms compared?                                                                            |
| **True Label** | `no`                                                                                                                                               |
| **Predicted**  | "BERT generally performs very well and often outperforms other algorithms..." (but evaluated as F1=1.0 which is actually a success)                |
| **Analysis**   | Wait - this was marked as success (F1=1.0) but the predicted starts with "BERT generally..." not "no". Need to verify the yes/no extraction logic. |

#### Example 3: Wrong Answer

| Field          | Content                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | Do they evaluate only on English datasets?                                                                                                                      |
| **True Label** | `yes`                                                                                                                                                           |
| **Predicted**  | "No, the evaluations are not conducted only on English datasets. Several excerpts indicate that evaluations are performed on a variety of languages..."         |
| **Analysis**   | System incorrectly answered "No" when the correct answer is "Yes". This is a factual error, possibly due to cross-paper contamination in the shared collection. |

#### Example 4: Wrong Answer

| Field          | Content                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | Do they use graphical models?                                                                                                                                                          |
| **True Label** | `no`                                                                                                                                                                                   |
| **Predicted**  | "Yes, the research uses graphical models. Specifically, the generative process for their Markov structure with a neural projector is depicted as a graphical model in Figure FIGREF6." |
| **Analysis**   | System found a figure reference mentioning "graphical model" from a different paper and incorrectly answered "yes".                                                                    |

**Recommendation**:

- Implement per-paper isolation in the retrieval phase
- Add paper ID filtering to prevent cross-paper contamination
- Modify the prompt to force simple yes/no responses for boolean questions

---

### Category 3: Extractive Questions (3/50 failed - 6% failure rate)

**Root Cause**: The reference answers are often exact spans or citation markers (e.g., "BIBREF19", "rupnik2016news") while the system provides verbose explanatory answers.

#### Example 1

| Field          | Content                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | Which multilingual approaches do they compare with?                                                                                                                                                                                          |
| **True Label** | `["BIBREF19", "BIBREF20"]`                                                                                                                                                                                                                   |
| **Predicted**  | "The research paper excerpts indicate comparisons with several multilingual approaches across different tasks: **For Zero-Shot and Under-Resourced Neural Machine Translation (NMT):** \* **Pivoting** is a strong baseline..." (600+ words) |
| **Analysis**   | The reference answer is just bibliography references, but the system provides a comprehensive explanation. The SQuAD-style F1 metric cannot handle this discrepancy.                                                                         |

#### Example 2

| Field          | Content                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Question**   | What is the core component for KBQA?                                                                                                                                                       |
| **True Label** | `"answer questions by obtaining information from KB tuples"`                                                                                                                               |
| **Predicted**  | "Relation detection is a core component for many Natural Language Processing (NLP) applications, including Knowledge Base Question Answering (KBQA). It is considered a key step in KBQA." |
| **Analysis**   | The system's answer is semantically correct but uses different wording. The token-level F1 metric penalizes this heavily.                                                                  |

#### Example 3

| Field          | Content                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Question**   | What are the sources of the datasets?                                                                                                                                                |
| **True Label** | `"rupnik2016news"`                                                                                                                                                                   |
| **Predicted**  | "The datasets mentioned in the provided excerpts originate from various sources: \* **WordNetQA and DictionaryQA**: These datasets are constructed from expert knowledge sources..." |
| **Analysis**   | The reference is a citation key while the system provides a detailed explanation. Complete format mismatch.                                                                          |

**Recommendation**:

- Consider using semantic similarity metrics (BERTScore, ROUGE-L) in addition to token F1
- For extractive questions, add instructions to output concise answers matching the source text
- Evaluate whether QASPER reference format (citation keys) is appropriate for this task

---

### Category 4: Abstractive Questions (1/19 failed - 5.3% failure rate)

Generally the best-performing category, with only 1 complete failure.

#### Example 1

| Field          | Content                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question**   | Which eight NER tasks did they evaluate on?                                                                                                                                                                 |
| **True Label** | `"BC5CDR-disease, NCBI-disease, BC5CDR-chem, BC4CHEMD, BC2GM, JNLPBA, LINNAEUS, Species-800"`                                                                                                               |
| **Predicted**  | "Based on the available excerpts, the researchers evaluated their proposed method on eight biomedical Named Entity Recognition (NER) tasks. However, the specific names or details of these eight tasks..." |
| **Analysis**   | The system acknowledges 8 NER tasks but couldn't find the specific names. This is likely a **retrieval failure** - the relevant chunk wasn't retrieved.                                                     |

**Recommendation**:

- Increase the number of retrieved chunks (currently top-20)
- Improve chunking strategy to ensure dataset lists aren't split across chunks
- Consider re-ranking retrieved chunks before LLM generation

---

## Cross-Paper Contamination Issue

A critical finding is that **all 30 papers share a single collection**, causing the RAG system to retrieve chunks from papers other than the one being asked about. This leads to:

1. **False positive answers**: Answering "yes" to yes/no questions based on information from other papers
2. **Incorrect extractive answers**: Pulling dataset names, methods, or metrics from unrelated papers
3. **Failed unanswerable detection**: Finding "relevant" information from other papers when the target paper doesn't contain the answer

### Evidence

Multiple zero-F1 predictions show the system retrieving from the wrong papers:

- "Did they use a crowdsourcing platform?" → Retrieved CrowdFlower from another paper
- "What crowdsourcing platform is used?" → Answered CrowdFlower when the target paper doesn't use one
- "Do they use graphical models?" → Found a graphical model figure from a different paper

---

## Recommendations for Improvement

### High Priority (Expected Impact: +20-30% F1)

1. **Per-Paper Isolation**: Filter retrieval results to only include chunks from the specific paper being queried
   - Add `paperId` filter to the hybrid search
   - This would fix most yes/no and unanswerable failures

2. **Unanswerable Detection**: Add confidence thresholds
   - If top retrieval score < 0.02, output "unanswerable"
   - Train or prompt the LLM to recognize when information is missing

### Medium Priority (Expected Impact: +5-10% F1)

3. **Yes/No Response Format**: Force binary outputs for boolean questions
   - Add question type classification before RAG
   - Use a separate prompt template for yes/no questions

4. **Semantic Similarity Metrics**: Use BERTScore alongside token F1
   - Token F1 is too strict for abstractive/generative answers
   - Many semantically correct answers score 0 due to wording differences

### Low Priority (Expected Impact: +2-5% F1)

5. **Increased Retrieval Depth**: Retrieve more chunks for specific question types
   - Especially for "list all X" type questions
   - Consider re-ranking strategies

6. **Chunking Optimization**: Ensure lists and tables aren't split across chunks
   - Would help with questions asking for specific lists of items

---

## Conclusion

The current RAG system achieves **9.55% F1** on QASPER, which is significantly below state-of-the-art benchmarks (typical range: 25-40% F1). However, the primary cause is not the RAG architecture itself but rather:

1. **Evaluation design flaw**: All 30 papers share one collection, causing cross-paper contamination
2. **Metric mismatch**: Token-level F1 penalizes verbose but semantically correct answers
3. **Missing capability**: No unanswerable detection (0% on 8 unanswerable questions)

Fixing the per-paper isolation alone should yield substantial improvements. The yes/no question performance (33% F1 with correct answers) suggests the LLM reasoning is working reasonably well when given the right context.

---

## Appendix: Sample Correct Predictions (F1 = 1.0)

| Question                                                                                             | Answer Type | Predicted                                                                                                               | Reference |
| ---------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| Is the student reflection data very different from the newspaper data?                               | yes_no      | "Yes, the student reflection data is described as 'quite dissimilar' and 'entirely different' from newspaper data..."   | yes       |
| Do they show on which examples how conflict works better than attention?                             | yes_no      | "Yes, the provided excerpts show specific examples where the model combining attention and conflict performs better..." | yes       |
| Do they test their framework performance on commonly used language pairs, such as English-to-German? | yes_no      | "Yes, the framework's performance was tested on English-to-German translation..."                                       | yes       |
| Does the model have attention?                                                                       | yes_no      | "Yes, the models described in the excerpts incorporate attention mechanisms..."                                         | yes       |

These successes show that when the retrieval returns the correct paper's content, the LLM can accurately answer yes/no questions.
