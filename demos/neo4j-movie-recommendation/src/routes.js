import { Router } from 'express';
import { runQuery } from './neo4j.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './utils/seed.js';

const router = Router();

/**
 * Get all movie genres
 */
router.get('/genres', async (req, res, next) => {
  try {
    const result = await runQuery(
      'MATCH (g:Genre) RETURN g.name AS name ORDER BY g.name'
    );
    
    const genres = result.records.map(record => record.get('name'));
    res.json({ genres });
  } catch (error) {
    next(error);
  }
});

/**
 * Get movies by genre
 */
router.get('/movies/by-genre/:genre', async (req, res, next) => {
  try {
    const { genre } = req.params;
    const { limit = 10, skip = 0 } = req.query;
    
    const result = await runQuery(
      `MATCH (m:Movie)-[:IN_GENRE]->(g:Genre)
       WHERE g.name = $genre
       RETURN m.title AS title, m.released AS released, m.tagline AS tagline,
              m.poster_image AS posterImage
       ORDER BY m.released DESC
       SKIP $skip LIMIT $limit`,
      { genre, skip: parseInt(skip), limit: parseInt(limit) }
    );
    
    const movies = result.records.map(record => ({
      title: record.get('title'),
      released: record.get('released'),
      tagline: record.get('tagline'),
      posterImage: record.get('posterImage')
    }));
    
    res.json({ movies });
  } catch (error) {
    next(error);
  }
});

/**
 * Get movie details including cast
 */
router.get('/movies/:title', async (req, res, next) => {
  try {
    const { title } = req.params;
    
    const result = await runQuery(
      `MATCH (m:Movie {title: $title})
       OPTIONAL MATCH (m)-[:IN_GENRE]->(g:Genre)
       OPTIONAL MATCH (p:Person)-[r:ACTED_IN]->(m)
       RETURN m {
         .title, .released, .tagline, .poster_image,
         genres: collect(DISTINCT g.name),
         cast: collect(DISTINCT {
           name: p.name,
           role: r.roles,
           profile_image: p.profile_image
         })
       } AS movie`,
      { title }
    );
    
    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    const movieData = result.records[0].get('movie');
    
    // Format the movie data
    const movie = {
      title: movieData.title,
      released: movieData.released,
      tagline: movieData.tagline,
      posterImage: movieData.poster_image,
      genres: movieData.genres,
      cast: movieData.cast.filter(actor => actor.name != null)
    };
    
    res.json({ movie });
  } catch (error) {
    next(error);
  }
});

/**
 * Get recommended movies based on a movie
 */
router.get('/movies/:title/recommendations', async (req, res, next) => {
  try {
    const { title } = req.params;
    const { limit = 5 } = req.query;
    
    const result = await runQuery(
      `MATCH (m:Movie {title: $title})-[:IN_GENRE]->(g:Genre)<-[:IN_GENRE]-(rec:Movie)
       WHERE m <> rec
       WITH rec, COUNT(g) AS commonGenres
       MATCH (rec)<-[:ACTED_IN]-(a:Person)
       WITH rec, commonGenres, COLLECT(a.name) AS actors
       RETURN rec.title AS title, rec.released AS released,
              rec.tagline AS tagline, rec.poster_image AS posterImage,
              commonGenres, actors
       ORDER BY commonGenres DESC, rec.released DESC
       LIMIT $limit`,
      { title, limit: parseInt(limit) }
    );
    
    const recommendations = result.records.map(record => ({
      title: record.get('title'),
      released: record.get('released'),
      tagline: record.get('tagline'),
      posterImage: record.get('posterImage'),
      commonGenres: record.get('commonGenres').toNumber(),
      actors: record.get('actors')
    }));
    
    res.json({ recommendations });
  } catch (error) {
    next(error);
  }
});

