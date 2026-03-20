const express = require('express');
const path = require('path');
const documentRoutes = require('./routes/documentRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Redirect root → login
app.get('/', (req, res) => res.redirect('/login.html'));

// Static files
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'DigiID Verify — Government ID Portal API is running',
        timestamp: new Date().toISOString(),
    });
});

// Gov ID Document API
app.use('/api/documents', documentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
