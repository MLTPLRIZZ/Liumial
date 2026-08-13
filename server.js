const express = require('express');
const path = require('path');

const app = express();

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for single-page application routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Use Render's dynamic PORT environment variable
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