/**
 * Search movies by title
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const result = await runQuery(
      `MATCH (m:Movie)
       WHERE m.title =~ $searchPattern
       RETURN m.title AS title, m.released AS released,
              m.tagline AS tagline, m.poster_image AS posterImage
       ORDER BY m.released DESC
       LIMIT $limit`,
      { searchPattern: `(?i).*${q}.*`, limit: parseInt(limit) }
    );
    
    const movies = result.records.map(record => ({
      title: record.get('title'),
      released: record.get('released'),
      tagline: record.get('tagline'),
      posterImage: record.get('posterImage')
    }));
    
    res.json({ movies });
  } catch (error) {
    next(error);
  }
});

// Add this route to your Express app to check database status via the web

// Add this import at the top of your index.js or routes.js file


// Add this route after your other routes
app.get('/db-status', async (req, res) => {
  try {
    const status = {
      database: 'Checking...',
      counts: {
        movies: 0,
        people: 0,
        genres: 0,
        relationships: 0
      },
      samples: {
        movies: [],
        people: [],
        genres: []
      },
      connectionDetails: {
        uri: process.env.NEO4J_URI || 'bolt://neo4j:7687',
        user: process.env.NEO4J_USER || 'neo4j'
      }
    };
    
    // Check if any nodes exist
    const nodeCountResult = await runQuery('MATCH (n) RETURN count(n) as count');
    const nodeCount = nodeCountResult.records[0].get('count').toNumber();
    status.database = nodeCount > 0 ? 'Data found' : 'Empty';
    
    // If database is empty, offer seeding option
    if (nodeCount === 0) {
      if (req.query.seed === 'true') {
        try {
          await seedDatabase();
          status.database = 'Seeded successfully';
          
          // Refresh counts after seeding
          const refreshMovieCount = await runQuery('MATCH (m:Movie) RETURN count(m) as count');
          status.counts.movies = refreshMovieCount.records[0].get('count').toNumber();
          
          const refreshPersonCount = await runQuery('MATCH (p:Person) RETURN count(p) as count');
          status.counts.people = refreshPersonCount.records[0].get('count').toNumber();
          
          const refreshGenreCount = await runQuery('MATCH (g:Genre) RETURN count(g) as count');
          status.counts.genres = refreshGenreCount.records[0].get('count').toNumber();
          
          const refreshRelCount = await runQuery('MATCH ()-[r]->() RETURN count(r) as count');
          status.counts.relationships = refreshRelCount.records[0].get('count').toNumber();
        } catch (seedError) {
          status.database = 'Seeding failed';
          status.error = seedError.message;
        }
      } else {
        status.database = 'Empty - add ?seed=true to URL to seed database';
      }
    } else {
      // Get counts
      const movieCountResult = await runQuery('MATCH (m:Movie) RETURN count(m) as count');
      status.counts.movies = movieCountResult.records[0].get('count').toNumber();
      
      const personCountResult = await runQuery('MATCH (p:Person) RETURN count(p) as count');
      status.counts.people = personCountResult.records[0].get('count').toNumber();
      
      const genreCountResult = await runQuery('MATCH (g:Genre) RETURN count(g) as count');
      status.counts.genres = genreCountResult.records[0].get('count').toNumber();
      
      const relCountResult = await runQuery('MATCH ()-[r]->() RETURN count(r) as count');
      status.counts.relationships = relCountResult.records[0].get('count').toNumber();
      
      // Get samples
      if (status.counts.movies > 0) {
        const moviesResult = await runQuery('MATCH (m:Movie) RETURN m.title LIMIT 5');
        status.samples.movies = moviesResult.records.map(record => record.get('m.title'));
      }
      
      if (status.counts.people > 0) {
        const peopleResult = await runQuery('MATCH (p:Person) RETURN p.name LIMIT 5');
        status.samples.people = peopleResult.records.map(record => record.get('p.name'));
      }
      
      if (status.counts.genres > 0) {
        const genresResult = await runQuery('MATCH (g:Genre) RETURN g.name');
        status.samples.genres = genresResult.records.map(record => record.get('g.name'));
      }
    }
    
    // Return as JSON and also render as HTML
    if (req.query.format === 'json') {
      res.json(status);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Neo4j Database Status</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1 {
              color: #2A2C34;
              border-bottom: 2px solid #018BFF;
              padding-bottom: 10px;
            }
            .status {
              font-size: 1.2em;
              margin-bottom: 20px;
              padding: 10px;
              border-radius: 5px;
            }
            .empty {
              background-color: #fff3cd;
              border: 1px solid #ffeeba;
            }
            .seeded {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
            }
            .found {
              background-color: #d1ecf1;
              border: 1px solid #bee5eb;
            }
            .error {
              background-color: #f8d7da;
              border: 1px solid #f5c6cb;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th, td {
              padding: 12px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #f2f2f2;
            }
            .btn {
              display: inline-block;
              padding: 10px 15px;
              background-color: #018BFF;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              font-weight: bold;
              margin-top: 20px;
            }
            .btn:hover {
              background-color: #0056b3;
            }
            .sample-list {
              background-color: #f9f9f9;
              padding: 10px;
              border-radius: 5px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <h1>Neo4j Database Status</h1>
          
          <div class="status ${status.database.includes('Empty') ? 'empty' : status.database.includes('Seeded') ? 'seeded' : status.database.includes('failed') ? 'error' : 'found'}">
            Status: ${status.database}
            ${status.error ? `<div class="error">Error: ${status.error}</div>` : ''}
            ${status.database.includes('Empty') ? `<a href="?seed=true" class="btn">Seed Database</a>` : ''}
          </div>
          
          <h2>Database Counts</h2>
          <table>
            <tr>
              <th>Category</th>
              <th>Count</th>
            </tr>
            <tr>
              <td>Movies</td>
              <td>${status.counts.movies}</td>
            </tr>
            <tr>
              <td>People</td>
              <td>${status.counts.people}</td>
            </tr>
            <tr>
              <td>Genres</td>
              <td>${status.counts.genres}</td>
            </tr>
            <tr>
              <td>Relationships</td>
              <td>${status.counts.relationships}</td>
            </tr>
          </table>
          
          ${status.samples.movies.length > 0 ? `
            <h2>Sample Data</h2>
            
            <h3>Movies (Top 5)</h3>
            <div class="sample-list">
              <ul>
                ${status.samples.movies.map(movie => `<li>${movie}</li>`).join('')}
              </ul>
            </div>
            
            <h3>People (Top 5)</h3>
            <div class="sample-list">
              <ul>
                ${status.samples.people.map(person => `<li>${person}</li>`).join('')}
              </ul>
            </div>
            
            <h3>Genres</h3>
            <div class="sample-list">
              <ul>
                ${status.samples.genres.map(genre => `<li>${genre}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          <h2>Connection Details</h2>
          <table>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Neo4j URI</td>
              <td>${status.connectionDetails.uri}</td>
            </tr>
            <tr>
              <td>Neo4j User</td>
              <td>${status.connectionDetails.user}</td>
            </tr>
          </table>
          
          <p><a href="?format=json" class="btn">View as JSON</a></p>
          <p><a href="/" class="btn">Back to Dashboard</a></p>
        </body>
        </html>
      `);
    }
  } catch (error) {
    logger.error('Error in database status route:', error);
    res.status(500).json({
      status: 'Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? '(hidden in production)' : error.stack
    });
  }
});

export default router;