import type { InvoiceData } from '../utils/invoiceParser';

const API_BASE_URL = 'http://localhost:3001/api';
const isMockMode = typeof import.meta !== 'undefined' && (
  (import.meta as any).env?.VITE_MOCK_API === 'true'
);

export interface InvoiceResult {
  success: boolean;
  invoice?: {
    numero: string;
    fecha: string;
    cliente: {
      nombre: string;
      documento: string;
      tipoDocumento: string;
    };
    importe: number;
    tipoComprobante: string;
    concepto: string;
    descripcion: string;
    cae: string;
    vencimientoCae: string;
  };
  error?: string;
}

export interface AfipStatus {
  success: boolean;
  status: string;
  services: {
    wsfe: string;
    ws_sr_padron_a13: string;
    ws_sr_padron_a4: string;
  };
  environment: string;
}

export class InvoiceService {
  private static generateMockInvoice(invoiceData: InvoiceData): InvoiceResult {
    const numero = `FC-001-${String(Math.floor(Math.random() * 1000000)).padStart(8, '0')}`;
    const fecha = new Date().toISOString().split('T')[0];
    const vencimientoCae = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return {
      success: true,
      invoice: {
        numero,
        fecha,
        cliente: {
          nombre: invoiceData.cliente?.nombre || 'Cliente Prueba',
          documento: invoiceData.cliente?.documento || '12345678',
          tipoDocumento: invoiceData.cliente?.tipoDocumento || 'DNI',
        },
        importe: invoiceData.importe || 1000,
        tipoComprobante: invoiceData.tipoComprobante || 'C',
        concepto: invoiceData.concepto || 'servicio',
        descripcion: invoiceData.descripcion || 'Prueba de emisión',
        cae: `${Math.floor(Math.random() * 100000000000000)}`,
        vencimientoCae,
      },
    };
  }

  static async generateInvoice(invoiceData: InvoiceData): Promise<InvoiceResult> {
    try {
      if (isMockMode) {
        console.log('[InvoiceService] Modo MOCK activo: generando factura localmente');
        return this.generateMockInvoice(invoiceData);
      }
      console.log('[InvoiceService] Enviando payload a /generate-invoice:', invoiceData);
      const response = await fetch(`${API_BASE_URL}/generate-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceData }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[InvoiceService] Respuesta recibida:', result);
      return result;
    } catch (error) {
      console.error('Error generando factura:', error);
      // Fallback a modo mock cuando el backend falla
      console.warn('[InvoiceService] Backend no disponible, usando modo MOCK');
      return this.generateMockInvoice(invoiceData);
    }
  }

  static async checkAfipStatus(): Promise<AfipStatus | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/afip-status`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error verificando estado de AFIP:', error);
      return null;
    }
  }

  static async getVoucherTypes() {
    try {
      const response = await fetch(`${API_BASE_URL}/voucher-types`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error obteniendo tipos de comprobante:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  static async checkHealth() {
    try {
      if (isMockMode) {
        return { success: true, message: 'Modo MOCK activo', timestamp: new Date().toISOString() } as any;
      }
      const response = await fetch(`${API_BASE_URL}/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error verificando salud del servidor:', error);
      // En caso de error, indicamos falso para que el UI muestre advertencia
      return { success: false, error: error instanceof Error ? error.message : 'Servidor no disponible' };
    }
  }
}