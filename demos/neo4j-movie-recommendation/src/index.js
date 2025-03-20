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
// Replace the existing app.get('/') route with this code
import { runQuery } from './neo4j.js';

// Add this function to fetch data for the dashboard
async function getDashboardData() {
  try {
    // Get genre counts
    const genreResult = await runQuery(`
      MATCH (g:Genre)<-[:IN_GENRE]-(m:Movie)
      RETURN g.name AS genre, COUNT(m) AS movieCount
      ORDER BY movieCount DESC
      LIMIT 6
    `);
    
    const genres = genreResult.records.map(record => ({
      name: record.get('genre'),
      count: record.get('movieCount').toNumber()
    }));
    
    // Get latest movies
    const latestMoviesResult = await runQuery(`
      MATCH (m:Movie)
      RETURN m.title AS title, m.released AS released, m.poster_image AS posterImage, m.tagline AS tagline
      ORDER BY m.released DESC
      LIMIT 6
    `);
    
    const latestMovies = latestMoviesResult.records.map(record => ({
      title: record.get('title'),
      released: record.get('released'),
      posterImage: record.get('posterImage'),
      tagline: record.get('tagline')
    }));
    
    // Get actor counts
    const actorResult = await runQuery(`
      MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
      WITH p, COUNT(m) AS movieCount
      RETURN p.name AS name, p.profile_image AS profileImage, movieCount
      ORDER BY movieCount DESC
      LIMIT 6
    `);
    
    const topActors = actorResult.records.map(record => ({
      name: record.get('name'),
      profileImage: record.get('profileImage'),
      movieCount: record.get('movieCount').toNumber()
    }));
    
    // Get total counts for dashboard stats
    const countResult = await runQuery(`
      MATCH (m:Movie)
      WITH COUNT(m) AS movieCount
      MATCH (p:Person)
      WITH movieCount, COUNT(p) AS personCount
      MATCH (g:Genre)
      RETURN movieCount, personCount, COUNT(g) AS genreCount
    `);
    
    const counts = {
      movies: countResult.records[0].get('movieCount').toNumber(),
      people: countResult.records[0].get('personCount').toNumber(),
      genres: countResult.records[0].get('genreCount').toNumber()
    };
    
    return {
      genres,
      latestMovies,
      topActors,
      counts
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      genres: [],
      latestMovies: [],
      topActors: [],
      counts: { movies: 0, people: 0, genres: 0 }
    };
  }
}

// Update the route handler for the landing page
// Replace the existing app.get('/') route with this code
// Make sure to place this code correctly in your index.js file

