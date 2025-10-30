import type { InvoiceData } from '../utils/invoiceParser';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: InvoiceData;
}

export interface ChatState {
  messages: ChatMessage[];
  isProcessing: boolean;
  currentInvoiceData: InvoiceData;
  conversationStage: 'initial' | 'collecting' | 'confirming' | 'generating' | 'completed';
}

export interface InvoiceGenerationResult {
  success: boolean;
  invoiceNumber?: string;
  error?: string;
  pdfUrl?: string;
}