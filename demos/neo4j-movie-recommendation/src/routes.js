// Updated version of routes.js with enhanced error handling and debugging
import { Router } from 'express';
import { runQuery, safeInt } from './neo4j.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './utils/seed.js';

const router = Router();

/**
 * Get all movie genres
 */
router.get('/genres', async (req, res, next) => {
  try {
    logger.info('Fetching all genres');
    
    // First, check if any genres exist
    const countResult = await runQuery('MATCH (g:Genre) RETURN count(g) as count');
    const genreCount = safeInt(countResult.records[0].get('count'));
    
    if (genreCount === 0) {
      logger.warn('No genres found in database, checking if database needs seeding');
      
      // Check if the entire database is empty
      const totalResult = await runQuery('MATCH (n) RETURN count(n) as count');
      const totalCount = safeInt(totalResult.records[0].get('count'));
      
      if (totalCount === 0) {
        logger.info('Database is empty, triggering seeding');
        try {
          await seedDatabase();
          logger.info('Database seeded successfully');
        } catch (seedError) {
          logger.error('Error seeding database:', seedError);
          return res.status(500).json({ error: 'Failed to seed database', details: seedError.message });
        }
      } else {
        logger.warn('Database has nodes but no genres, possible data corruption');
      }
    }
    
    // Fetch genres (now that database should have data)
    const result = await runQuery(
      'MATCH (g:Genre) RETURN g.name AS name ORDER BY g.name'
    );
    
    // Debug log
    logger.debug(`Found ${result.records.length} genres`);
    
    const genres = result.records.map(record => record.get('name'));
    
    // If still empty, return an error
    if (genres.length === 0) {
      logger.error('No genres found after attempted seeding');
      return res.status(500).json({ 
        error: 'No genres available',
        message: 'The database seems to have issues with genre data'
      });
    }
    
    res.json({ genres });
  } catch (error) {
    logger.error('Error in /genres endpoint:', error);
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
    
    logger.info(`Fetching movies for genre: ${genre}, limit: ${limit}, skip: ${skip}`);
    
    // Verify that the genre exists
    const genreCheck = await runQuery(
      'MATCH (g:Genre {name: $genre}) RETURN g',
      { genre }
    );
    
    if (genreCheck.records.length === 0) {
      logger.warn(`Genre not found: ${genre}`);
      return res.status(404).json({ error: `Genre '${genre}' not found` });
    }
    
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
      released: safeInt(record.get('released')),
      tagline: record.get('tagline'),
      posterImage: record.get('posterImage')
    }));
    
    logger.debug(`Found ${movies.length} movies for genre: ${genre}`);
    
    res.json({ movies });
  } catch (error) {
    logger.error(`Error in /movies/by-genre/${req.params.genre} endpoint:`, error);
    next(error);
  }
});

/**
 * Get movie details including cast
 */
router.get('/movies/:title', async (req, res, next) => {
  try {
    const { title } = req.params;
    
    logger.info(`Fetching details for movie: ${title}`);
    
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
      logger.warn(`Movie not found: ${title}`);
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    const movieData = result.records[0].get('movie');
    
    // Format the movie data
    const movie = {
      title: movieData.title,
      released: safeInt(movieData.released),
      tagline: movieData.tagline,
      posterImage: movieData.poster_image,
      genres: movieData.genres,
      cast: movieData.cast.filter(actor => actor.name != null)
    };
    
    res.json({ movie });
  } catch (error) {
    logger.error(`Error in /movies/${req.params.title} endpoint:`, error);
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
    
    logger.info(`Fetching recommendations for movie: ${title}, limit: ${limit}`);
    
    // First, verify if the movie exists
    const movieCheck = await runQuery(
      'MATCH (m:Movie {title: $title}) RETURN m',
      { title }
    );
    
    if (movieCheck.records.length === 0) {
      logger.warn(`Movie not found for recommendations: ${title}`);
      return res.status(404).json({ error: 'Movie not found' });
    }
    
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
      released: safeInt(record.get('released')),
      tagline: record.get('tagline'),
      posterImage: record.get('posterImage'),
      commonGenres: safeInt(record.get('commonGenres')),
      actors: record.get('actors')
    }));
    
    logger.debug(`Found ${recommendations.length} recommendations for: ${title}`);
    
    res.json({ recommendations });
  } catch (error) {
    logger.error(`Error in /movies/${req.params.title}/recommendations endpoint:`, error);
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
    
    logger.info(`Searching movies with query: ${q}, limit: ${limit}`);
    
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
      released: safeInt(record.get('released')),
      tagline: record.get('tagline'),
      posterImage: record.get('posterImage')
    }));
    
    logger.debug(`Found ${movies.length} movies for search query: ${q}`);
    
    res.json({ movies });
  } catch (error) {
    logger.error(`Error in /search endpoint with query ${req.query.q}:`, error);
    next(error);
  }
});

export default router;

//