// Add this function to fetch data for the dashboard
async function getDashboardData() {
  try {
    // First, let's check if we have data in the database
    const checkData = await runQuery(`
      MATCH (n) RETURN count(n) as nodeCount
    `);
    
    const nodeCount = checkData.records[0].get('nodeCount').toNumber();
    
    // If no data, call seedDatabase
    if (nodeCount === 0) {
      logger.info('No data found in the database, triggering seed function...');
      try {
        const { seedDatabase } = await import('./utils/seed.js');
        await seedDatabase();
        logger.info('Database seeded successfully from dashboard');
      } catch (error) {
        logger.error('Error seeding database from dashboard:', error);
      }
    }
    
    // Get genre counts - with better error handling and default values
    let genres = [];
    try {
      const genreResult = await runQuery(`
        MATCH (g:Genre)<-[:IN_GENRE]-(m:Movie)
        RETURN g.name AS genre, COUNT(m) AS movieCount
        ORDER BY movieCount DESC
        LIMIT 6
      `);
      
      genres = genreResult.records.map(record => ({
        name: record.get('genre'),
        count: record.get('movieCount').toNumber()
      }));
    } catch (error) {
      logger.error('Error fetching genre data:', error);
    }
    
    // Get latest movies - with better error handling
    let latestMovies = [];
    try {
      const latestMoviesResult = await runQuery(`
        MATCH (m:Movie)
        RETURN m.title AS title, m.released AS released, m.poster_image AS posterImage, m.tagline AS tagline
        ORDER BY m.released DESC
        LIMIT 6
      `);
      
      latestMovies = latestMoviesResult.records.map(record => ({
        title: record.get('title'),
        released: record.get('released'),
        posterImage: record.get('posterImage'),
        tagline: record.get('tagline')
      }));
    } catch (error) {
      logger.error('Error fetching latest movies:', error);
    }
    
    // Get actor counts - with better error handling
    let topActors = [];
    try {
      const actorResult = await runQuery(`
        MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
        WITH p, COUNT(m) AS movieCount
        RETURN p.name AS name, p.profile_image AS profileImage, movieCount
        ORDER BY movieCount DESC
        LIMIT 6
      `);
      
      topActors = actorResult.records.map(record => ({
        name: record.get('name'),
        profileImage: record.get('profileImage'),
        movieCount: record.get('movieCount').toNumber()
      }));
    } catch (error) {
      logger.error('Error fetching actor data:', error);
    }
    
    // Get total counts separately for better error handling
    let counts = { movies: 0, people: 0, genres: 0 };
    
    try {
      const movieCountResult = await runQuery('MATCH (m:Movie) RETURN COUNT(m) AS count');
      counts.movies = movieCountResult.records[0].get('count').toNumber();
    } catch (error) {
      logger.error('Error counting movies:', error);
    }
    
    try {
      const peopleCountResult = await runQuery('MATCH (p:Person) RETURN COUNT(p) AS count');
      counts.people = peopleCountResult.records[0].get('count').toNumber();
    } catch (error) {
      logger.error('Error counting people:', error);
    }
    
    try {
      const genreCountResult = await runQuery('MATCH (g:Genre) RETURN COUNT(g) AS count');
      counts.genres = genreCountResult.records[0].get('count').toNumber();
    } catch (error) {
      logger.error('Error counting genres:', error);
    }
    
    return {
      genres,
      latestMovies,
      topActors,
      counts
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      genres: [],
      latestMovies: [],
      topActors: [],
      counts: { movies: 0, people: 0, genres: 0 }
    };
  }
}

