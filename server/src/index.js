
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { initializeSchema } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');

// Route imports
const servicesRouter = require('./routes/services');
const countersRouter = require('./routes/counters');
const tokensRouter = require('./routes/tokens');
const analyticsRouter = require('./routes/analytics');
const announcementsRouter = require('./routes/announcements');
const authRoutes = require('./routes/auth');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}));

// Limit JSON request bodies to 100 KB
app.use(express.json({ limit: '100kb' }));

app.use(morgan('dev'));

// API routes
app.use('/api/services', servicesRouter);
app.use('/api/counters', countersRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// Centralized error handler
app.use(errorHandler);

function startServer() {
  initializeSchema();

  console.log('✅ Database initialized');

  const server = app.listen(PORT, () => {
    console.log(
      `🚀 QueueLess server running on http://localhost:${PORT}`
    );

    console.log(
      `Environment: ${process.env.NODE_ENV || 'development'}`
    );
  });

  return server;
}

// Only start if this is the main module.
if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
