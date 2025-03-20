import neo4j from 'neo4j-driver';
import { logger } from './utils/logger.js';

// Neo4j connection details from environment variables
const uri = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

let driver;

/**
 * Get Neo4j driver instance
 * @returns {neo4j.Driver}
 */
export function getDriver() {
  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
      disableLosslessIntegers: true,
      logging: neo4j.logging.console('warn')
    });

    // Register a shutdown hook for graceful closure of the driver
    process.on('exit', () => {
      if (driver) {
        driver.close();
      }
    });

    logger.info(`Connected to Neo4j at ${uri}`);
  }
  return driver;
}

/**
 * Run a Cypher query and return the results
 * @param {string} query - Cypher query
 * @param {object} params - Parameters for the query
 * @returns {Promise<object>} - Query results
 */
export async function runQuery(query, params = {}) {
  const driver = getDriver();
  const session = driver.session();
  
  try {
    const result = await session.run(query, params);
    return result;
  } catch (error) {
    logger.error(`Error running query: ${query}`, error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Close the Neo4j driver
 */
export async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
    logger.info('Neo4j driver closed');
  }
}