// Update the route handler for the landing page
app.get('/', async (req, res) => {
  try {
    // Import required modules
    const { logger } = await import('./utils/logger.js');
    const dashboardData = await getDashboardData();
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Neo4j Movie Recommendation Dashboard</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css">
        <style>
          :root {
            --neo4j-green: #018BFF;
            --neo4j-dark: #2A2C34;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            color: #333;
            padding-bottom: 2rem;
          }
          .navbar {
            background-color: var(--neo4j-dark);
          }
          .logo {
            font-size: 1.8rem;
            font-weight: bold;
            color: white;
          }
          .logo span {
            color: var(--neo4j-green);
          }
          .header-container {
            background-color: var(--neo4j-dark);
            color: white;
            padding: 2rem 0;
            margin-bottom: 2rem;
          }
          .stat-card {
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
            height: 100%;
          }
          .stat-card:hover {
            transform: translateY(-5px);
          }
          .card-header {
            border-radius: 10px 10px 0 0 !important;
            font-weight: bold;
          }
          .genre-badge {
            background-color: var(--neo4j-green);
            font-size: 0.9em;
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .movie-card, .actor-card {
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
            height: 100%;
          }
          .movie-card:hover, .actor-card:hover {
            transform: translateY(-5px);
          }
          .movie-poster {
            height: 250px;
            object-fit: cover;
            border-radius: 10px 10px 0 0;
          }
          .api-section {
            background-color: #f0f0f0;
            border-radius: 10px;
            padding: 1.5rem;
            margin-top: 2rem;
          }
          .stat-icon {
            font-size: 2.5rem;
            color: var(--neo4j-green);
          }
          .profile-image {
            width: 70px;
            height: 70px;
            object-fit: cover;
            border-radius: 50%;
          }
        </style>
      </head>
      <body>
        <!-- Navbar with Neo4j branding -->
        <nav class="navbar navbar-expand-lg navbar-dark">
          <div class="container">
            <span class="logo"><span>Neo4j</span> Movie Graph</span>
          </div>
        </nav>
        
        <!-- Header with dashboard overview -->
                  <div class="header-container">
          <div class="container">
            <div class="row align-items-center">
              <div class="col-md-8">
                <h1>Movie Recommendation Engine</h1>
                <p class="lead">Powered by Neo4j Graph Database</p>
                <p>Explore relationships between movies, actors, and genres with graph-based recommendations</p>
                
                <!-- Search Form -->
                <div class="mt-4">
                  <form action="/api/search" method="GET" class="d-flex">
                    <input type="text" name="q" class="form-control" placeholder="Search for a movie..." required>
                    <button type="submit" class="btn btn-light ms-2">
                      <i class="bi bi-search"></i> Search
                    </button>
                  </form>
                </div>
              </div>
              <div class="col-md-4 text-center">
                <img src="https://dist.neo4j.com/wp-content/uploads/20210423072633/neo4j-logo-2020-1.svg" alt="Neo4j Logo" style="max-width: 200px;">
              </div>
            </div>
          </div>
        </div>
        
        <!-- Dashboard Stats -->
        <div class="container mb-5">
          <h2 class="mb-4">Database Overview</h2>
          <div class="row">
            <div class="col-md-4 mb-4">
              <div class="card stat-card">
                <div class="card-body text-center">
                  <i class="bi bi-film stat-icon mb-3"></i>
                  <h3>${dashboardData.counts.movies}</h3>
                  <h5>Movies</h5>
                </div>
              </div>
            </div>
            <div class="col-md-4 mb-4">
              <div class="card stat-card">
                <div class="card-body text-center">
                  <i class="bi bi-people stat-icon mb-3"></i>
                  <h3>${dashboardData.counts.people}</h3>
                  <h5>People</h5>
                </div>
              </div>
            </div>
            <div class="col-md-4 mb-4">
              <div class="card stat-card">
                <div class="card-body text-center">
                  <i class="bi bi-tags stat-icon mb-3"></i>
                  <h3>${dashboardData.counts.genres}</h3>
                  <h5>Genres</h5>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Latest Movies -->
        <div class="container mb-5">
          <h2 class="mb-4">Latest Movies</h2>
          <div class="row">
            ${dashboardData.latestMovies.map(movie => `
              <div class="col-md-4 mb-4">
                <div class="card movie-card">
                  <img src="${movie.posterImage || 'https://via.placeholder.com/350x250?text=No+Image'}" 
                       class="movie-poster" alt="${movie.title}">
                  <div class="card-body">
                    <h5 class="card-title">${movie.title}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">${movie.released}</h6>
                    <p class="card-text">${movie.tagline || 'No tagline available'}</p>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Popular Genres -->
        <div class="container mb-5">
          <h2 class="mb-4">Popular Genres</h2>
          <div class="row">
            ${dashboardData.genres.map(genre => `
              <div class="col-md-4 mb-4">
                <div class="card stat-card">
                  <div class="card-header bg-light">
                    ${genre.name}
                  </div>
                  <div class="card-body text-center">
                    <h4 class="card-title">${genre.count}</h4>
                    <p class="card-text">Movies in this genre</p>
                    <a href="/api/movies/by-genre/${genre.name}" class="btn btn-sm btn-outline-primary">View Movies</a>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Top Actors -->
        <div class="container mb-5">
          <h2 class="mb-4">Featured Actors</h2>
          <div class="row">
            ${dashboardData.topActors.map(actor => `
              <div class="col-md-4 mb-4">
                <div class="card actor-card">
                  <div class="card-body d-flex align-items-center">
                    <div class="me-3">
                      <img src="${actor.profileImage || 'https://via.placeholder.com/70x70?text=No+Image'}" 
                           class="profile-image" alt="${actor.name}">
                    </div>
                    <div>
                      <h5 class="card-title">${actor.name}</h5>
                      <p class="card-text">${actor.movieCount} ${actor.movieCount === 1 ? 'movie' : 'movies'} in database</p>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Graph Visualization -->
        <div class="container mb-5">
          <h2 class="mb-4">Graph Visualization</h2>
          <div class="card">
            <div class="card-body">
              <div class="text-center mb-3">
                <img src="https://dist.neo4j.com/wp-content/uploads/20231106123052/graph-visualization.png" 
                     alt="Neo4j Graph Visualization" 
                     style="max-width: 100%; height: auto; border-radius: 8px;">
              </div>
              <h5 class="text-center">Neo4j Movie Database Schema</h5>
              <p class="text-center">This graph shows how movies, actors, and genres are connected in our database.</p>
              <div class="row mt-3">
                <div class="col-md-4">
                  <div class="card bg-light">
                    <div class="card-body text-center">
                      <i class="bi bi-film text-primary mb-2" style="font-size: 1.5rem;"></i>
                      <h6>Movie Nodes</h6>
                      <p class="small mb-0">Contain title, release year, and tagline</p>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card bg-light">
                    <div class="card-body text-center">
                      <i class="bi bi-people text-success mb-2" style="font-size: 1.5rem;"></i>
                      <h6>Person Nodes</h6>
                      <p class="small mb-0">Actors who starred in movies</p>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card bg-light">
                    <div class="card-body text-center">
                      <i class="bi bi-tags text-danger mb-2" style="font-size: 1.5rem;"></i>
                      <h6>Genre Nodes</h6>
                      <p class="small mb-0">Categories that classify movies</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- API Reference -->
        <div class="container">
          <div class="api-section">
            <h2 class="mb-4">API Reference</h2>
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-body">
                    <h5><code>GET /api/genres</code></h5>
                    <p class="mb-0">Get all movie genres</p>
                    <a href="/api/genres" class="btn btn-sm btn-outline-primary mt-2">Try it</a>
                  </div>
                </div>
                <div class="card mb-3">
                  <div class="card-body">
                    <h5><code>GET /api/movies/by-genre/:genre</code></h5>
                    <p class="mb-0">Get movies by genre</p>
                    <div class="mt-2">
                      <a href="/api/movies/by-genre/Action" class="btn btn-sm btn-outline-primary">Action</a>
                      <a href="/api/movies/by-genre/Science%20Fiction" class="btn btn-sm btn-outline-primary">Sci-Fi</a>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-body">
                    <h5><code>GET /api/movies/:title</code></h5>
                    <p class="mb-0">Get movie details including cast</p>
                    <div class="mt-2">
                      <a href="/api/movies/The%20Matrix" class="btn btn-sm btn-outline-primary">The Matrix</a>
                      <a href="/api/movies/Inception" class="btn btn-sm btn-outline-primary">Inception</a>
                    </div>
                  </div>
                </div>
                <div class="card mb-3">
                  <div class="card-body">
                    <h5><code>GET /api/movies/:title/recommendations</code></h5>
                    <p class="mb-0">Get recommended movies</p>
                    <div class="mt-2">
                      <a href="/api/movies/The%20Matrix/recommendations" class="btn btn-sm btn-outline-primary">Matrix Recs</a>
                      <a href="/api/movies/Interstellar/recommendations" class="btn btn-sm btn-outline-primary">Interstellar Recs</a>
                    </div>
                  </div>
                </div>
                <div class="card mb-3">
                  <div class="card-body">
                    <h5><code>GET /api/search?q=query</code></h5>
                    <p class="mb-0">Search movies by title</p>
                    <div class="mt-2">
                      <a href="/api/search?q=dark" class="btn btn-sm btn-outline-primary">Search "dark"</a>
                      <a href="/api/search?q=inter" class="btn btn-sm btn-outline-primary">Search "inter"</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('Error rendering dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
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