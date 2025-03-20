// Save this as neo4j-test.js in your project directory
import { getDriver, runQuery } from './neo4j.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './utils/seed.js';

async function testNeo4jConnection() {
  try {
    console.log('Testing Neo4j connection...');
    
    // Test basic connectivity
    const testResult = await runQuery('RETURN 1 as test');
    console.log('Connection test result:', testResult.records[0].get('test'));
    
    // Check if any data exists
    const countResult = await runQuery('MATCH (n) RETURN count(n) as count');
    const count = countResult.records[0].get('count');
    console.log('Total nodes in database:', count);
    
    if (count === 0) {
      console.log('Database is empty, running seed function...');
      try {
        await seedDatabase();
        console.log('Database seeded successfully');
        
        // Verify that seeding worked
        const verifyMovies = await runQuery('MATCH (m:Movie) RETURN count(m) as count');
        console.log('Movies after seeding:', verifyMovies.records[0].get('count'));
        
        const verifyGenres = await runQuery('MATCH (g:Genre) RETURN count(g) as count');
        console.log('Genres after seeding:', verifyGenres.records[0].get('count'));
        
        const verifyPeople = await runQuery('MATCH (p:Person) RETURN count(p) as count');
        console.log('People after seeding:', verifyPeople.records[0].get('count'));
        
        // Show sample data
        const sampleMovies = await runQuery('MATCH (m:Movie) RETURN m.title LIMIT 3');
        console.log('Sample movies:', sampleMovies.records.map(r => r.get('m.title')));
        
        const sampleGenres = await runQuery('MATCH (g:Genre) RETURN g.name LIMIT 3');
        console.log('Sample genres:', sampleGenres.records.map(r => r.get('g.name')));
      } catch (error) {
        console.error('Error seeding database:', error);
      }
    } else {
      // Database has data, show statistics
      const movieCount = await runQuery('MATCH (m:Movie) RETURN count(m) as count');
      console.log('Movies in database:', movieCount.records[0].get('count'));
      
      const genreCount = await runQuery('MATCH (g:Genre) RETURN count(g) as count');
      console.log('Genres in database:', genreCount.records[0].get('count'));
      
      const peopleCount = await runQuery('MATCH (p:Person) RETURN count(p) as count');
      console.log('People in database:', peopleCount.records[0].get('count'));
      
      // Sample genre data - exactly what your API would return
      const genreResult = await runQuery('MATCH (g:Genre) RETURN g.name AS name ORDER BY g.name LIMIT 5');
      console.log('Sample genres (as API would return):', genreResult.records.map(record => record.get('name')));
      
      // Check if genres have relationships
      const genreRelCount = await runQuery('MATCH (:Movie)-[r:IN_GENRE]->(:Genre) RETURN count(r) as count');
      console.log('Movie-Genre relationships:', genreRelCount.records[0].get('count'));
      
      // Check if a specific genre returns movies
      if (genreResult.records.length > 0) {
        const firstGenre = genreResult.records[0].get('name');
        const genreMoviesResult = await runQuery(
          `MATCH (m:Movie)-[:IN_GENRE]->(g:Genre)
           WHERE g.name = $genre
           RETURN m.title AS title LIMIT 3`,
          { genre: firstGenre }
        );
        console.log(`Movies in genre "${firstGenre}":`, genreMoviesResult.records.map(r => r.get('title')));
      }
    }
    
    // Check Neo4j connection details
    const driver = getDriver();
    console.log('Neo4j connection URI:', driver._connectionProvider._address);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testNeo4jConnection();