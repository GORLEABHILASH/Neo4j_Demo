import { Router } from 'express';
import { runQuery } from './neo4j.js';
import { logger } from './utils/logger.js';

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

export default router;