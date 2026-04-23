# @ckb/ocr

Text extraction for documents. Local impl uses pdf-parse for PDFs with a text layer and Tesseract for images / scanned PDFs. Azure Document Intelligence is stubbed for cutover.

## Non-Negotiable #3

Originals are never altered. OCR output is a separate blob; the caller writes it at `sha256/<original-hash>/ocr.txt` (or equivalent) alongside the original, not in place of it.
