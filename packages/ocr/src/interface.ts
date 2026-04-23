/**
 * Text extraction for documents (§5.1.5). Two paths:
 * 1. PDFs with a text layer → extract directly (fast, lossless).
 * 2. Scanned PDFs / images → Tesseract (local) or Azure Document Intelligence.
 *
 * The OCR'd text is stored as a separate blob; the original file is never
 * altered (Non-Negotiable #3).
 */

export interface ExtractedPage {
  readonly pageNumber: number; // 1-indexed
  readonly text: string;
}

export interface ExtractionResult {
  readonly hasTextLayer: boolean;
  readonly pages: readonly ExtractedPage[];
  readonly fullText: string;
  readonly language?: string;
  readonly pageCount: number;
  readonly provider: 'pdf-text' | 'tesseract' | 'azure-docint';
}

export interface OcrClient {
  readonly mode: 'local' | 'azure';
  extract(
    bytes: Buffer,
    mimeType: string,
    options?: { language?: string },
  ): Promise<ExtractionResult>;
}
