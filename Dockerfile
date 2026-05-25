FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

#expose port
EXPOSE 3000

# Start command
CMD ["node", "server/index.js"]
