import { DOCUMENT_CATEGORIES } from '@ckb/domain';
import { z } from 'zod';

/**
 * Upload payload. Accepts base64 to keep the JSON API simple; a dedicated
 * multipart route can land later if large uploads become painful. For now,
 * the web app converts File → base64 on the client.
 */
export const UploadDocumentBody = z.object({
  category: z.enum(DOCUMENT_CATEGORIES as unknown as [string, ...string[]]),
  originalFilename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  language: z.string().length(2).optional(),
  contentBase64: z.string().min(1),
  tagIds: z.array(z.string().length(26)).optional(),
});
export type UploadDocumentBody = z.infer<typeof UploadDocumentBody>;

export const CreateVersionBody = z.object({
  versionLabel: z.string().min(1).max(64),
  originalFilename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  contentBase64: z.string().min(1),
});
export type CreateVersionBody = z.infer<typeof CreateVersionBody>;

export const AddTagBody = z.object({
  tagId: z.string().length(26),
});
export type AddTagBody = z.infer<typeof AddTagBody>;

export const ListDocumentsQuery = z.object({
  category: z.string().optional(),
  source: z.enum(['ManualUpload', 'EmailIngestion', 'BidHandoff']).optional(),
  includeSuperseded: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuery>;
