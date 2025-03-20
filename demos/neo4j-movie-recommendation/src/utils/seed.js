import { runQuery } from '../neo4j.js';
import { logger } from './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample movie data for seeding the database
const sampleData = {
  movies: [
    {
      title: "The Matrix",
      released: 1999,
      tagline: "Welcome to the Real World",
      poster_image: path.join(__dirname, '..', 'src', 'assets', 'matrix.jpg'),
      genres: ["Action", "Science Fiction"],
      cast: [
        { name: "Keanu Reeves", roles: ["Neo"] },
        { name: "Laurence Fishburne", roles: ["Morpheus"] },
        { name: "Carrie-Anne Moss", roles: ["Trinity"] }
      ]
    },
    {
      title: "Inception",
      released: 2010,
      tagline: "Your mind is the scene of the crime",
      poster_image: path.join(__dirname, '..', 'src', 'assets', 'inception.jpg'),
      genres: ["Action", "Science Fiction", "Adventure"],
      cast: [
        { name: "Leonardo DiCaprio", roles: ["Cobb"] },
        { name: "Joseph Gordon-Levitt", roles: ["Arthur"] },
        { name: "Ellen Page", roles: ["Ariadne"] }
      ]
    },
    {
      title: "The Dark Knight",
      released: 2008,
      tagline: "Why So Serious?",
      poster_image: path.join(__dirname, '..', 'src', 'assets', 'dark-knight.jpg'),
      genres: ["Action", "Crime", "Drama", "Thriller"],
      cast: [
        { name: "Christian Bale", roles: ["Bruce Wayne"] },
        { name: "Heath Ledger", roles: ["Joker"] },
        { name: "Aaron Eckhart", roles: ["Harvey Dent"] }
      ]
    },
    {
      title: "Interstellar",
      released: 2014,
      tagline: "Mankind was born on Earth. It was never meant to die here.",
      poster_image: path.join(__dirname, '..', 'src', 'assets', 'interstellar.jpg'),
      genres: ["Adventure", "Drama", "Science Fiction"],
      cast: [
        { name: "Matthew McConaughey", roles: ["Cooper"] },
        { name: "Anne Hathaway", roles: ["Brand"] },
        { name: "Jessica Chastain", roles: ["Murph"] }
      ]
    },
    {
      title: "The Avengers",
      released: 2012,
      tagline: "Some assembly required",
      poster_image: path.join(__dirname, '..', 'src', 'assets', 'avengers.jpg'),
      genres: ["Action", "Adventure", "Science Fiction"],
      cast: [
        { name: "Robert Downey Jr.", roles: ["Tony Stark"] },
        { name: "Chris Evans", roles: ["Steve Rogers"] },
        { name: "Mark Ruffalo", roles: ["Bruce Banner"] }
      ]
    }
  ]
};

/**
 * Seed the database with sample data
 */
export async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');
    
    // First, make sure the database is empty
    await runQuery('MATCH (n) DETACH DELETE n');
    
    // Create constraints and indexes
    await runQuery('CREATE CONSTRAINT movie_title IF NOT EXISTS FOR (m:Movie) REQUIRE m.title IS UNIQUE');
    await runQuery('CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE');
    await runQuery('CREATE CONSTRAINT genre_name IF NOT EXISTS FOR (g:Genre) REQUIRE g.name IS UNIQUE');
    
    // Insert the data
    for (const movie of sampleData.movies) {
      // Create movie node
      await runQuery(
        `CREATE (m:Movie {
          title: $title,
          released: $released,
          tagline: $tagline,
          poster_image: $poster_image
        })`,
        {
          title: movie.title,
          released: movie.released,
          tagline: movie.tagline,
          poster_image: movie.poster_image
        }
      );
      
      // Create genres and relationships
      for (const genre of movie.genres) {
        await runQuery(
          `MERGE (g:Genre {name: $genre})
           WITH g
           MATCH (m:Movie {title: $title})
           MERGE (m)-[:IN_GENRE]->(g)`,
          { genre, title: movie.title }
        );
      }
      
      // Create actors and relationships
      for (const actor of movie.cast) {
        await runQuery(
          `MERGE (p:Person {name: $name})
           WITH p
           MATCH (m:Movie {title: $title})
           MERGE (p)-[:ACTED_IN {roles: $roles}]->(m)`,
          {
            name: actor.name,
            title: movie.title,
            roles: actor.roles
          }
        );
      }
    }
    
    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error('Error seeding database:', error);
    throw error;
  }
}