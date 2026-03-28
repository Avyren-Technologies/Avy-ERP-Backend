import { z } from 'zod';

export const startConversationSchema = z.object({
  channel: z.enum(['WEB', 'MOBILE', 'SLACK', 'TEAMS']).default('WEB'),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});
