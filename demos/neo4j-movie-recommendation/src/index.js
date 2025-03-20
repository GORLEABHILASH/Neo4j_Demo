import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { getDriver } from './neo4j.js';
import routes from './routes.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './utils/seed.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health and readiness checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Add this to index.js before the API routes
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Neo4j Movie Recommendation API</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          h1 { color: #333; }
          code { background-color: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>Neo4j Movie Recommendation API</h1>
        <p>Available endpoints:</p>
        <ul>
          <li><code>GET /api/genres</code> - Get all movie genres</li>
          <li><code>GET /api/movies/by-genre/:genre</code> - Get movies by genre</li>
          <li><code>GET /api/movies/:title</code> - Get movie details including cast</li>
          <li><code>GET /api/movies/:title/recommendations</code> - Get recommended movies</li>
          <li><code>GET /api/search?q=query</code> - Search movies by title</li>
        </ul>
      </body>
    </html>
  `);
});

app.get('/ready', async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();
    
    try {
      await session.run('RETURN 1');
      res.status(200).json({ status: 'READY', database: 'CONNECTED' });
    } finally {
      await session.close();
    }
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({ status: 'NOT READY', reason: 'Database connection failed' });
  }
});

// API routes
app.use('/api', routes);

// Serve static frontend files
app.use(express.static('public'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Start the server
app.listen(port, async () => {
  logger.info(`Server started on port ${port}`);
  
  // Check if database needs seeding
  try {
    const needsSeeding = await checkIfDatabaseNeedsSeeding();
    if (needsSeeding) {
      logger.info('Seeding database with initial data...');
      await seedDatabase();
      logger.info('Database seeded successfully');
    } else {
      logger.info('Database already contains data, skipping seeding');
    }
  } catch (error) {
    logger.error('Error checking/seeding database:', error);
  }
});

// Function to check if database needs seeding
async function checkIfDatabaseNeedsSeeding() {
  const driver = getDriver();
  const session = driver.session();
  
  try {
    const result = await session.run('MATCH (m:Movie) RETURN count(m) as count');
    const count = result.records[0].get('count');
    // Check if count is a number or a neo4j Integer and handle appropriately
    return typeof count === 'number' ? count === 0 : count.toNumber() === 0;
  } catch (error) {
    logger.error('Error checking if database needs seeding:', error);
    return false;
  } finally {
    await session.close();
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close Neo4j driver
  try {
    const driver = getDriver();
    await driver.close();
    logger.info('Neo4j driver closed');
  } catch (error) {
    logger.error('Error closing Neo4j driver:', error);
  }
  
  process.exit(0);
});

export default app;

//test