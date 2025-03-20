# FROM node:18-alpine as builder

# WORKDIR /app

# # Copy package.json and package-lock.json
# COPY package*.json ./

# # Install dependencies
# RUN npm ci

# # Copy the rest of the code
# COPY . .

# # Build the application
# RUN npm run build

# # Production stage
# FROM node:18-alpine

# WORKDIR /app

# # Copy built assets from the builder stage
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules
# COPY package.json ./

# # Set environment variables
# ENV NODE_ENV=production

# # Expose the application port
# EXPOSE 8080

# # Start the application
# CMD ["npm", "start"]

FROM node:18-alpine as builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the entire project
COPY . .

# Copy assets to ensure they're included in the build
COPY src/assets ./src/assets

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built assets from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/assets ./src/assets
COPY package.json ./

# Set environment variables
ENV NODE_ENV=production

# Expose the application port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]