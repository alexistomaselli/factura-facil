import React, { useState, useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline';
import type { ChatMessage, ChatState } from '../types/chat';
import type { InvoiceData } from '../utils/invoiceParser';
import { InvoiceParser } from '../utils/invoiceParser';
import { InvoiceService, type InvoiceResult } from '../services/invoiceService';

const InvoiceChat: React.FC = () => {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isProcessing: false,
    currentInvoiceData: {},
    conversationStage: 'initial',
  });

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const [lastInvoiceResult, setLastInvoiceResult] = useState<InvoiceResult | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatState.messages]);

  useEffect(() => {
    const checkServerConnection = async () => {
      const health = await InvoiceService.checkHealth();
      setServerConnected(health.success);

      if (!health.success) {
        addMessage(
          'Estás probando sin conexión. Podés emitir una factura de prueba.',
          'assistant'
        );
      }
    };

    checkServerConnection();
  }, []);

  const addMessage = (content: string, type: 'user' | 'assistant', data?: InvoiceData) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type,
      content,
      timestamp: new Date(),
      data,
    };

    setChatState(prev => {
      console.log('Adding message:', newMessage);
      console.log('Current messages:', prev.messages);
      return {
        ...prev,
        messages: [...prev.messages, newMessage],
      };
    });
  };

  const processUserMessage = async (message: string) => {
    console.log('processUserMessage called with:', message);
    setChatState(prev => ({ ...prev, isProcessing: true }));

    try {
      // Intentar parsear el mensaje
      const parseResult = InvoiceParser.parse(message);
      console.log('Parse result:', parseResult);

      const isPrueba = /prueba|test/i.test(message);
      let data: InvoiceData = { ...parseResult.data };

      if (isPrueba) {
        data = {
          cliente: {
            nombre: data.cliente?.nombre || 'Cliente Prueba',
            documento: data.cliente?.documento || '12345678',
            tipoDocumento: data.cliente?.tipoDocumento || 'DNI',
          },
          importe: data.importe || 1000,
          tipoComprobante: data.tipoComprobante || 'C',
          concepto: data.concepto || 'servicio',
          descripcion: data.descripcion || 'Factura de prueba',
        };
      }

      // Si se tienen los datos mínimos, generar directamente
      const hasMinimum = !!(data.cliente?.nombre && data.cliente.documento && data.importe);

      if (hasMinimum) {
        setChatState(prev => ({ ...prev, currentInvoiceData: data, conversationStage: 'confirming' }));
        const summaryText = `Perfecto, estos son los datos:\n\nCliente: ${data.cliente?.nombre}\nDocumento: ${data.cliente?.tipoDocumento} ${data.cliente?.documento}\nImporte: $${data.importe?.toLocaleString('es-AR')}\nTipo: Factura ${data.tipoComprobante}\n\n¿Confirmas la emisión?`;
        addMessage(summaryText, 'assistant', data);
        setChatState(prev => ({ ...prev, isProcessing: false }));
      } else {
        const missing = parseResult.missingFields;
        const questions = missing.length > 0 ? InvoiceParser.generateQuestions(missing) : [];
        const summaryParts = [
          data.cliente?.nombre ? `Cliente: ${data.cliente.nombre}` : null,
          data.cliente?.documento ? `Documento: ${data.cliente.documento}` : null,
          data.importe ? `Importe: $${data.importe.toLocaleString('es-AR')}` : null,
        ].filter(Boolean);

        const summary = summaryParts.length ? `\n${summaryParts.join('\n')}\n` : '';
        addMessage(
          `Necesito ${missing.length > 1 ? 'algunos datos más' : 'un dato más'}.${summary}\n${questions[0] || '¿Cuál es el nombre del cliente?'}`,
          'assistant'
        );
        setChatState(prev => ({ ...prev, currentInvoiceData: data, conversationStage: 'collecting', isProcessing: false }));
      }
    } catch (err) {
      console.error('Error procesando mensaje:', err);
      addMessage('❌ Ocurrió un error procesando tu solicitud. Intenta nuevamente.', 'assistant');
    } finally {
      setChatState(prev => ({ ...prev, isProcessing: false }));
    }
  };





  const handleConfirmInvoice = async (dataOverride?: InvoiceData) => {
    setChatState(prev => ({ ...prev, conversationStage: 'generating', isProcessing: true }));
    addMessage('Procesando...', 'assistant');

    try {
      const payload = dataOverride ?? chatState.currentInvoiceData;
      const result: InvoiceResult = await InvoiceService.generateInvoice(payload);

      if (result.success && result.invoice) {
        setLastInvoiceResult(result);
        const isDemoMode = serverConnected === false;
        addMessage(
          `¡Factura emitida!${isDemoMode ? ' (Demo)' : ''}`,
          'assistant'
        );
      } else {
        addMessage(
          `No se pudo emitir la factura: ${result.error || 'Error desconocido'}`,
          'assistant'
        );
      }
    } catch (error) {
      console.error('Error al confirmar factura:', error);
      addMessage(
        `Error inesperado: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'assistant'
      );
    }

    setChatState(prev => ({
      ...prev,
      conversationStage: 'completed',
      isProcessing: false,
      currentInvoiceData: {},
    }));
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || chatState.isProcessing) return;

    const message = inputMessage.trim();
    addMessage(message, 'user');
    setInputMessage('');

    if (chatState.conversationStage === 'confirming' &&
        (message.toLowerCase().includes('sí') || message.toLowerCase().includes('si') ||
         message.toLowerCase().includes('confirmo') || message.toLowerCase().includes('ok'))) {
      handleConfirmInvoice();
    } else if (chatState.conversationStage === 'completed') {
      setChatState(prev => ({
        ...prev,
        conversationStage: 'initial',
        currentInvoiceData: {},
      }));
      setLastInvoiceResult(null);
      processUserMessage(message);
    } else {
      processUserMessage(message);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setChatState({
      messages: [],
      isProcessing: false,
      currentInvoiceData: {},
      conversationStage: 'initial',
    });
    setLastInvoiceResult(null);
    setInputMessage('');
  };

  const handleCopyInvoice = () => {
    if (!lastInvoiceResult?.invoice) return;

    const inv = lastInvoiceResult.invoice;
    const text = `Factura ${inv.tipoComprobante}\nNúmero: ${inv.numero}\nFecha: ${inv.fecha}\nCliente: ${inv.cliente.nombre}\nDocumento: ${inv.cliente.tipoDocumento} ${inv.cliente.documento}\nImporte: $${inv.importe.toLocaleString('es-AR')}\nCAE: ${inv.cae}\nVencimiento CAE: ${inv.vencimientoCae}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#212121] text-white">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 flex items-center justify-center">
        <div className="max-w-3xl w-full">
          {chatState.messages.length === 0 && !chatState.isProcessing ? (
            <div className="flex flex-col items-center justify-center text-center space-y-8 -mt-32">
              <h1 className="text-4xl font-semibold text-white">Factura Fácil</h1>
              <p className="text-white text-base">
                Emití facturas con lenguaje natural.{' '}
                <button className="text-white underline hover:text-gray-200 transition-colors">Configuración</button>
              </p>
            </div>
          ) : (
            <div className="space-y-8 py-8">
              {chatState.messages.map((message) => (
                <div key={message.id} className="group">
                  <div className={`flex gap-4 items-start ${
                    message.type === 'user' ? 'justify-end' : 'justify-start'
                  }`}>
                    {message.type === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                        AI
                      </div>
                    )}
                    <div className={`flex-1 max-w-2xl ${
                      message.type === 'user' ? 'text-right' : ''
                    }`}>
                      <div className={`inline-block text-left rounded-2xl text-[15px] leading-7 ${
                        message.type === 'user'
                          ? 'bg-[#2f2f2f] text-white px-4 py-3'
                          : 'text-white px-1 py-2'
                      }`}>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                    {message.type === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm font-bold text-black">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {chatState.isProcessing && (
                <div className="group">
                  <div className="flex gap-4 items-start justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                      AI
                    </div>
                    <div className="flex-1 max-w-2xl">
                      <div className="inline-block text-left py-2 text-[15px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {lastInvoiceResult && lastInvoiceResult.success && lastInvoiceResult.invoice && (
                <div className="group">
                  <div className="flex gap-4 items-start justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                      AI
                    </div>
                    <div className="flex-1 max-w-2xl">
                      <div className="bg-[#2f2f2f] border border-gray-700 rounded-2xl p-6 shadow-xl">
                        <div className="flex items-center gap-2 mb-4">
                          <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-base font-semibold text-white">Resumen de Factura</h3>
                          {serverConnected === false && (
                            <span className="ml-auto text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full font-medium border border-amber-500/30">Demo</span>
                          )}
                        </div>

                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between items-center py-1">
                            <span className="text-white">Número:</span>
                            <span className="font-medium text-white">{lastInvoiceResult.invoice.numero}</span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-white">Fecha:</span>
                            <span className="font-medium text-white">{lastInvoiceResult.invoice.fecha}</span>
                          </div>
                          <div className="border-t border-gray-700 pt-3 mt-2">
                            <div className="flex justify-between items-center py-1">
                              <span className="text-white">Cliente:</span>
                              <span className="font-medium text-white">{lastInvoiceResult.invoice.cliente.nombre}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                              <span className="text-white">Documento:</span>
                              <span className="font-medium text-white">{lastInvoiceResult.invoice.cliente.tipoDocumento} {lastInvoiceResult.invoice.cliente.documento}</span>
                            </div>
                          </div>
                          <div className="border-t border-gray-700 pt-3 mt-2">
                            <div className="flex justify-between items-center py-1">
                              <span className="text-white">Importe:</span>
                              <span className="font-bold text-emerald-400 text-lg">${lastInvoiceResult.invoice.importe.toLocaleString('es-AR')}</span>
                            </div>
                          </div>
                          <div className="border-t border-gray-700 pt-3 mt-2 text-xs space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-white">CAE:</span>
                              <span className="font-mono text-white">{lastInvoiceResult.invoice.cae}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white">Vencimiento:</span>
                              <span className="text-white">{lastInvoiceResult.invoice.vencimientoCae}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-gray-700">
                          <button
                            onClick={handleCopyInvoice}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium"
                          >
                            {copiedToClipboard ? (
                              <>
                                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                                Copiado al portapapeles
                              </>
                            ) : (
                              <>
                                <DocumentDuplicateIcon className="w-4 h-4" />
                                Copiar resumen
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-[#2f2f2f] rounded-[26px] shadow-2xl border-2 border-[#424242] hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={handleClearChat}
                disabled={chatState.isProcessing}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-transparent hover:bg-[#424242] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-white hover:text-gray-200"
                title="Nueva conversación"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              <div className="flex-1 relative">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={chatState.conversationStage === 'confirming' ? "Escribí 'sí' o 'confirmo' para continuar" : "Pregunta lo que quieras"}
                  className="w-full resize-none bg-transparent border-none focus:outline-none text-white placeholder-gray-400 text-[16px] leading-6 max-h-48"
                  rows={1}
                  disabled={chatState.isProcessing}
                  style={{
                    minHeight: '24px',
                    height: 'auto',
                  }}
                />
              </div>

              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || chatState.isProcessing}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-white disabled:bg-gray-700 disabled:cursor-not-allowed transition-all flex items-center justify-center text-black hover:opacity-80"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {serverConnected !== null && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 text-xs">
                {serverConnected ? (
                  <>
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-white opacity-70">Conectado a AFIP</span>
                  </>
                ) : (
                  <>
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                    <span className="text-white opacity-70">Modo demo - Sin conexión a AFIP</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceChat;