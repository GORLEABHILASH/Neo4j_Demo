// Updated version of neo4j.js with improved error handling and debugging
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
    try {
      logger.info(`Connecting to Neo4j at ${uri} with user ${user}`);
      
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
        // Changed to false to better handle integers
        disableLosslessIntegers: false, 
        logging: neo4j.logging.console('warn')
      });

      // Register a shutdown hook for graceful closure of the driver
      process.on('exit', () => {
        if (driver) {
          driver.close();
        }
      });

      logger.info(`Successfully connected to Neo4j at ${uri}`);
    } catch (error) {
      logger.error(`Failed to connect to Neo4j at ${uri}:`, error);
      throw new Error(`Neo4j connection error: ${error.message}`);
    }
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
    // Log query for debugging (remove in production)
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Running query: ${query} with params:`, params);
    }
    
    const result = await session.run(query, params);
    
    // Debug the result shape if needed
    if (process.env.NODE_ENV === 'development' && query.includes('MATCH (g:Genre)')) {
      logger.debug(`Query result contains ${result.records.length} records`);
      if (result.records.length > 0) {
        logger.debug('First record keys:', result.records[0].keys);
      }
    }
    
    return result;
  } catch (error) {
    logger.error(`Error running query: ${query}`, error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Helper function to ensure Neo4j integers are handled properly
 * @param {object} value - Value that might be a Neo4j Integer
 * @returns {number|object} - JavaScript number or original object
 */
export function safeInt(value) {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }
  return value;
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

/**
 * Test the Neo4j connection and log the result
 */
export async function testConnection() {
  const session = getDriver().session();
  try {
    const result = await session.run('RETURN 1 as test');
    logger.info('Neo4j connection test successful:', result.records[0].get('test'));
    return true;
  } catch (error) {
    logger.error('Neo4j connection test failed:', error);
    return false;
  } finally {
    await session.close();
  }
}