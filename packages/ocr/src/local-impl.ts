import { createRequire } from 'node:module';
import type { ExtractedPage, ExtractionResult, OcrClient } from './interface.js';

// pdf-parse ships as CJS only; use createRequire to load it without a wrapper file.
const require = createRequire(import.meta.url);
type PdfParseFn = (b: Buffer, opts?: Record<string, unknown>) => Promise<{
  numpages: number;
  text: string;
}>;

/**
 * Local OCR client.
 *
 * PDF with text layer → pdf-parse (trivial cost).
 * PDF without text layer or image uploads → Tesseract via tesseract.js.
 *
 * Tesseract is CPU-heavy; the worker keeps concurrency to 1 unless scaled horizontally.
 * Uses eng + any additional languages supplied via `options.language`.
 */
export class LocalOcrClient implements OcrClient {
  readonly mode: 'local' | 'azure' = 'local';

  async extract(
    bytes: Buffer,
    mimeType: string,
    options: { language?: string } = {},
  ): Promise<ExtractionResult> {
    if (mimeType === 'application/pdf' || /\.pdf$/i.test(mimeType)) {
      return this.extractPdf(bytes, options);
    }
    if (mimeType.startsWith('image/')) {
      return this.extractImage(bytes, options);
    }
    // No extraction path — caller records NotRequired.
    return {
      hasTextLayer: false,
      pages: [],
      fullText: '',
      pageCount: 0,
      provider: 'pdf-text',
    };
  }

  private async extractPdf(
    bytes: Buffer,
    options: { language?: string },
  ): Promise<ExtractionResult> {
    const pdfParse = require('pdf-parse') as PdfParseFn;
    const pages: ExtractedPage[] = [];
    let pageIdx = 0;
    const parsed = await pdfParse(bytes, {
      // pdf-parse calls this for each page before joining.
      pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
        const tc = await pageData.getTextContent();
        const text = tc.items.map((i) => i.str).join(' ');
        pageIdx += 1;
        pages.push({ pageNumber: pageIdx, text });
        return text;
      },
    });
    const hasTextLayer = parsed.text.trim().length > 0;
    if (hasTextLayer) {
      return {
        hasTextLayer: true,
        pages,
        fullText: parsed.text,
        pageCount: parsed.numpages,
        provider: 'pdf-text',
      };
    }
    // No text layer — fall back to Tesseract across rasterized pages.
    // Rasterization lives in the worker, not here; return a sentinel so the
    // caller (OCR worker) knows to rasterize and call extractImage per page.
    return {
      hasTextLayer: false,
      pages: [],
      fullText: '',
      pageCount: parsed.numpages,
      provider: 'tesseract',
      ...(options.language !== undefined ? { language: options.language } : {}),
    };
  }

  private async extractImage(
    bytes: Buffer,
    options: { language?: string },
  ): Promise<ExtractionResult> {
    // tesseract.js loads language data lazily; first run is slow.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tesseract = require('tesseract.js') as {
      recognize: (
        image: Buffer,
        lang: string,
      ) => Promise<{ data: { text: string; confidence: number } }>;
    };
    const lang = options.language ?? 'eng';
    const result = await tesseract.recognize(bytes, lang);
    const text = result.data.text ?? '';
    return {
      hasTextLayer: false,
      pages: [{ pageNumber: 1, text }],
      fullText: text,
      pageCount: 1,
      provider: 'tesseract',
      language: lang,
    };
  }
}
