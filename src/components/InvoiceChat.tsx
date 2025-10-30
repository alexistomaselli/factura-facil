import React, { useState, useRef, useEffect } from 'react';
import { 
  PaperAirplaneIcon, 
  DocumentTextIcon, 
  WifiIcon,
  SignalSlashIcon
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
        content: '¡Hola! Soy tu asistente de facturación. Puedes decirme algo como: "Quiero facturarle a Juan Pérez DNI 12345678 el importe $50000 con factura C por servicios de consultoría"',
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatState.messages]);

  useEffect(() => {
    // Verificar conexión del servidor al cargar
    const checkServerConnection = async () => {
      const health = await InvoiceService.checkHealth();
      setServerConnected(health.success);
      
      if (!health.success) {
        addMessage(
          '⚠️ No se pudo conectar con el servidor de facturación. Asegúrate de que esté ejecutándose en el puerto 3001.',
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

      // Si el usuario pide "prueba", completar los faltantes con defaults seguros
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
          descripcion: data.descripcion || 'Prueba de emisión',
        };
      }

      // Si se tienen los datos mínimos, generar directamente
      const hasMinimum = !!(data.cliente?.nombre && data.cliente.documento && data.importe);

      if (hasMinimum) {
        addMessage('🔄 Generando factura en AFIP...', 'assistant');
        // Guardar en estado y confirmar
        setChatState(prev => ({ ...prev, currentInvoiceData: data }));
        await handleConfirmInvoice(data);
      } else {
        // Faltan datos: pedirlos con preguntas amigables
        const missing = parseResult.missingFields;
        const questions = missing.length > 0 ? InvoiceParser.generateQuestions(missing) : [];
        const summaryParts = [
          data.cliente?.nombre ? `👤 Cliente: ${data.cliente.nombre}` : null,
          data.cliente?.documento ? `🆔 Documento: ${data.cliente.documento}` : null,
          data.importe ? `💰 Importe: $${data.importe}` : null,
          data.tipoComprobante ? `📄 Tipo: ${data.tipoComprobante}` : null,
          data.concepto ? `📋 Concepto: ${data.concepto}` : null,
        ].filter(Boolean);

        const summary = summaryParts.length ? `\n${summaryParts.join('\n')}` : '';
        addMessage(
          `Perfecto. Para poder emitir la factura necesito algunos datos.${summary}\n\n${questions[0] || '¿Cuál es el nombre del cliente?'}`,
          'assistant'
        );
        setChatState(prev => ({ ...prev, conversationStage: 'collecting', isProcessing: false }));
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
    
    try {
      // Si el servidor no está disponible, informar pero continuar en modo demo
      if (serverConnected === false) {
        addMessage(
          'ℹ️ El servidor no está disponible. Continuaré en modo demo (MOCK).',
          'assistant'
        );
      }

      addMessage('🔄 Generando factura en AFIP...', 'assistant');
      const payload = dataOverride ?? chatState.currentInvoiceData;
      console.log('Confirming invoice with payload:', payload);
      const result: InvoiceResult = await InvoiceService.generateInvoice(payload);
      
      if (result.success && result.invoice) {
        addMessage(
          `✅ ¡Factura generada exitosamente en AFIP!\n\n` +
          `📄 **Número:** ${result.invoice.numero}\n` +
          `📅 **Fecha:** ${result.invoice.fecha}\n` +
          `👤 **Cliente:** ${result.invoice.cliente.nombre} (${result.invoice.cliente.tipoDocumento}: ${result.invoice.cliente.documento})\n` +
          `💰 **Importe:** $${result.invoice.importe.toLocaleString('es-AR')}\n` +
          `📋 **Concepto:** ${result.invoice.concepto}\n` +
          `📝 **Descripción:** ${result.invoice.descripcion}\n` +
          `🔐 **CAE:** ${result.invoice.cae}\n` +
          `⏰ **Vencimiento CAE:** ${result.invoice.vencimientoCae}\n\n` +
          `La factura ha sido registrada oficialmente en AFIP.`,
          'assistant'
        );
      } else {
        addMessage(
          `❌ Error al generar la factura: ${result.error || 'Error desconocido'}\n\n` +
          `Por favor, verifica los datos e intenta nuevamente.`,
          'assistant'
        );
      }
    } catch (error) {
      console.error('Error al confirmar factura:', error);
      addMessage(
        `❌ Error inesperado al generar la factura: ${error instanceof Error ? error.message : 'Error desconocido'}\n\n` +
        `Por favor, intenta nuevamente.`,
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
    console.log('handleSendMessage called');
    console.log('inputMessage:', inputMessage);
    console.log('chatState.isProcessing:', chatState.isProcessing);
    
    if (!inputMessage.trim() || chatState.isProcessing) {
      console.log('Returning early - empty message or processing');
      return;
    }

    const message = inputMessage.trim();
    console.log('Processing message:', message);
    
    addMessage(message, 'user');
    setInputMessage('');

    if (chatState.conversationStage === 'confirming' && 
        (message.toLowerCase().includes('sí') || message.toLowerCase().includes('si') || 
         message.toLowerCase().includes('confirmo') || message.toLowerCase().includes('ok'))) {
      handleConfirmInvoice();
    } else if (chatState.conversationStage === 'completed') {
      // Reiniciar conversación
      setChatState(prev => ({ 
        ...prev, 
        conversationStage: 'initial',
        currentInvoiceData: {},
      }));
      processUserMessage(message);
    } else {
      processUserMessage(message);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    console.log('Key pressed:', e.key);
    if (e.key === 'Enter' && !e.shiftKey) {
      console.log('Enter pressed, preventing default and sending message');
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
              <DocumentTextIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Facturación AFIP
              </h1>
              <p className="text-sm text-gray-600">
                Genera facturas con lenguaje natural
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {serverConnected === null ? (
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-lg border">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-xs text-gray-600">Conectando...</span>
              </div>
            ) : serverConnected ? (
              <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-lg border border-green-200">
                <WifiIcon className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-green-700">AFIP Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 px-3 py-1 rounded-lg border border-red-200">
                <SignalSlashIcon className="w-4 h-4 text-red-600" />
                <span className="text-xs font-medium text-red-700">Sin conexión</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
          {chatState.messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start gap-3 max-w-lg ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  message.type === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-600 text-white'
                }`}>
                  {message.type === 'user' ? 'TÚ' : 'IA'}
                </div>
                
                {/* Message bubble */}
                <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}>
                  {/* Message content */}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>
                  
                  {/* Timestamp */}
                  <div className={`text-xs mt-2 ${
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
              <div className="flex items-start gap-3 max-w-lg">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs font-semibold">
                  IA
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                    <span className="text-sm text-gray-700">Procesando...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Escribe tu solicitud de facturación... Ej: 'Factura para Juan Pérez por $50.000'"
                className="w-full resize-none border border-gray-300 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-500 bg-white"
                rows={2}
                disabled={chatState.isProcessing}
              />
              <div className="absolute bottom-3 right-3 text-xs text-gray-400">
                {inputMessage.length}/500
              </div>
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || chatState.isProcessing}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          
          {/* Quick suggestions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button 
              onClick={() => setInputMessage("Factura tipo B para María García por $25.000")}
              className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
            >
              💼 Factura B ejemplo
            </button>
            <button 
              onClick={() => setInputMessage("Generar factura A para empresa con CUIT 20-12345678-9 por $100.000")}
              className="text-xs bg-green-50 text-green-700 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
            >
              🏢 Factura A empresa
            </button>
            <button 
              onClick={() => setInputMessage("Factura de servicios profesionales por $75.000")}
              className="text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200"
            >
              ⚡ Servicios profesionales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceChat;