FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --include=dev --engine-strict=false

COPY . .

RUN npx prisma generate && npm run build

RUN npm prune --omit=dev --engine-strict=false && npm cache clean --force

CMD ["npm", "run", "docker-start"]
