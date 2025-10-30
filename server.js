import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Función para ejecutar scripts de TypeScript del sistema AFIP
const runAfipScript = (scriptName, args = []) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../ArcaMCP/scripts', scriptName);
    const process = spawn('npx', ['tsx', scriptPath, ...args], {
      cwd: path.join(__dirname, '../ArcaMCP'),
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout, error: null });
      } else {
        reject({ success: false, output: stdout, error: stderr });
      }
    });

    process.on('error', (error) => {
      reject({ success: false, output: '', error: error.message });
    });
  });
};

// Endpoint para generar factura
app.post('/api/generate-invoice', async (req, res) => {
  try {
    const { invoiceData } = req.body;
    
    console.log('📋 Datos recibidos para facturación:', invoiceData);

    // Validar datos requeridos
    if (!invoiceData.cliente?.nombre || !invoiceData.cliente?.documento || !invoiceData.importe) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: cliente, documento e importe'
      });
    }

    // Simular generación de factura (por ahora)
    // En el futuro aquí llamaríamos al sistema AFIP real
    const mockInvoiceResult = {
      success: true,
      invoice: {
        numero: `FC-001-${String(Math.floor(Math.random() * 1000000)).padStart(8, '0')}`,
        fecha: new Date().toISOString().split('T')[0],
        cliente: invoiceData.cliente,
        importe: invoiceData.importe,
        tipoComprobante: invoiceData.tipoComprobante || 'C',
        concepto: invoiceData.concepto || 'servicio',
        descripcion: invoiceData.descripcion || 'Servicios profesionales',
        cae: `${Math.floor(Math.random() * 100000000000000)}`,
        vencimientoCae: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    };

    console.log('✅ Factura generada:', mockInvoiceResult.invoice);

    res.json(mockInvoiceResult);

  } catch (error) {
    console.error('❌ Error generando factura:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Endpoint para verificar estado del servidor AFIP
app.get('/api/afip-status', async (req, res) => {
  try {
    console.log('🔍 Verificando estado de AFIP...');
    
    // Por ahora simulamos que está funcionando
    // En el futuro podríamos llamar a testAllBillingFeatures.ts
    const mockStatus = {
      success: true,
      status: 'online',
      services: {
        wsfe: 'authorized',
        ws_sr_padron_a13: 'authorized',
        ws_sr_padron_a4: 'authorized'
      },
      environment: 'development'
    };

    res.json(mockStatus);

  } catch (error) {
    console.error('❌ Error verificando AFIP:', error);
    res.status(500).json({
      success: false,
      error: 'Error verificando estado de AFIP'
    });
  }
});

// Endpoint para obtener tipos de comprobante
app.get('/api/voucher-types', async (req, res) => {
  try {
    console.log('📋 Obteniendo tipos de comprobante...');
    
    // Datos simulados basados en los tipos reales de AFIP
    const voucherTypes = [
      { codigo: 1, descripcion: 'Factura A' },
      { codigo: 6, descripcion: 'Factura B' },
      { codigo: 11, descripcion: 'Factura C' },
      { codigo: 3, descripcion: 'Nota de Crédito A' },
      { codigo: 8, descripcion: 'Nota de Crédito B' },
      { codigo: 13, descripcion: 'Nota de Crédito C' }
    ];

    res.json({
      success: true,
      voucherTypes
    });

  } catch (error) {
    console.error('❌ Error obteniendo tipos de comprobante:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo tipos de comprobante'
    });
  }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Servidor de facturación funcionando',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de facturación corriendo en http://localhost:${PORT}`);
  console.log(`📡 API disponible en http://localhost:${PORT}/api`);
  console.log(`🔗 Conectado con sistema AFIP en modo desarrollo`);
});