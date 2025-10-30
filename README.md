# Factura Chat (Vite + React + Tailwind)

Frontend minimalista para generar facturas con lenguaje natural.

## Ejecutar localmente

- `npm install`
- `npm run dev` → `http://localhost:5173/`
- Opcional (API mock Express): `npm run server` → `http://localhost:3001/`

## Modo demo (MOCK) para Bolt

Este proyecto puede funcionar sin backend usando un modo demo:

- Crea un archivo `.env` en la raíz con:

```
VITE_MOCK_API=true
```

- Inicia el dev server: `npm run dev`
- El chat generará una “Factura C de prueba” localmente si el backend no está disponible.
- Verás en la consola del navegador logs como:
  - `[InvoiceService] Modo MOCK activo: generando factura localmente`
  - `Confirming invoice with payload: ...`

## Usar backend (opcional)

- Arranca el servidor: `npm run server` (puerto `3001`)
- Quita el modo mock: define `VITE_MOCK_API=false` (o elimina la variable del `.env`)
- El frontend llamará a los endpoints:
  - `POST /api/generate-invoice`
  - `GET /api/health`

## Scripts

- `dev`: corre Vite con React y Tailwind.
- `server`: Express para endpoints simulados.
- `build` / `preview`: build y previsualización del frontend.

## Notas

- No se requiere MCP ni certificados para el modo demo.
- En producción, conecta con tu backend y elimina `VITE_MOCK_API`.
