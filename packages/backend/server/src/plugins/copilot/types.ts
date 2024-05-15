import { AiPromptRole } from '@prisma/client';
import type { ClientOptions as OpenAIClientOptions } from 'openai';
import {
  encoding_for_model,
  get_encoding,
  Tiktoken,
  TiktokenModel,
} from 'tiktoken';
import { z } from 'zod';

import type { ChatPrompt } from './prompt';
import type { FalConfig } from './providers/fal';

export interface CopilotConfig {
  openai: OpenAIClientOptions;
  fal: FalConfig;
  unsplashKey: string;
  test: never;
}

export enum AvailableModels {
  // text to text
  Gpt4Omni = 'gpt-4o',
  Gpt4VisionPreview = 'gpt-4-vision-preview',
  Gpt4TurboPreview = 'gpt-4-turbo-preview',
  Gpt35Turbo = 'gpt-3.5-turbo',
  // embeddings
  TextEmbedding3Large = 'text-embedding-3-large',
  TextEmbedding3Small = 'text-embedding-3-small',
  TextEmbeddingAda002 = 'text-embedding-ada-002',
  // moderation
  TextModerationLatest = 'text-moderation-latest',
  TextModerationStable = 'text-moderation-stable',
  // text to image
  DallE3 = 'dall-e-3',
}

export type AvailableModel = keyof typeof AvailableModels;

export function getTokenEncoder(model?: string | null): Tiktoken | undefined {
  if (!model) return undefined;
  const modelStr = AvailableModels[model as AvailableModel];
  if (!modelStr) return undefined;
  if (modelStr.startsWith('gpt')) {
    return encoding_for_model(modelStr as TiktokenModel);
  } else if (modelStr.startsWith('dall')) {
    // dalle don't need to calc the token
    return undefined;
  } else {
    return get_encoding('cl100k_base');
  }
}

// ======== ChatMessage ========

export const ChatMessageRole = Object.values(AiPromptRole) as [
  'system',
  'assistant',
  'user',
];

const PureMessageSchema = z.object({
  content: z.string(),
  attachments: z.array(z.string()).optional().nullable(),
  params: z
    .record(z.union([z.string(), z.array(z.string())]))
    .optional()
    .nullable(),
});

export const PromptMessageSchema = PureMessageSchema.extend({
  role: z.enum(ChatMessageRole),
}).strict();

export type PromptMessage = z.infer<typeof PromptMessageSchema>;

export type PromptParams = NonNullable<PromptMessage['params']>;

export const ChatMessageSchema = PromptMessageSchema.extend({
  createdAt: z.date(),
}).strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SubmittedMessageSchema = PureMessageSchema.extend({
  sessionId: z.string(),
  content: z.string().optional(),
}).strict();

export type SubmittedMessage = z.infer<typeof SubmittedMessageSchema>;

export const ChatHistorySchema = z
  .object({
    sessionId: z.string(),
    action: z.string().optional(),
    tokens: z.number(),
    messages: z.array(PromptMessageSchema.or(ChatMessageSchema)),
    createdAt: z.date(),
  })
  .strict();

export type ChatHistory = z.infer<typeof ChatHistorySchema>;

// ======== Chat Session ========

export interface ChatSessionOptions {
  // connect ids
  userId: string;
  workspaceId: string;
  docId: string;
  promptName: string;
}

export interface ChatSessionState
  extends Omit<ChatSessionOptions, 'promptName'> {
  // connect ids
  sessionId: string;
  // states
  prompt: ChatPrompt;
  messages: ChatMessage[];
}

export type ListHistoriesOptions = {
  action: boolean | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sessionId: string | undefined;
};

// ======== Provider Interface ========

export enum CopilotProviderType {
  FAL = 'fal',
  OpenAI = 'openai',
  // only for test
  Test = 'test',
}

export enum CopilotCapability {
  TextToText = 'text-to-text',
  TextToEmbedding = 'text-to-embedding',
  TextToImage = 'text-to-image',
  ImageToImage = 'image-to-image',
  ImageToText = 'image-to-text',
}

const CopilotProviderOptionsSchema = z.object({
  signal: z.instanceof(AbortSignal).optional(),
  user: z.string().optional(),
});

const CopilotChatOptionsSchema = CopilotProviderOptionsSchema.extend({
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
}).optional();

export type CopilotChatOptions = z.infer<typeof CopilotChatOptionsSchema>;

const CopilotEmbeddingOptionsSchema = CopilotProviderOptionsSchema.extend({
  dimensions: z.number(),
}).optional();

export type CopilotEmbeddingOptions = z.infer<
  typeof CopilotEmbeddingOptionsSchema
>;

const CopilotImageOptionsSchema = CopilotProviderOptionsSchema.extend({
  seed: z.number().optional(),
}).optional();

export type CopilotImageOptions = z.infer<typeof CopilotImageOptionsSchema>;

export interface CopilotProvider {
  readonly type: CopilotProviderType;
  getCapabilities(): CopilotCapability[];
  isModelAvailable(model: string): Promise<boolean>;
}

export interface CopilotTextToTextProvider extends CopilotProvider {
  generateText(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotChatOptions
  ): Promise<string>;
  generateTextStream(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotChatOptions
  ): AsyncIterable<string>;
}

export interface CopilotTextToEmbeddingProvider extends CopilotProvider {
  generateEmbedding(
    messages: string[] | string,
    model: string,
    options?: CopilotEmbeddingOptions
  ): Promise<number[][]>;
}

export interface CopilotTextToImageProvider extends CopilotProvider {
  generateImages(
    messages: PromptMessage[],
    model: string,
    options?: CopilotImageOptions
  ): Promise<Array<string>>;
  generateImagesStream(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotImageOptions
  ): AsyncIterable<string>;
}

export interface CopilotImageToTextProvider extends CopilotProvider {
  generateText(
    messages: PromptMessage[],
    model: string,
    options?: CopilotChatOptions
  ): Promise<string>;
  generateTextStream(
    messages: PromptMessage[],
    model: string,
    options?: CopilotChatOptions
  ): AsyncIterable<string>;
}

export interface CopilotImageToImageProvider extends CopilotProvider {
  generateImages(
    messages: PromptMessage[],
    model: string,
    options?: CopilotImageOptions
  ): Promise<Array<string>>;
  generateImagesStream(
    messages: PromptMessage[],
    model?: string,
    options?: CopilotImageOptions
  ): AsyncIterable<string>;
}

export type CapabilityToCopilotProvider = {
  [CopilotCapability.TextToText]: CopilotTextToTextProvider;
  [CopilotCapability.TextToEmbedding]: CopilotTextToEmbeddingProvider;
  [CopilotCapability.TextToImage]: CopilotTextToImageProvider;
  [CopilotCapability.ImageToText]: CopilotImageToTextProvider;
  [CopilotCapability.ImageToImage]: CopilotImageToImageProvider;
};
