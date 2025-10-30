export interface InvoiceData {
  cliente?: {
    nombre?: string;
    documento?: string;
    tipoDocumento?: 'DNI' | 'CUIT';
  };
  importe?: number;
  tipoComprobante?: 'A' | 'B' | 'C';
  concepto?: 'producto' | 'servicio' | 'productos_servicios';
  descripcion?: string;
}

export interface ParseResult {
  data: InvoiceData;
  missingFields: string[];
  confidence: number;
}

export class InvoiceParser {
  private static readonly PATTERNS = {
    // Patrones para nombres
    cliente: [
      /(?:facturar(?:le)?|cliente|para)\s+(?:a\s+)?([A-Za-zÀ-ÿ\s]+?)(?:\s+(?:dni|cuit|el\s+importe|\d))/i,
      /(?:cliente|para|a)\s+([A-Za-zÀ-ÿ\s]+?)(?:\s+(?:dni|cuit|por|\d))/i,
    ],
    
    // Patrones para documentos
    dni: /dni\s*:?\s*(\d{7,8})/i,
    cuit: /cuit\s*:?\s*(\d{11}|\d{2}-\d{8}-\d{1})/i,
    
    // Patrones para importes
    importe: [
      /(?:importe|por|precio|total|monto)\s*:?\s*\$?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i,
      /\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i,
      /(\d+(?:\.\d{3})*(?:,\d{2})?)\s*(?:pesos|ars|\$)/i,
    ],
    
    // Patrones para tipos de comprobante
    tipoComprobante: {
      A: /factura\s*a/i,
      B: /factura\s*b/i,
      C: /factura\s*c/i,
    },
    
    // Patrones para conceptos
    concepto: {
      producto: /producto(?:s)?/i,
      servicio: /servicio(?:s)?|consultoría|asesoría/i,
      productos_servicios: /productos?\s+y\s+servicios?/i,
    },
  };

  static parse(text: string): ParseResult {
    const data: InvoiceData = {};
    const missingFields: string[] = [];
    let confidence = 0;

    // Extraer cliente
    for (const pattern of this.PATTERNS.cliente) {
      const match = text.match(pattern);
      if (match) {
        data.cliente = { nombre: match[1].trim() };
        confidence += 20;
        break;
      }
    }

    // Extraer documento
    const dniMatch = text.match(this.PATTERNS.dni);
    const cuitMatch = text.match(this.PATTERNS.cuit);
    
    if (dniMatch) {
      if (!data.cliente) data.cliente = {};
      data.cliente.documento = dniMatch[1];
      data.cliente.tipoDocumento = 'DNI';
      confidence += 15;
    } else if (cuitMatch) {
      if (!data.cliente) data.cliente = {};
      data.cliente.documento = cuitMatch[1].replace(/-/g, '');
      data.cliente.tipoDocumento = 'CUIT';
      confidence += 15;
    }

    // Extraer importe
    for (const pattern of this.PATTERNS.importe) {
      const match = text.match(pattern);
      if (match) {
        const importeStr = match[1].replace(/\./g, '').replace(',', '.');
        data.importe = parseFloat(importeStr);
        confidence += 25;
        break;
      }
    }

    // Extraer tipo de comprobante
    for (const [tipo, pattern] of Object.entries(this.PATTERNS.tipoComprobante)) {
      if (pattern.test(text)) {
        data.tipoComprobante = tipo as 'A' | 'B' | 'C';
        confidence += 20;
        break;
      }
    }

    // Extraer concepto
    for (const [concepto, pattern] of Object.entries(this.PATTERNS.concepto)) {
      if (pattern.test(text)) {
        data.concepto = concepto as 'producto' | 'servicio' | 'productos_servicios';
        confidence += 10;
        break;
      }
    }

    // Extraer descripción (texto restante)
    const descripcionMatch = text.match(/(?:por|de)\s+(.+?)(?:\s+(?:dni|cuit|importe|\$)|$)/i);
    if (descripcionMatch) {
      data.descripcion = descripcionMatch[1].trim();
      confidence += 10;
    }

    // Determinar campos faltantes
    if (!data.cliente?.nombre) missingFields.push('nombre del cliente');
    if (!data.cliente?.documento) missingFields.push('documento del cliente');
    if (!data.cliente?.tipoDocumento) missingFields.push('tipo de documento');
    if (!data.importe) missingFields.push('importe');
    if (!data.tipoComprobante) missingFields.push('tipo de comprobante');
    if (!data.concepto) missingFields.push('concepto');

    return {
      data,
      missingFields,
      confidence: Math.min(confidence, 100),
    };
  }

  static generateQuestions(missingFields: string[]): string[] {
    const questions: { [key: string]: string } = {
      'nombre del cliente': '¿Cuál es el nombre del cliente?',
      'documento del cliente': '¿Cuál es el número de documento del cliente?',
      'tipo de documento': '¿Es DNI o CUIT?',
      'importe': '¿Cuál es el importe a facturar?',
      'tipo de comprobante': '¿Qué tipo de factura necesitas? (A, B o C)',
      'concepto': '¿Es por productos, servicios o ambos?',
    };

    return missingFields.map(field => questions[field] || `¿Podrías proporcionar ${field}?`);
  }
}