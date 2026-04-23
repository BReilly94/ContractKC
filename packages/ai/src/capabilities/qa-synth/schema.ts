import { z } from 'zod';

export const QaSynthInputSchema = z.object({
  question: z.string().min(1).max(2048),
  chunks: z
    .array(
      z.object({
        chunkId: z.string().min(1),
        source: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

export type QaSynthInputT = z.infer<typeof QaSynthInputSchema>;
