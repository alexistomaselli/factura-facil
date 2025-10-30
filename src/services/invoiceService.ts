import type { InvoiceData } from '../utils/invoiceParser';

const API_BASE_URL = 'http://localhost:3001/api';

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
  static async generateInvoice(invoiceData: InvoiceData): Promise<InvoiceResult> {
    try {
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
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
      const response = await fetch(`${API_BASE_URL}/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error verificando salud del servidor:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Servidor no disponible' };
    }
  }
}