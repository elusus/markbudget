FROM node:20-alpine
WORKDIR /app
COPY package.json /app/package.json
RUN npm install --legacy-peer-deps || true
COPY . /app
EXPOSE 3000
CMD ["sh", "-c", "npm install --legacy-peer-deps && npm run dev"]
