import React, { useState, useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  DocumentTextIcon,
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
    messages: [
      {
        id: '1',
        type: 'assistant',
        content: 'Hola, decime qué querés facturar y a quién. Por ejemplo: "Factura C de prueba por $1000 para Juan Pérez"',
        timestamp: new Date(),
      }
    ],
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
      messages: [
        {
          id: '1',
          type: 'assistant',
          content: 'Hola, decime qué querés facturar y a quién. Por ejemplo: "Factura C de prueba por $1000 para Juan Pérez"',
          timestamp: new Date(),
        }
      ],
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
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white bg-opacity-20 p-2 rounded-xl">
              <DocumentTextIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                Factura Fácil
              </h1>
              <p className="text-sm text-blue-100">
                Emisión por chat
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {serverConnected === null ? (
              <div className="flex items-center gap-2 bg-white bg-opacity-20 px-3 py-1.5 rounded-lg">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-white font-medium">Conectando...</span>
              </div>
            ) : serverConnected ? (
              <div className="flex items-center gap-2 bg-green-500 bg-opacity-20 px-3 py-1.5 rounded-lg border border-green-300 border-opacity-30">
                <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-white">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-yellow-500 bg-opacity-20 px-3 py-1.5 rounded-lg border border-yellow-300 border-opacity-30">
                <div className="w-2 h-2 bg-yellow-300 rounded-full"></div>
                <span className="text-xs font-medium text-white">Demo</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-3xl mx-auto space-y-4">
          {chatState.messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start gap-2.5 max-w-xl ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-600 border-2 border-blue-600'
                }`}>
                  {message.type === 'user' ? 'TÚ' : 'AI'}
                </div>

                <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
                }`}>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>

                  <div className={`text-xs mt-1.5 ${
                    message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {message.timestamp.toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {chatState.isProcessing && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2.5 max-w-xl">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white text-blue-600 border-2 border-blue-600 flex items-center justify-center text-xs font-bold shadow-sm">
                  AI
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-200 rounded-tl-none">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {lastInvoiceResult && lastInvoiceResult.success && lastInvoiceResult.invoice && (
            <div className="flex justify-center">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-md p-5 max-w-lg w-full">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-600" />
                  <h3 className="text-base font-bold text-green-900">Resumen de Factura</h3>
                  {serverConnected === false && (
                    <span className="ml-auto text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">Demo</span>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Número:</span>
                    <span className="font-semibold text-gray-900">{lastInvoiceResult.invoice.numero}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fecha:</span>
                    <span className="font-semibold text-gray-900">{lastInvoiceResult.invoice.fecha}</span>
                  </div>
                  <div className="border-t border-green-200 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cliente:</span>
                      <span className="font-semibold text-gray-900">{lastInvoiceResult.invoice.cliente.nombre}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Documento:</span>
                      <span className="font-semibold text-gray-900">{lastInvoiceResult.invoice.cliente.tipoDocumento} {lastInvoiceResult.invoice.cliente.documento}</span>
                    </div>
                  </div>
                  <div className="border-t border-green-200 pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Importe:</span>
                      <span className="font-bold text-green-700 text-lg">${lastInvoiceResult.invoice.importe.toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                  <div className="border-t border-green-200 pt-2 mt-2 text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>CAE:</span>
                      <span className="font-mono">{lastInvoiceResult.invoice.cae}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vencimiento:</span>
                      <span>{lastInvoiceResult.invoice.vencimientoCae}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleCopyInvoice}
                    className="flex-1 flex items-center justify-center gap-2 bg-white border border-green-300 text-green-700 px-4 py-2 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium shadow-sm"
                  >
                    {copiedToClipboard ? (
                      <>
                        <ClipboardDocumentCheckIcon className="w-4 h-4" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <DocumentDuplicateIcon className="w-4 h-4" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={chatState.conversationStage === 'confirming' ? "Escribí 'sí' o 'confirmo' para continuar" : "Ejemplo: 'Factura C de prueba por $1000 para Juan Pérez'"}
                className="w-full resize-none border-2 border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400 bg-white"
                rows={1}
                disabled={chatState.isProcessing}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || chatState.isProcessing}
              className="bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-medium text-sm flex items-center gap-2"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              Enviar
            </button>
            <button
              onClick={handleClearChat}
              disabled={chatState.isProcessing}
              className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-gray-300 font-medium text-sm"
            >
              Limpiar
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">Prueba:</span>
            <button
              onClick={() => setInputMessage("Factura C de prueba por $1000")}
              className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 font-medium"
            >
              Factura C por $1000
            </button>
            <button
              onClick={() => setInputMessage("Factura B para María García DNI 30123456 por $25000")}
              className="text-xs bg-teal-50 text-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors border border-teal-200 font-medium"
            >
              Factura B con cliente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceChat;