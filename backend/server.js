/**
 * 瑞昌藥局 人時生產力預警系統
 * Main Express Server
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const path = require('path');

async function startServer() {
  console.log('🚀 Starting server...');
  
  // Initialize database FIRST (sql.js is async)
  try {
    const dbModule = require('./database');
    const db = await dbModule();
    console.log('✅ Database initialized successfully');

    // Make db available to all routes via app.locals
    const app = express();
    app.locals.db = db;

  const PORT = process.env.PORT || 3000;
  const BASE_PATH = process.env.BASE_PATH || '';

  // =============================================
  // Middleware
  // =============================================
  app.use(cors());
  app.use(morgan('dev'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Serve static frontend files under base path
  if (BASE_PATH) {
    app.use(BASE_PATH, express.static(path.join(__dirname, '..', 'frontend')));
  } else {
    app.use(express.static(path.join(__dirname, '..', 'frontend')));
  }

  // =============================================
  // API Routes
  // =============================================
  const employeesRouter = require('./routes/employees');
  const storesRouter    = require('./routes/stores');
  const monthlyRouter   = require('./routes/monthly');
  const dashboardRouter = require('./routes/dashboard');
  const reportsRouter   = require('./routes/reports');

  const apiPrefix = BASE_PATH + '/api';
  app.use(apiPrefix + '/employees', employeesRouter);
  app.use(apiPrefix + '/stores',    storesRouter);
  app.use(apiPrefix + '/monthly',   monthlyRouter);
  app.use(apiPrefix + '/dashboard', dashboardRouter);
  app.use(apiPrefix + '/reports',   reportsRouter);

  // =============================================
  // Health check
  // =============================================
  app.get(apiPrefix + '/health', (req, res) => {
    res.json({
      success: true,
      message: '瑞昌藥局 人時生產力預警系統 正常運作中',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      basePath: BASE_PATH,
    });
  });

  // =============================================
  // Catch-all: serve frontend for any unknown route
  // =============================================
  if (BASE_PATH) {
    app.get(BASE_PATH + '*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
    });
  }
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });

  // =============================================
  // Error handling middleware
  // =============================================
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      message: '伺服器內部錯誤',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

    // =============================================
    // Start server
    // =============================================
    const server = app.listen(PORT, () => {
      console.log('================================================');
      console.log('  瑞昌藥局 人時生產力預警系統');
      console.log('  Ruichang Pharmacy Productivity Alert System');
      console.log('================================================');
      console.log(`  Server running at: http://localhost:${PORT}`);
      console.log(`  Base path: ${BASE_PATH || '/'}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('================================================');
    });

    return { app, server };
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Start server with proper error handling
startServer().catch(err => {
  console.error('💥 Failed to start server:', err);
  process.exit(1);
});
