import { runQuery } from '../neo4j.js';
import { logger } from './logger.js';

// Sample movie data for seeding the database
const sampleData = {
  movies: [
    {
      title: "The Matrix",
      released: 1999,
      tagline: "Welcome to the Real World",
      poster_image: "https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDRhXkEyXkFqcGc@._V1_.jpg",
      genres: ["Action", "Science Fiction"],
      cast: [
        { name: "Keanu Reeves", roles: ["Neo"], profile_image: "https://image.tmdb.org/t/p/w500/rRdru6REr9i3WIHv2mntpcgxnoY.jpg" },
        { name: "Laurence Fishburne", roles: ["Morpheus"], profile_image: "https://image.tmdb.org/t/p/w500/8suOhUmPbfKqDT9UrL9ixJfsHkd.jpg" },
        { name: "Carrie-Anne Moss", roles: ["Trinity"], profile_image: "https://image.tmdb.org/t/p/w500/xFd534yMDmBesta7XM0OxXDSu4z.jpg" }
      ]
    },
    {
      title: "Inception",
      released: 2010,
      tagline: "Your mind is the scene of the crime",
      poster_image: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg",
      genres: ["Action", "Science Fiction", "Adventure"],
      cast: [
        { name: "Leonardo DiCaprio", roles: ["Cobb"], profile_image: "https://image.tmdb.org/t/p/w500/wo2hJpn04vbtmh0B9utCFdsQhxM.jpg" },
        { name: "Joseph Gordon-Levitt", roles: ["Arthur"], profile_image: "https://image.tmdb.org/t/p/w500/z9gUY7KyEZZ8vBj6UiPj9Lk5zWg.jpg" },
        { name: "Ellen Page", roles: ["Ariadne"], profile_image: "https://image.tmdb.org/t/p/w500/6NsMbJXRlDZuDzatN2akFdGuTvx.jpg" }
      ]
    },
    {
      title: "The Dark Knight",
      released: 2008,
      tagline: "Why So Serious?",
      poster_image: "https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_.jpg",
      genres: ["Action", "Crime", "Drama", "Thriller"],
      cast: [
        { name: "Christian Bale", roles: ["Bruce Wayne"], profile_image: "https://image.tmdb.org/t/p/w500/2FaYpBQ4o2P8po2w5UDK5TrYVbc.jpg" },
        { name: "Heath Ledger", roles: ["Joker"], profile_image: "https://image.tmdb.org/t/p/w500/5Y9HnYYa9jF4NunY9lSgJGjSe8Z.jpg" },
        { name: "Aaron Eckhart", roles: ["Harvey Dent"], profile_image: "https://image.tmdb.org/t/p/w500/r8MZiSjG3KKleKhqZ4uHKGqsJFR.jpg" }
      ]
    },
    {
      title: "Interstellar",
      released: 2014,
      tagline: "Mankind was born on Earth. It was never meant to die here.",
      poster_image: "https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg",
      genres: ["Adventure", "Drama", "Science Fiction"],
      cast: [
        { name: "Matthew McConaughey", roles: ["Cooper"], profile_image: "https://image.tmdb.org/t/p/w500/e9ZHRY5toiBZCIPEEyvOG9A8ers.jpg" },
        { name: "Anne Hathaway", roles: ["Brand"], profile_image: "https://image.tmdb.org/t/p/w500/tLelKoPm7wVEGpjUx34U9qdJHUh.jpg" },
        { name: "Jessica Chastain", roles: ["Murph"], profile_image: "https://image.tmdb.org/t/p/w500/lCiGZQYR9UkCsjpvzNcJRFpByd.jpg" }
      ]
    },
    {
      title: "The Avengers",
      released: 2012,
      tagline: "Some assembly required",
      poster_image: "https://m.media-amazon.com/images/M/MV5BNGE0YTVjNzUtNzJjOS00NGNlLTgxMzctZTY4YTE1Y2Y1ZTU4XkEyXkFqcGc@._V1_.jpg",
      genres: ["Action", "Adventure", "Science Fiction"],
      cast: [
        { name: "Robert Downey Jr.", roles: ["Tony Stark"], profile_image: "https://image.tmdb.org/t/p/w500/5qHNjhtjMD4YWH3UP0rm4tKwxCL.jpg" },
        { name: "Chris Evans", roles: ["Steve Rogers"], profile_image: "https://image.tmdb.org/t/p/w500/3bOGNsHlrswhyW79uvIHH1V43JI.jpg" },
        { name: "Mark Ruffalo", roles: ["Bruce Banner"], profile_image: "https://image.tmdb.org/t/p/w500/z3dvKqMNT9F3C0sHFXFhj7gDMqS.jpg" }
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
           ON CREATE SET p.profile_image = $profile_image
           WITH p
           MATCH (m:Movie {title: $title})
           MERGE (p)-[:ACTED_IN {roles: $roles}]->(m)`,
          {
            name: actor.name,
            profile_image: actor.profile_image,
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