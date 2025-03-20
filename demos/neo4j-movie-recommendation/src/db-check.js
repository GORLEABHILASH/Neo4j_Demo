// Add this to your codebase temporarily to check the Neo4j database
// You can create this as a separate file (e.g., db-check.js) and run it with Node
// Or you can add it to a route in your Express app

import { runQuery } from './neo4j.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './utils/seed.js';

async function checkDatabase() {
  try {
    console.log('Checking Neo4j database...');
    
    // Check if any nodes exist at all
    const nodeCountResult = await runQuery('MATCH (n) RETURN count(n) as count');
    const nodeCount = nodeCountResult.records[0].get('count').toNumber();
    console.log(`Total node count: ${nodeCount}`);
    
    if (nodeCount === 0) {
      console.log('Database is empty. Running seed function...');
      try {
        await seedDatabase();
        console.log('Database seeded successfully');
      } catch (seedError) {
        console.error('Error seeding database:', seedError);
      }
      return;
    }
    
    // Check Movie nodes
    const movieCountResult = await runQuery('MATCH (m:Movie) RETURN count(m) as count');
    const movieCount = movieCountResult.records[0].get('count').toNumber();
    console.log(`Movie count: ${movieCount}`);
    
    if (movieCount > 0) {
      // List some movies
      const moviesResult = await runQuery('MATCH (m:Movie) RETURN m.title LIMIT 5');
      console.log('Sample movies:', moviesResult.records.map(record => record.get('m.title')));
    }
    
    // Check Person nodes
    const personCountResult = await runQuery('MATCH (p:Person) RETURN count(p) as count');
    const personCount = personCountResult.records[0].get('count').toNumber();
    console.log(`Person count: ${personCount}`);
    
    if (personCount > 0) {
      // List some people
      const peopleResult = await runQuery('MATCH (p:Person) RETURN p.name LIMIT 5');
      console.log('Sample people:', peopleResult.records.map(record => record.get('p.name')));
    }
    
    // Check Genre nodes
    const genreCountResult = await runQuery('MATCH (g:Genre) RETURN count(g) as count');
    const genreCount = genreCountResult.records[0].get('count').toNumber();
    console.log(`Genre count: ${genreCount}`);
    
    if (genreCount > 0) {
      // List all genres
      const genresResult = await runQuery('MATCH (g:Genre) RETURN g.name');
      console.log('All genres:', genresResult.records.map(record => record.get('g.name')));
    }
    
    // Check relationships
    const relCountResult = await runQuery('MATCH ()-[r]->() RETURN count(r) as count');
    const relCount = relCountResult.records[0].get('count').toNumber();
    console.log(`Relationship count: ${relCount}`);
    
    // Check Neo4j connection details
    const neo4jConnectionDetails = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j'
    };
    console.log('Neo4j connection details:', neo4jConnectionDetails);
    
  } catch (error) {
    console.error('Error checking database:', error);
  }
}

// Run the check
checkDatabase();

export { checkDatabase };