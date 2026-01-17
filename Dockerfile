# Stage 1: Build the React client
FROM node:20-slim AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Setup the Server
FROM node:20-slim
WORKDIR /app

# Install server dependencies
COPY server/package*.json ./
RUN npm ci --only=production

# Copy server code
COPY server/ ./

# Copy built client assets from Stage 1
COPY --from=client-builder /app/client/dist ./public

# Use PORT environment variable
ENV PORT=8000
EXPOSE 8000

# Start the server using shell form to ensure variable expansion
CMD sh -c "node server.js"
