FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
