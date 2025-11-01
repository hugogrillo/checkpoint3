# Multi-stage Dockerfile for UniFIAP Pay API
# Build stage
FROM node:18-alpine AS build
WORKDIR /app

# copy package files and install production dependencies
# note: COPY paths are relative to the build context; use src/ inside context
COPY src/package*.json ./
RUN npm install --production

# copy source
COPY src/ ./

# Production image (slim)
FROM node:18-alpine

# create non-root user
RUN addgroup -S appgroup && adduser -S -G appgroup -s /bin/sh appuser
WORKDIR /app

# copy production deps and source from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app .

# ensure non-root
USER 1000

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
